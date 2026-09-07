# apps/personnel/migrations/0005_personnel_person_photo.py
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("personnel", "0004_personnel_document_ready_file"),
    ]

    operations = [
        migrations.AddField(
            model_name="personnelperson",
            name="photo",
            field=models.ImageField(
                blank=True,
                help_text="Profile photo (optional)",
                null=True,
                upload_to="personnel/photos/",
                verbose_name="profile photo",
            ),
        ),
    ]
