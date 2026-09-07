from django.db import migrations, models
import django.db.models.deletion
from django.conf import settings


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='HelpTicket',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('reason', models.CharField(choices=[('forgot_password', 'Forgot password'), ('login_issue', 'Login problem'), ('access_denied', 'Access denied'), ('other', 'Other')], max_length=50)),
                ('name', models.CharField(max_length=200)),
                ('email', models.EmailField(max_length=254)),
                ('message', models.TextField(blank=True)),
                ('status', models.CharField(choices=[('open', 'Open'), ('closed', 'Closed')], default='open', max_length=20)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('reply_subject', models.CharField(blank=True, max_length=300)),
                ('reply_body', models.TextField(blank=True)),
                ('replied_at', models.DateTimeField(blank=True, null=True)),
                ('reply_sent', models.BooleanField(default=False)),
                ('resolved_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='resolved_tickets', to=settings.AUTH_USER_MODEL)),
                ('replied_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='replied_tickets', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'db_table': 'help_tickets',
                'ordering': ['-created_at'],
            },
        ),
    ]
