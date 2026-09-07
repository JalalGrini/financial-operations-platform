from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("accounts", "0002_userpreference")]
    operations = [
        migrations.AddField(
            model_name="user",
            name="avatar",
            field=models.ImageField(blank=True, null=True, upload_to="private/avatars/%Y/%m/", verbose_name="profile picture"),
        ),
        migrations.AddField(
            model_name="user",
            name="must_change_password",
            field=models.BooleanField(default=False, help_text="Require a password change before normal API access.", verbose_name="must change password"),
        ),
    ]
