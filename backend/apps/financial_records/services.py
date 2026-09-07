# apps/financial_records/services.py
"""Transactional write operations for Financial Records and document templates."""

from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Max
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from apps.financial_records.models import (
    Attachment,
    FinancialDocumentTemplate,
    FinancialDocumentTemplateField,
    FinancialRecord,
    FinancialRecordLine,
)
from apps.financial_records.validators import (
    validate_can_be_posted,
    validate_line_amounts,
    validate_record_is_editable,
)

ZERO = Decimal("0.0000")


def field_definition_payload(definition, *, source="template"):
    """Canonical dynamic-field response, with explicit legacy aliases."""
    return {
        "id": str(definition.id),
        "key": definition.key,
        "name": definition.key,
        "label": definition.label,
        "data_type": definition.data_type,
        "field_type": definition.data_type,
        "is_required": definition.is_required,
        "required": definition.is_required,
        "choices": definition.choices or [],
        "default_value": definition.default_value,
        "display_order": definition.display_order,
        "section": getattr(definition, "section", ""),
        "help_text": getattr(definition, "help_text", ""),
        "max_length": getattr(definition, "max_length", None),
        "validation": getattr(definition, "validation", {}) or {},
        "source": source,
    }


def template_snapshot(template):
    """Return the immutable schema stored on every newly-created record."""
    from apps.extensibility.services import definitions_for

    global_fields = [
        field_definition_payload(field, source="global")
        for field in definitions_for("financial_records.FinancialRecord")
    ]
    if template is None:
        return {"template_id": None, "fields": global_fields}
    template_fields = [
        field_definition_payload(field)
        for field in template.fields.filter(is_active=True).order_by("display_order", "key")
    ]
    return {
        "template_id": str(template.id),
        "record_type_id": str(template.record_type_id),
        "record_type_name": template.record_type.name,
        "name": template.name,
        "version": template.version,
        "published_at": template.published_at.isoformat() if template.published_at else None,
        "fields": global_fields + template_fields,
        "output_mapping": template.output_mapping or {},
    }


def get_published_template(record_type):
    """Published default for a record type, with latest-published fallback."""
    queryset = FinancialDocumentTemplate.objects.filter(
        record_type=record_type,
        status=FinancialDocumentTemplate.Status.PUBLISHED,
        is_archived=False,
    ).prefetch_related("fields")
    return queryset.filter(is_default=True).first() or queryset.order_by("-version").first()


@transaction.atomic
def _replace_template_fields(template, fields_data, user):
    FinancialDocumentTemplateField.all_objects.filter(template=template).delete()
    seen = set()
    for position, raw in enumerate(fields_data or []):
        data = dict(raw)
        key = str(data.get("key", "")).strip().lower()
        if not key:
            raise ValidationError({"fields": _("Every template field needs a key.")})
        if key in seen:
            raise ValidationError({"fields": _("Template field keys must be unique.")})
        seen.add(key)
        data["key"] = key
        data.setdefault("display_order", position)
        field = FinancialDocumentTemplateField(
            template=template, created_by=user, updated_by=user, **data
        )
        field.full_clean()
        field.save()


@transaction.atomic
def create_template(
    *,
    record_type,
    name,
    fields,
    user,
    description="",
    effective_from=None,
    effective_to=None,
    output_mapping=None,
):
    # Lock the record type so two concurrent drafts cannot allocate one version.
    record_type.__class__.objects.select_for_update().get(pk=record_type.pk)
    version = (
        FinancialDocumentTemplate.all_objects.filter(record_type=record_type).aggregate(
            highest=Max("version")
        )["highest"]
        or 0
    ) + 1
    template = FinancialDocumentTemplate(
        record_type=record_type,
        name=name,
        version=version,
        status=FinancialDocumentTemplate.Status.DRAFT,
        description=description,
        effective_from=effective_from,
        effective_to=effective_to,
        output_mapping=output_mapping or {},
        created_by=user,
        updated_by=user,
    )
    template.full_clean()
    template.save()
    _replace_template_fields(template, fields, user)
    return template


@transaction.atomic
def update_template(*, template, user, fields=None, **values):
    locked = FinancialDocumentTemplate.objects.select_for_update().get(pk=template.pk)
    if locked.status != FinancialDocumentTemplate.Status.DRAFT:
        raise ValueError("Published template versions are immutable. Create a new version instead.")
    editable = {"name", "description", "effective_from", "effective_to", "output_mapping"}
    for key, value in values.items():
        if key not in editable:
            raise ValueError(f"Field '{key}' is not editable on a template.")
        setattr(locked, key, value)
    locked.updated_by = user
    locked.full_clean()
    locked.save()
    if fields is not None:
        _replace_template_fields(locked, fields, user)
    return locked


@transaction.atomic
def publish_template(*, template, user, is_default=True):
    from apps.extensibility.models import CustomFieldDefinition

    locked = FinancialDocumentTemplate.objects.select_for_update().get(pk=template.pk)
    if locked.status != FinancialDocumentTemplate.Status.DRAFT:
        raise ValueError("Only a draft template can be published.")
    fields = list(locked.fields.filter(is_active=True))
    from apps.extensibility.validators import coerce_value

    for field in fields:
        field.full_clean()
        if field.default_value not in (None, ""):
            try:
                coerce_value(field, field.default_value)
            except ValidationError as exc:
                raise ValidationError({field.key: exc.messages[0]}) from exc
    global_keys = set(
        CustomFieldDefinition.objects.filter(
            entity="financial_records.FinancialRecord", is_active=True
        ).values_list("key", flat=True)
    )
    collisions = sorted(global_keys.intersection(field.key for field in fields))
    if collisions:
        raise ValidationError(
            {
                "fields": _("Template fields conflict with global fields: %(keys)s")
                % {"keys": ", ".join(collisions)}
            }
        )
    if is_default:
        FinancialDocumentTemplate.objects.filter(
            record_type=locked.record_type,
            status=FinancialDocumentTemplate.Status.PUBLISHED,
            is_default=True,
        ).exclude(pk=locked.pk).update(is_default=False, updated_by=user)
    locked.status = FinancialDocumentTemplate.Status.PUBLISHED
    locked.is_default = bool(is_default)
    locked.published_at = timezone.now()
    locked.published_by = user
    locked.updated_by = user
    locked.save()
    return locked


@transaction.atomic
def clone_template(*, template, user):
    source = FinancialDocumentTemplate.all_objects.prefetch_related("fields").get(pk=template.pk)
    fields = [
        {
            "key": field.key,
            "label": field.label,
            "data_type": field.data_type,
            "is_required": field.is_required,
            "display_order": field.display_order,
            "section": field.section,
            "help_text": field.help_text,
            "default_value": field.default_value,
            "choices": field.choices,
            "max_length": field.max_length,
            "validation": field.validation,
            "output_mapping": field.output_mapping,
            "is_active": field.is_active,
        }
        for field in source.fields.all()
    ]
    return create_template(
        record_type=source.record_type,
        name=source.name,
        fields=fields,
        user=user,
        description=source.description,
        effective_from=source.effective_from,
        effective_to=source.effective_to,
        output_mapping=source.output_mapping,
    )


@transaction.atomic
def archive_template(*, template, user):
    locked = FinancialDocumentTemplate.objects.select_for_update().get(pk=template.pk)
    locked.status = FinancialDocumentTemplate.Status.ARCHIVED
    locked.is_default = False
    locked.updated_by = user
    locked.save(update_fields=["status", "is_default", "updated_by", "updated_at"])
    locked.archive(user=user)
    return locked


def _validate_counterparties(*, company, client=None, supplier=None):
    errors = {}
    for name, party in (("client", client), ("supplier", supplier)):
        if party is None:
            continue
        if party.is_archived or getattr(party, "status", "active") != "active":
            errors[name] = _("Select an active, non-archived counterparty.")
        elif party.company_id and party.company_id != company.id:
            errors[name] = _("The counterparty must belong to the Financial Record company.")
    if errors:
        raise ValidationError(errors)


@transaction.atomic
def create_record(
    *,
    company,
    record_type,
    record_date,
    description,
    user,
    category=None,
    client=None,
    supplier=None,
    template=None,
    currency="MAD",
    notes="",
):
    """Create a draft using one published template version."""
    _validate_counterparties(company=company, client=client, supplier=supplier)
    selected_template = template or get_published_template(record_type)
    if selected_template:
        if selected_template.record_type_id != record_type.id:
            raise ValidationError(
                {"template": _("The template does not belong to this record type.")}
            )
        if (
            selected_template.status != FinancialDocumentTemplate.Status.PUBLISHED
            or selected_template.is_archived
        ):
            raise ValidationError({"template": _("Select a published, active template.")})
    return FinancialRecord.objects.create(
        company=company,
        record_type=record_type,
        template=selected_template,
        template_snapshot=template_snapshot(selected_template),
        category=category,
        client=client,
        supplier=supplier,
        record_date=record_date,
        description=description,
        currency=currency,
        notes=notes,
        status=FinancialRecord.Status.DRAFT,
        created_by=user,
        updated_by=user,
    )


@transaction.atomic
def add_line(*, record, user, debit=ZERO, credit=ZERO, description="", category=None):
    locked = FinancialRecord.objects.select_for_update().get(pk=record.pk)
    validate_record_is_editable(locked)
    next_number = (
        FinancialRecordLine.all_objects.filter(record=locked).aggregate(highest=Max("line_number"))[
            "highest"
        ]
        or 0
    ) + 1
    line = FinancialRecordLine(
        record=locked,
        line_number=next_number,
        description=description,
        category=category,
        debit=Decimal(debit),
        credit=Decimal(credit),
        created_by=user,
        updated_by=user,
    )
    validate_line_amounts([line])
    line.save()
    return line


@transaction.atomic
def update_line(*, record, line, user, **fields):
    locked_record = FinancialRecord.objects.select_for_update().get(pk=record.pk)
    validate_record_is_editable(locked_record)
    locked = FinancialRecordLine.objects.select_for_update().get(pk=line.pk, record=locked_record)
    editable = {"description", "category", "debit", "credit"}
    for key, value in fields.items():
        if key not in editable:
            raise ValueError(f"Field '{key}' is not editable on a line.")
        setattr(locked, key, Decimal(value) if key in {"debit", "credit"} else value)
    locked.updated_by = user
    validate_line_amounts([locked])
    locked.save()
    return locked


@transaction.atomic
def delete_line(*, record, line, user):
    locked_record = FinancialRecord.objects.select_for_update().get(pk=record.pk)
    validate_record_is_editable(locked_record)
    locked = FinancialRecordLine.objects.select_for_update().get(pk=line.pk, record=locked_record)
    locked.archive(user=user)
    return locked


@transaction.atomic
def update_record(*, record, user, **fields):
    locked = FinancialRecord.objects.select_for_update().get(pk=record.pk)
    validate_record_is_editable(locked)
    editable = {
        "record_type",
        "category",
        "client",
        "supplier",
        "record_date",
        "description",
        "notes",
        "currency",
    }
    unknown = set(fields) - editable
    if unknown:
        raise ValueError(f"Field '{sorted(unknown)[0]}' is not editable on a financial record.")
    new_type = fields.get("record_type", locked.record_type)
    if new_type.pk != locked.record_type_id:
        if locked.lines.exists() or locked.custom_fields:
            raise ValidationError(
                {
                    "record_type": _(
                        "Remove lines and custom values before changing the record type."
                    )
                }
            )
        locked.template = get_published_template(new_type)
        locked.template_snapshot = template_snapshot(locked.template)
    final_client = fields.get("client", locked.client)
    final_supplier = fields.get("supplier", locked.supplier)
    _validate_counterparties(company=locked.company, client=final_client, supplier=final_supplier)
    for key, value in fields.items():
        setattr(locked, key, value)
    locked.updated_by = user
    locked.save()
    return locked


@transaction.atomic
def post_record(*, record, user):
    locked = FinancialRecord.objects.select_for_update().get(pk=record.pk)
    lines = list(FinancialRecordLine.objects.filter(record=locked).order_by("line_number"))
    validate_can_be_posted(locked, lines)
    locked.total_amount = sum((line.debit for line in lines), ZERO)
    locked.status = FinancialRecord.Status.POSTED
    locked.posted_at = timezone.now()
    locked.posted_by = user
    locked.updated_by = user
    locked.save()
    return locked


@transaction.atomic
def cancel_record(*, record, user, reason):
    if not reason or not reason.strip():
        raise ValueError("A cancellation reason is required.")
    locked = FinancialRecord.objects.select_for_update().get(pk=record.pk)
    if locked.status != FinancialRecord.Status.POSTED:
        raise ValueError("Only a posted financial record can be cancelled.")
    locked.status = FinancialRecord.Status.CANCELLED
    locked.cancelled_at = timezone.now()
    locked.cancellation_reason = reason.strip()
    locked.updated_by = user
    locked.save()
    return locked


@transaction.atomic
def archive_record(*, record, user, reason=""):
    locked = FinancialRecord.objects.select_for_update().get(pk=record.pk)
    if locked.status == FinancialRecord.Status.POSTED:
        raise ValueError("A posted financial record cannot be archived. Cancel it first.")
    locked.archive(user=user, reason=reason)
    return locked


@transaction.atomic
def attach_document(*, record, user, file_key, file_name, content_type="", size_bytes=0):
    return Attachment.objects.create(
        record=record,
        file_key=file_key,
        file_name=file_name,
        content_type=content_type,
        size_bytes=size_bytes,
        created_by=user,
        updated_by=user,
    )


@transaction.atomic
def remove_attachment(*, record, attachment, user):
    locked = Attachment.objects.select_for_update().get(pk=attachment.pk, record=record)
    locked.archive(user=user)
    return locked
