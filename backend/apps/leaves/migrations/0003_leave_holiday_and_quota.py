from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("leaves", "0002_leave_company_leave_decision_date_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="leave",
            name="national_holiday_days",
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.AddField(
            model_name="leave",
            name="international_holiday_days",
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.AddField(
            model_name="leave",
            name="chargeable_days",
            field=models.PositiveIntegerField(default=0, editable=False),
        ),
        migrations.AddField(
            model_name="leave",
            name="confirm_over_quota",
            field=models.BooleanField(default=False),
        ),
    ]
