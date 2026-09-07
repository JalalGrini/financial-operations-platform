# Generated manually 2026-08-26 — adds recurrence fields to Deadline
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('deadlines', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='deadline',
            name='period_type',
            field=models.CharField(
                choices=[
                    ('one_time', 'One-time (archive on complete)'),
                    ('monthly', 'Monthly (advance 1 month)'),
                    ('quarterly', 'Quarterly (advance 3 months)'),
                    ('yearly', 'Yearly (advance 12 months)'),
                    ('custom', 'Custom (advance N days)'),
                ],
                default='one_time',
                max_length=20,
                help_text='Recurrence pattern applied when the deadline is marked complete.',
                db_index=True,
            ),
        ),
        migrations.AddField(
            model_name='deadline',
            name='recurrence_days',
            field=models.PositiveIntegerField(
                null=True,
                blank=True,
                help_text='Only used when period_type="custom". Number of days to advance due_at.',
            ),
        ),
    ]
