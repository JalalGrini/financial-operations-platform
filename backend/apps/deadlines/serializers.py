from rest_framework import serializers

from apps.accounts.models import User
from apps.companies.models import Company

from .models import Deadline, DeadlineOccurrence

# How many past periods to send with each deadline. Enough to render a year of
# monthly ticks without turning a list request into an unbounded payload.
OCCURRENCE_HISTORY_LIMIT = 24


class DeadlineOccurrenceSerializer(serializers.ModelSerializer):
    completed_by_name = serializers.CharField(
        source="completed_by.get_full_name", read_only=True, default=None
    )
    is_completed = serializers.BooleanField(read_only=True)

    class Meta:
        model = DeadlineOccurrence
        fields = (
            "id",
            "sequence",
            "due_at",
            "period_label",
            "completed_at",
            "completed_by",
            "completed_by_name",
            "is_completed",
        )
        read_only_fields = fields


class DeadlineSerializer(serializers.ModelSerializer):
    company_name = serializers.CharField(source="company.name", read_only=True)
    owner_name = serializers.CharField(source="owner.get_full_name", read_only=True)
    computed_status = serializers.CharField(read_only=True)
    completed_by_name = serializers.CharField(
        source="completed_by.get_full_name", read_only=True
    )
    company = serializers.PrimaryKeyRelatedField(
        queryset=Company.objects.all(), required=False, allow_null=True
    )
    owner = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.filter(is_active=True), required=False, allow_null=True
    )
    is_recurring = serializers.BooleanField(read_only=True)

    # Period tracking. `due_at` is the current period's date and does not move on
    # completion, so the client needs these to show "this month is done, next one
    # is on <date>" without the two being confused for each other.
    current_period_label = serializers.CharField(read_only=True)
    is_current_period_completed = serializers.BooleanField(read_only=True)
    completed_periods_count = serializers.IntegerField(read_only=True)
    next_due_at = serializers.DateTimeField(read_only=True)
    occurrences = serializers.SerializerMethodField()

    class Meta:
        model = Deadline
        fields = (
            "id",
            "title",
            "description",
            "company",
            "company_name",
            "owner",
            "owner_name",
            "due_at",
            "status",
            "computed_status",
            "priority",
            "period_type",
            "recurrence_days",
            "is_recurring",
            "current_period_label",
            "is_current_period_completed",
            "completed_periods_count",
            "next_due_at",
            "occurrences",
            "channel",
            "destination",
            "completed_at",
            "completed_by",
            "completed_by_name",
            "created_at",
            "updated_at",
            "created_by",
        )
        read_only_fields = (
            "id",
            "computed_status",
            "is_recurring",
            "current_period_label",
            "is_current_period_completed",
            "completed_periods_count",
            "next_due_at",
            "occurrences",
            "completed_at",
            "completed_by",
            "completed_by_name",
            "created_at",
            "updated_at",
            "created_by",
        )

    def get_occurrences(self, obj) -> list:
        """Most recent periods first, capped at OCCURRENCE_HISTORY_LIMIT.

        Sorted in Python rather than with a sliced queryset so the ViewSet's
        `prefetch_related("occurrences")` is actually used; re-filtering here
        would issue a fresh query per row.
        """
        rows = sorted(obj.occurrences.all(), key=lambda o: o.due_at, reverse=True)
        return DeadlineOccurrenceSerializer(
            rows[:OCCURRENCE_HISTORY_LIMIT], many=True
        ).data

    def validate(self, attrs):
        # recurrence_days only means anything for the "custom" period, and it is
        # required there: without it the deadline would silently behave one-time.
        period = attrs.get(
            "period_type", getattr(self.instance, "period_type", Deadline.PeriodType.ONE_TIME)
        )
        days = attrs.get("recurrence_days", getattr(self.instance, "recurrence_days", None))
        if period == Deadline.PeriodType.CUSTOM:
            if not days:
                raise serializers.ValidationError(
                    {
                        "recurrence_days": 'recurrence_days is required and must be greater '
                        'than 0 when period_type is "custom".'
                    }
                )
        elif "recurrence_days" in attrs and days:
            raise serializers.ValidationError(
                {"recurrence_days": 'recurrence_days is only allowed when period_type is "custom".'}
            )
        return attrs
