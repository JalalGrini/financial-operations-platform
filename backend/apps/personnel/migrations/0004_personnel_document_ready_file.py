from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("personnel", "0003_cycle18_protect_fks_and_payment_status")]

    operations = [
        migrations.AddField(
            model_name="personneldocumentreference",
            name="file",
            field=models.FileField(blank=True, max_length=500, upload_to="private/personnel-documents/%Y/%m/", verbose_name="ready file"),
        ),
        migrations.AddField(model_name="personneldocumentreference", name="file_name", field=models.CharField(blank=True, max_length=255, verbose_name="original file name")),
        migrations.AddField(model_name="personneldocumentreference", name="content_type", field=models.CharField(blank=True, max_length=100, verbose_name="content type")),
        migrations.AddField(model_name="personneldocumentreference", name="size_bytes", field=models.PositiveBigIntegerField(default=0, verbose_name="file size")),
    ]
