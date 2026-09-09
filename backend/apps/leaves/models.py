import datetime
from django.conf import settings
from django.db import models
from django.core.exceptions import ValidationError
from django.utils import timezone


class Leave(models.Model):
    STATUS_DRAFT = 'draft'
    STATUS_OFFICIAL = 'official'
    STATUS_CANCELLED = 'cancelled'
    LEAVE_TYPES = [
        ('annual', 'Congé annuel'),
        ('exceptional', 'Congé exceptionnel'),
        ('other', 'Autre'),
        ('sick', 'Sick Leave'),
        ('maternity', 'Maternity Leave'),
        ('unpaid', 'Unpaid Leave'),
    ]
    STATUS_CHOICES = [
        (STATUS_DRAFT, 'Draft'),
        (STATUS_OFFICIAL, 'Official'),
        (STATUS_CANCELLED, 'Cancelled'),
    ]

    personnel = models.ForeignKey(
        'personnel.PersonnelPerson',
        on_delete=models.PROTECT,
        related_name='leaves'
    )
    employment = models.ForeignKey(
        'personnel.Employment',
        on_delete=models.PROTECT,
        related_name='leaves'
    )
    company = models.ForeignKey(
        'companies.Company',
        on_delete=models.PROTECT,
        related_name='leaves',
        null=True,
        blank=True,
    )
    leave_type = models.CharField(max_length=50, choices=LEAVE_TYPES)
    leave_type_other = models.CharField(max_length=200, blank=True)
    decision_number = models.CharField(max_length=50, blank=True)
    decision_date = models.DateField(null=True, blank=True)
    start_date = models.DateField()
    end_date = models.DateField()
    duration_days = models.PositiveIntegerField(editable=False)
    national_holiday_days = models.PositiveIntegerField(default=0)
    international_holiday_days = models.PositiveIntegerField(default=0)
    chargeable_days = models.PositiveIntegerField(editable=False, default=0)
    confirm_over_quota = models.BooleanField(default=False)
    reason = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_DRAFT)
    signed_document = models.FileField(upload_to='leaves/documents/', blank=True, null=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='created_leaves'
    )
    official_at = models.DateTimeField(null=True, blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        db_table = 'leaves'

    def __str__(self):
        return f'{self.personnel} — {self.leave_type} ({self.start_date} to {self.end_date})'

    def save(self, *args, **kwargs):
        if self.start_date and self.end_date:
            self.duration_days = max(0, (self.end_date - self.start_date).days)
        holidays = int(self.national_holiday_days or 0) + int(self.international_holiday_days or 0)
        self.chargeable_days = max(0, int(self.duration_days or 0) - holidays)
        # Group-wide leaves keep company=None. Inheritance from employment is
        # done in the serializer only when the client omitted company.
        if not self.decision_number:
            stamp = timezone.now().strftime('%Y%m%d-%H%M%S')
            self.decision_number = f'DEC-{stamp}'
        super().save(*args, **kwargs)

    def clean(self):
        if self.start_date and self.end_date:
            if self.end_date < self.start_date:
                raise ValidationError('end_date must be >= start_date.')
        holidays = int(self.national_holiday_days or 0) + int(self.international_holiday_days or 0)
        duration = max(0, (self.end_date - self.start_date).days) if self.start_date and self.end_date else 0
        if holidays > duration:
            raise ValidationError('Holiday days cannot exceed the leave duration.')
        qs = Leave.objects.filter(
            personnel=self.personnel,
            status=Leave.STATUS_OFFICIAL,
            start_date__lte=self.end_date,
            end_date__gte=self.start_date,
        )
        if self.pk:
            qs = qs.exclude(pk=self.pk)
        if qs.exists():
            raise ValidationError('This personnel already has an official leave overlapping these dates.')


def is_on_leave(personnel, date=None):
    today = date or datetime.date.today()
    return personnel.leaves.filter(
        status=Leave.STATUS_OFFICIAL,
        start_date__lte=today,
        end_date__gte=today,
    ).exists()
