# apps/extensibility/validators.py
"""
Validation and coercion for administrator-defined attribute values.

The type vocabulary intentionally matches the one already used by
PaymentMethod.extra_fields in apps/configuration/models.py, so the platform has
one idea of what "decimal" means rather than two competing ones.
"""

from datetime import datetime
from decimal import Decimal, InvalidOperation

from django.core.exceptions import ValidationError
from django.core.validators import EmailValidator, URLValidator
from django.utils.translation import gettext_lazy as _


def coerce_value(definition, value):
    """Return the value in its canonical stored form, or raise ValidationError.

    Money note: decimals are stored as STRINGS, never as JSON numbers. A JSON
    number is a float, and round-tripping 0.1 through a float is exactly how
    accounting discrepancies are created. Storing the text preserves the value
    the user typed, and callers rebuild a Decimal from it.
    """
    data_type = definition.data_type
    label = definition.label or definition.key

    if value is None or value == "":
        return None

    if data_type in ("string", "text"):
        text = str(value)
        if definition.max_length and len(text) > definition.max_length:
            raise ValidationError(
                _("%(label)s must be at most %(max)d characters.")
                % {"label": label, "max": definition.max_length}
            )
        return text

    if data_type == "integer":
        # bool is a subclass of int in Python; accepting True as 1 here would
        # quietly turn a checkbox mistake into a number.
        if isinstance(value, bool):
            raise ValidationError(_("%(label)s must be a whole number.") % {"label": label})
        try:
            return int(str(value))
        except (TypeError, ValueError):
            raise ValidationError(
                _("%(label)s must be a whole number.") % {"label": label}
            ) from None

    if data_type == "decimal":
        if isinstance(value, float):
            raise ValidationError(
                _(
                    "%(label)s must be sent as a string, not a JSON number, so "
                    "that no precision is lost."
                )
                % {"label": label}
            )
        try:
            return str(Decimal(str(value)))
        except (InvalidOperation, TypeError):
            raise ValidationError(
                _("%(label)s must be a valid decimal.") % {"label": label}
            ) from None

    if data_type == "boolean":
        if isinstance(value, bool):
            return value
        if str(value).lower() in ("true", "1", "yes"):
            return True
        if str(value).lower() in ("false", "0", "no"):
            return False
        raise ValidationError(_("%(label)s must be true or false.") % {"label": label})

    if data_type == "date":
        try:
            datetime.strptime(str(value), "%Y-%m-%d")
        except ValueError:
            raise ValidationError(
                _("%(label)s must be a date in YYYY-MM-DD format.") % {"label": label}
            ) from None
        return str(value)

    if data_type == "choice":
        if str(value) not in definition.choices:
            raise ValidationError(
                _("%(label)s must be one of: %(choices)s")
                % {"label": label, "choices": ", ".join(definition.choices)}
            )
        return str(value)

    if data_type == "multi_choice":
        if not isinstance(value, list | tuple):
            raise ValidationError(_("%(label)s must be a list of values.") % {"label": label})
        invalid = [item for item in value if str(item) not in definition.choices]
        if invalid:
            raise ValidationError(
                _("%(label)s contains invalid values: %(invalid)s")
                % {"label": label, "invalid": ", ".join(str(i) for i in invalid)}
            )
        return [str(item) for item in value]

    if data_type == "email":
        try:
            EmailValidator()(str(value))
        except ValidationError:
            raise ValidationError(
                _("%(label)s must be a valid email address.") % {"label": label}
            ) from None
        return str(value)

    if data_type == "url":
        try:
            URLValidator()(str(value))
        except ValidationError:
            raise ValidationError(_("%(label)s must be a valid URL.") % {"label": label}) from None
        return str(value)

    raise ValidationError(
        _("Unknown data type '%(type)s' on attribute %(label)s.")
        % {"type": data_type, "label": label}
    )


def validate_custom_field_values(entity_label, values, definitions):
    """Validate a whole payload of attribute values for one entity.

    Returns the cleaned dictionary. Raises ValidationError describing every
    problem at once, because fixing form errors one round-trip at a time is
    miserable.
    """
    values = values or {}
    if not isinstance(values, dict):
        raise ValidationError({"custom_fields": _("Custom fields must be an object.")})

    active = {d.key: d for d in definitions if d.is_active}
    errors = {}
    cleaned = {}

    unknown = set(values) - set(active)
    if unknown:
        # Silently dropping unknown keys would let a typo look like a save.
        errors["custom_fields"] = _("Unknown attributes for %(entity)s: %(keys)s") % {
            "entity": entity_label,
            "keys": ", ".join(sorted(unknown)),
        }

    for key, definition in active.items():
        if key in values:
            try:
                cleaned[key] = coerce_value(definition, values[key])
            except ValidationError as exc:
                errors[key] = exc.messages[0]
        elif definition.default_value not in (None, ""):
            try:
                cleaned[key] = coerce_value(definition, definition.default_value)
            except ValidationError as exc:
                errors[key] = exc.messages[0]

        if definition.is_required and cleaned.get(key) in (None, [], ""):
            errors[key] = _("%(label)s is required.") % {"label": definition.label or key}

    if errors:
        raise ValidationError(errors)

    return cleaned
