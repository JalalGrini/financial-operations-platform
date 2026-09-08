"""Group-wide company (null) vs a specific Company row."""

from django.utils.datastructures import MultiValueDict
from django.utils.translation import gettext_lazy as _

GROUP_COMPANY_TOKEN = "all"
GROUP_COMPANY_LABEL = _("Tout le groupe")


def is_group_company(value) -> bool:
    if value is None:
        return True
    return str(value).strip().lower() in ("", GROUP_COMPANY_TOKEN)


def filter_queryset_by_company(queryset, *, field, raw):
    if raw in (None, ""):
        return queryset
    if str(raw) == GROUP_COMPANY_TOKEN:
        return queryset.filter(**{f"{field}__isnull": True})
    return queryset.filter(**{field: raw})


def company_display_name(company) -> str:
    if company is None:
        return str(GROUP_COMPANY_LABEL)
    return company.name


def coerce_company_input(data, field="company"):
    """Turn the frontend's `all` token into null before DRF UUID validation."""
    if isinstance(data, MultiValueDict):
        data = {key: data.get(key) for key in data}
    elif isinstance(data, dict):
        data = {key: data[key] for key in data}
    else:
        return data
    if field in data and is_group_company(data[field]):
        data[field] = None
    return data


class GroupCompanyInputMixin:
    """Accept `company=all` / empty string as group-wide (null)."""

    company_input_field = "company"

    def to_internal_value(self, data):
        return super().to_internal_value(
            coerce_company_input(data, field=self.company_input_field)
        )
