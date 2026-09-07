from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    initial = True
    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('personnel', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='Leave',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('leave_type', models.CharField(choices=[('annual', 'Annual Leave'), ('sick', 'Sick Leave'), ('maternity', 'Maternity Leave'), ('unpaid', 'Unpaid Leave'), ('other', 'Other')], max_length=50)),
                ('start_date', models.DateField()),
                ('end_date', models.DateField()),
                ('duration_days', models.PositiveIntegerField(editable=False)),
                ('reason', models.TextField(blank=True)),
                ('status', models.CharField(choices=[('draft', 'Draft'), ('official', 'Official'), ('cancelled', 'Cancelled')], default='draft', max_length=20)),
                ('signed_document', models.FileField(blank=True, null=True, upload_to='leaves/documents/')),
                ('official_at', models.DateTimeField(blank=True, null=True)),
                ('cancelled_at', models.DateTimeField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('personnel', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='leaves', to='personnel.personnelperson')),
                ('employment', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='leaves', to='personnel.employment')),
                ('created_by', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='created_leaves', to=settings.AUTH_USER_MODEL)),
            ],
            options={'ordering': ['-created_at'], 'db_table': 'leaves'},
        ),
    ]
