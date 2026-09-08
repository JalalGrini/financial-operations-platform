"""Shared queryset helpers for consistent archive visibility.

Callers must start from the model's ``all_objects`` manager (and may freely add
scope filters, annotations, select_related, and prefetch_related). This helper
then *filters that same queryset*; it never replaces it with a naked manager
queryset, so authorization/domain scope and performance annotations survive.
"""

from django.db import models
from django.utils.dateparse import parse_date
from rest_framework.exceptions import ValidationError

ARCHIVE_STATES = frozenset({"active", "archived", "all"})


def split_query_values(request, key: str) -> list[str]:
    """Return repeated or comma-separated query values for ``key``."""
    values = list(request.query_params.getlist(key))
    if not values:
        raw = request.query_params.get(key)
        if raw:
            values = [raw]
    out: list[str] = []
    for value in values:
        out.extend(part.strip() for part in str(value).split(",") if part.strip())
    return out


def get_archive_state(request) -> str:
    """Resolve the canonical archive state, with legacy compatibility.

    ``archive_state`` takes precedence when both parameters are supplied.
    Legacy ``is_archived=true|false`` remains accepted for older clients.
    The default is active-only.
    """
    state = request.query_params.get("archive_state")
    if state is not None:
        normalized = state.strip().lower()
        if normalized not in ARCHIVE_STATES:
            raise ValidationError({"archive_state": ["Use one of: active, archived, all."]})
        return normalized

    legacy = request.query_params.get("is_archived")
    if legacy is None:
        return "active"
    normalized_legacy = legacy.strip().lower()
    if normalized_legacy == "true":
        return "archived"
    if normalized_legacy == "false":
        return "active"
    raise ValidationError({"is_archived": ["Use true or false."]})


def apply_archive_visibility(queryset, model, request):
    """Filter an archive-aware queryset without discarding its scope.

    The explicit ``model`` argument is retained for compatibility and guards
    against accidentally passing a queryset for the wrong model.
    """
    if queryset.model is not model:
        raise TypeError(
            f"Archive queryset model {queryset.model.__name__} does not match " f"{model.__name__}."
        )

    state = get_archive_state(request)
    if state == "active":
        return queryset.filter(is_archived=False)
    if state == "archived":
        return queryset.filter(is_archived=True)
    return queryset


def apply_date_range(queryset, request, field):
    """Narrow ``queryset`` to an inclusive ``date_from``..``date_to`` window.

    Two things this does that the older hand-rolled copies did not:

    - It validates. An unparseable or impossible date raises a 400 instead of
      being ignored, because a silently dropped filter shows a *longer* list
      than the user asked for and nothing says so.
    - It adapts the lookup to the field. Comparing a DateTimeField against a
      bare date excludes everything after midnight on the closing day, so
      DateTimeFields are compared with ``__date``. That is the classic
      "the last day is missing from my export" bug.

    Absent parameters return the queryset untouched, so every existing caller
    and saved URL keeps working.
    """
    date_from = request.query_params.get("date_from")
    date_to = request.query_params.get("date_to")
    if not date_from and not date_to:
        return queryset

    model_field = queryset.model._meta.get_field(field)
    # DateTimeField subclasses DateField, so it must be tested first.
    lookup = f"{field}__date" if isinstance(model_field, models.DateTimeField) else field

    for param_name, raw, suffix in (
        ("date_from", date_from, "gte"),
        ("date_to", date_to, "lte"),
    ):
        if not raw:
            continue
        try:
            parsed = parse_date(raw.strip())
        except ValueError:
            # Well-formed but impossible, e.g. 2026-13-01: parse_date raises
            # here instead of returning None. Unhandled that is a 500 on user
            # input, so it joins the same 400 as any other bad date.
            parsed = None
        if parsed is None:
            raise ValidationError({param_name: ["Use a real date in the format YYYY-MM-DD."]})
        queryset = queryset.filter(**{f"{lookup}__{suffix}": parsed})

    return queryset
