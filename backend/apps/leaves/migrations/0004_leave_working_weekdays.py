from django.db import migrations, models


def default_working_weekdays():
    return [0, 1, 2, 3, 4, 5, 6]


class Migration(migrations.Migration):

    dependencies = [
        ("leaves", "0003_leave_holiday_and_quota"),
    ]

    operations = [
        migrations.AddField(
            model_name="leave",
            name="working_weekdays",
            field=models.JSONField(blank=True, default=default_working_weekdays),
        ),
    ]
