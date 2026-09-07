from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("reports", "0002_alter_reportversion_payload")]

    operations = [
        migrations.AddField(
            model_name="reportversion",
            name="ready_file",
            field=models.FileField(blank=True, help_text="An uploaded finished report kept beside the generated snapshot.", max_length=500, upload_to="private/report-versions/%Y/%m/", verbose_name="uploaded ready file"),
        ),
        migrations.AddField(model_name="reportversion", name="ready_file_name", field=models.CharField(blank=True, max_length=255, verbose_name="original file name")),
        migrations.AddField(model_name="reportversion", name="ready_file_content_type", field=models.CharField(blank=True, max_length=100, verbose_name="content type")),
        migrations.AddField(model_name="reportversion", name="ready_file_size_bytes", field=models.PositiveBigIntegerField(default=0, verbose_name="file size")),
    ]
