# apps/extensibility/services.py
"""
Template bundle import and export, plus custom attribute persistence.

A template bundle is plain JSON:

    {
      "bundle": "Morocco standard chart",
      "version": "1.0",
      "templates": {
        "configuration.FinancialRecordType": [
          {"name": "Purchase Invoice", "nature": "expense", "direction": "outbound"}
        ]
      }
    }

Import is idempotent: bundles are matched on the model's natural key (`name`,
which is unique on every importable configuration model), so re-importing the
same bundle updates rather than duplicates. That matters because the realistic
usage is importing a corrected version of a bundle already loaded.
"""

from django.apps import apps as django_apps
from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils.translation import gettext_lazy as _

from apps.extensibility.models import (
    IMPORTABLE_TEMPLATE_MODELS,
    CustomFieldDefinition,
    TemplateImportLog,
)
from apps.extensibility.validators import validate_custom_field_values

# Never importable, whatever the bundle says. Allowing these would let a
# template file forge audit trails or collide with generated references.
PROTECTED_FIELDS = frozenset(
    {
        "id",
        "reference",
        "created_at",
        "updated_at",
        "created_by",
        "updated_by",
        "archived_at",
        "archived_by",
        "is_archived",
    }
)


def _resolve_model(label):
    if label not in IMPORTABLE_TEMPLATE_MODELS:
        raise ValidationError(
            _("'%(label)s' is not an importable template model. Allowed: %(allowed)s")
            % {"label": label, "allowed": ", ".join(IMPORTABLE_TEMPLATE_MODELS)}
        )
    app_label, model_name = label.split(".")
    return django_apps.get_model(app_label, model_name)


def _assignable_fields(model):
    """Concrete, writable fields on the model, excluding protected ones."""
    names = set()
    for field in model._meta.get_fields():
        if not getattr(field, "concrete", False):
            continue
        if field.name in PROTECTED_FIELDS:
            continue
        names.add(field.name)
    return names


def _apply_template(model, payload, user):
    """Create or update a single template row. Returns 'created' or 'updated'."""
    name = payload.get("name")
    if not name:
        raise ValidationError(_("Every template entry must have a 'name'."))

    assignable = _assignable_fields(model)
    unknown = set(payload) - assignable - {"name"}
    if unknown:
        # Reject rather than ignore: a silently dropped key means the imported
        # template does not behave the way the file says it does.
        raise ValidationError(
            _("Unknown or protected fields for %(model)s: %(keys)s")
            % {"model": model.__name__, "keys": ", ".join(sorted(unknown))}
        )

    manager = getattr(model, "all_objects", model.objects)
    existing = manager.filter(name=name).first()

    if existing is None:
        instance = model(name=name, created_by=user, updated_by=user)
        for key, value in payload.items():
            if key != "name":
                setattr(instance, key, value)
        instance.full_clean(exclude=["reference"])
        instance.save()
        return "created"

    for key, value in payload.items():
        if key != "name":
            setattr(existing, key, value)
    existing.updated_by = user
    existing.full_clean(exclude=["reference"])
    existing.save()
    return "updated"


@transaction.atomic
def import_template_bundle(*, bundle, user, source="", dry_run=False):
    """Import a bundle. All or nothing.

    A partially applied bundle would leave business configuration in a state
    nobody designed, so the whole import runs in one transaction and any error
    rolls back everything.

    dry_run performs the entire import, including validation against real
    database state, then rolls back. That is far more informative than checking
    the file in isolation, because most failures depend on what is already there.
    """
    if not isinstance(bundle, dict):
        raise ValidationError(_("A template bundle must be a JSON object."))

    templates = bundle.get("templates")
    if not isinstance(templates, dict) or not templates:
        raise ValidationError(_("Bundle has no 'templates' object. Nothing would be imported."))

    summary = {"created": 0, "updated": 0, "skipped": 0, "by_model": {}}

    for label, entries in templates.items():
        model = _resolve_model(label)
        if not isinstance(entries, list):
            raise ValidationError(_("Templates for %(label)s must be a list.") % {"label": label})

        per_model = {"created": 0, "updated": 0}
        for index, payload in enumerate(entries):
            if not isinstance(payload, dict):
                raise ValidationError(
                    _("Entry %(index)d for %(label)s is not an object.")
                    % {"index": index, "label": label}
                )
            try:
                outcome = _apply_template(model, payload, user)
            except ValidationError as exc:
                raise ValidationError(
                    _("%(label)s entry '%(name)s': %(error)s")
                    % {
                        "label": label,
                        "name": payload.get("name", f"#{index}"),
                        "error": "; ".join(exc.messages),
                    }
                ) from exc
            per_model[outcome] += 1
            summary[outcome] += 1

        summary["by_model"][label] = per_model

    TemplateImportLog.objects.create(
        bundle_name=bundle.get("bundle", "unnamed bundle"),
        bundle_version=str(bundle.get("version", "")),
        source=source,
        outcome=(
            TemplateImportLog.Outcome.DRY_RUN if dry_run else TemplateImportLog.Outcome.APPLIED
        ),
        created_count=summary["created"],
        updated_count=summary["updated"],
        skipped_count=summary["skipped"],
        details=summary["by_model"],
        created_by=user,
        updated_by=user,
    )

    if dry_run:
        # Roll back everything, including the log row: a dry run must leave no
        # trace in the data it was inspecting.
        transaction.set_rollback(True)

    return summary


def export_template_bundle(*, model_labels=None, bundle_name="EFOP export", version="1.0"):
    """Export current templates as a bundle that import can consume.

    Round-tripping matters: the intended workflow is export from one
    environment, review the JSON, import into another.
    """
    labels = model_labels or list(IMPORTABLE_TEMPLATE_MODELS)
    templates = {}

    for label in labels:
        model = _resolve_model(label)
        assignable = _assignable_fields(model)
        # Relations are exported only when they are simple values; m2m and FK
        # objects are skipped rather than exported as opaque primary keys that
        # would be meaningless in another database.
        simple_fields = [
            field.name
            for field in model._meta.get_fields()
            if getattr(field, "concrete", False)
            and field.name in assignable
            and not field.is_relation
        ]
        rows = []
        for instance in model.objects.all():
            rows.append({name: getattr(instance, name) for name in simple_fields})
        templates[label] = rows

    return {"bundle": bundle_name, "version": version, "templates": templates}


def definitions_for(entity_label, include_inactive=False):
    """Active attribute definitions for an entity, in display order."""
    queryset = CustomFieldDefinition.objects.filter(entity=entity_label)
    if not include_inactive:
        queryset = queryset.filter(is_active=True)
    return list(queryset)


def set_custom_fields(*, instance, values, save=True):
    """Validate and store administrator-defined attributes on an instance.

    Merges with what is already stored so that a partial update does not erase
    attributes the caller did not mention.
    """
    entity_label = f"{instance._meta.app_label}.{instance._meta.object_name}"
    definitions = definitions_for(entity_label)
    # Financial Records add the fields frozen into their selected published
    # document-template version. Import-free duck typing avoids an app cycle.
    template = getattr(instance, "template", None)
    if template is not None and hasattr(template, "fields"):
        definitions.extend(list(template.fields.filter(is_active=True, is_archived=False)))

    merged = dict(instance.custom_fields or {})
    merged.update(values or {})

    cleaned = validate_custom_field_values(entity_label, merged, definitions)
    instance.custom_fields = cleaned

    if save:
        instance.save(update_fields=["custom_fields"])
    return instance
