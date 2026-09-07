from django.contrib.contenttypes.models import ContentType
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.collaboration.models import Mention, Notification

SUPPORTED_RESOURCES = {
    "companies.company": "/companies/{id}",
    "personnel.personnelperson": "/personnel/personnel/{id}",
    "personnel.employment": "/personnel/employments/{id}",
    "personnel.employmentsalary": "/personnel/salaries/{id}",
    "personnel.monthlypayrollrecord": "/personnel/payroll/{id}",
    "personnel.cnssdeclaration": "/personnel/cnss/{id}",
    "personnel.cnssmonthlydeclaration": "/personnel/cnss?monthly={id}",
    "financial_records.financialrecord": "/financial-records/{id}",
    "financial_records.financialdocumenttemplate": "/configuration/templates?template={id}",
    "reports.generatedreport": "/reports?report={id}",
    "treasury.transaction": "/treasury?transaction={id}",
    "inventory.inventorycategory": "/inventory?category={id}",
    "inventory.inventoryitem": "/inventory/{id}",
    "inventory.inventorymovement": "/inventory?movement={id}",
    "parties.client": "/clients/{id}",
    "parties.supplier": "/parties?supplier={id}",
    "configuration.financialrecordtype": "/configuration?record_type={id}",
    "configuration.transactiontype": "/configuration?transaction_type={id}",
    "configuration.paymentmethod": "/configuration?payment_method={id}",
    "configuration.category": "/configuration?category={id}",
    "configuration.reporttype": "/configuration?report_type={id}",
    "configuration.notificationtype": "/configuration?notification_type={id}",
    "transfers.cashtransfer": "/transfers/{id}",
}


def _eligible(user):
    return bool(
        user
        and user.is_active
        and (
            user.is_superuser
            or user.groups.filter(name__in=("Administrator", "Assistant", "Director")).exists()
        )
    )


def _resolve(resource_type, target_id):
    if resource_type not in SUPPORTED_RESOURCES:
        raise ValidationError({"resource_type": "This resource does not support collaboration."})
    app, model = resource_type.split(".", 1)
    try:
        content_type = ContentType.objects.get_by_natural_key(app, model)
    except ContentType.DoesNotExist as exc:
        raise ValidationError({"resource_type": "Unknown resource type."}) from exc
    model_class = content_type.model_class()
    manager = getattr(model_class, "all_objects", model_class._default_manager)
    try:
        target = manager.get(pk=target_id)
    except model_class.DoesNotExist as exc:
        raise ValidationError({"target_id": "The referenced record does not exist."}) from exc
    return content_type, target


@transaction.atomic
def create_mention(*, actor, tagged_user, resource_type, target_id, message=""):
    if not _eligible(actor):
        raise ValidationError("Your account cannot create tags.")
    if not _eligible(tagged_user):
        raise ValidationError({"tagged_user": "Choose an active EFOP user with a recognized role."})
    content_type, target = _resolve(resource_type, target_id)
    if getattr(target, "is_archived", False):
        raise ValidationError({"target_id": "Archived records cannot receive new tags."})
    destination = SUPPORTED_RESOURCES[resource_type].format(id=target.pk)
    company = getattr(target, "company", None)
    if Mention.objects.filter(
        tagged_user=tagged_user,
        content_type=content_type,
        object_id=target.pk,
        resolved_at__isnull=True,
    ).exists():
        raise ValidationError(
            {"tagged_user": "This user already has an active tag for this record."}
        )
    try:
        with transaction.atomic():
            mention = Mention.objects.create(
                tagged_user=tagged_user,
                tagged_by=actor,
                company=company,
                content_type=content_type,
                object_id=target.pk,
                target_label=str(target)[:240],
                destination=destination,
                message=(message or "").strip()[:500],
            )
    except IntegrityError as exc:
        raise ValidationError(
            {"tagged_user": "This user already has an active tag for this record."}
        ) from exc
    Notification.objects.create(
        recipient=tagged_user,
        actor=actor,
        company=company,
        category=Notification.Category.MENTION,
        title="You were tagged on a record",
        message=(message or f"{actor.get_full_name()} tagged you on {mention.target_label}")[:500],
        destination=destination,
        metadata={
            "mention_id": str(mention.id),
            "resource_type": resource_type,
            "target_id": str(target.pk),
        },
    )
    return mention


@transaction.atomic
def untag_mention(*, mention, actor):
    is_administrator = actor.is_superuser or actor.groups.filter(name="Administrator").exists()
    if mention.tagged_by_id != actor.id and not is_administrator:
        raise ValidationError("Only the tag creator or an Administrator can remove this tag.")
    if mention.resolved_at is None:
        mention.resolved_at = timezone.now()
        mention.save(update_fields=["resolved_at"])
    notification = Notification.objects.filter(
        recipient=mention.tagged_user, metadata__mention_id=str(mention.id)
    ).first()
    if notification:
        notification.metadata = {
            **notification.metadata,
            "untagged_at": mention.resolved_at.isoformat(),
            "untagged_by": str(actor.pk),
        }
        notification.save(update_fields=["metadata"])
    return mention
