from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("help_tickets", "0005_attachment_r2_key_deleted"),
    ]

    operations = [
        migrations.AddField(
            model_name="helpticket",
            name="subject_key",
            field=models.CharField(blank=True, default="", max_length=40),
        ),
        migrations.AddField(
            model_name="helpticket",
            name="locale",
            field=models.CharField(blank=True, default="fr", max_length=8),
        ),
        migrations.AddField(
            model_name="clientticket",
            name="subject_key",
            field=models.CharField(blank=True, default="", max_length=40),
        ),
        migrations.AddField(
            model_name="clientticket",
            name="locale",
            field=models.CharField(blank=True, default="fr", max_length=8),
        ),
        migrations.AlterField(
            model_name="helpticket",
            name="reason",
            field=models.CharField(
                choices=[
                    ("forgot_password", "Forgot password"),
                    ("cannot_sign_in", "Cannot sign in"),
                    ("login_issue", "Login problem"),
                    ("access_denied", "Access denied"),
                    ("page_not_loading", "A page does not load"),
                    ("page_blocked", "A page is blocked or access is denied"),
                    ("data_not_saving", "Data is not saving"),
                    ("display_issue", "Display or language issue"),
                    ("other_issue", "Other issue"),
                    ("other", "Other"),
                ],
                max_length=50,
            ),
        ),
    ]
