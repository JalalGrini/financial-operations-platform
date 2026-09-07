import uuid
from django.db import migrations, models

class Migration(migrations.Migration):
    dependencies = [("audit_log", "0001_initial")]
    operations = [
        migrations.AlterField(model_name="auditevent", name="created_at", field=models.DateTimeField(auto_now_add=True, verbose_name="Created at")),
        migrations.AlterField(model_name="auditevent", name="id", field=models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False, verbose_name="ID")),
        migrations.AlterField(model_name="auditevent", name="updated_at", field=models.DateTimeField(auto_now=True, verbose_name="Updated at")),
    ]
