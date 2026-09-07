import uuid
from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion

class Migration(migrations.Migration):
    dependencies = [("inventory", "0001_initial")]
    operations = [
        migrations.AlterField(model_name="inventorycategory",name="archived_at",field=models.DateTimeField(blank=True,null=True,verbose_name="Archived at")),
        migrations.AlterField(model_name="inventorycategory",name="archived_by",field=models.ForeignKey(blank=True,null=True,on_delete=django.db.models.deletion.SET_NULL,related_name="inventorycategory_archived_by",to=settings.AUTH_USER_MODEL,verbose_name="Archived by")),
        migrations.AlterField(model_name="inventorycategory",name="created_at",field=models.DateTimeField(auto_now_add=True,verbose_name="Created at")),
        migrations.AlterField(model_name="inventorycategory",name="created_by",field=models.ForeignKey(blank=True,null=True,on_delete=django.db.models.deletion.SET_NULL,related_name="inventorycategory_created",to=settings.AUTH_USER_MODEL,verbose_name="Created by")),
        migrations.AlterField(model_name="inventorycategory",name="id",field=models.UUIDField(default=uuid.uuid4,editable=False,primary_key=True,serialize=False,verbose_name="ID")),
        migrations.AlterField(model_name="inventorycategory",name="is_archived",field=models.BooleanField(default=False,verbose_name="Archived")),
        migrations.AlterField(model_name="inventorycategory",name="reference",field=models.CharField(db_index=True,max_length=50,unique=True,verbose_name="Reference")),
        migrations.AlterField(model_name="inventorycategory",name="updated_at",field=models.DateTimeField(auto_now=True,verbose_name="Updated at")),
        migrations.AlterField(model_name="inventorycategory",name="updated_by",field=models.ForeignKey(blank=True,null=True,on_delete=django.db.models.deletion.SET_NULL,related_name="inventorycategory_updated",to=settings.AUTH_USER_MODEL,verbose_name="Updated by")),
        migrations.AlterField(model_name="inventoryitem",name="archived_at",field=models.DateTimeField(blank=True,null=True,verbose_name="Archived at")),
        migrations.AlterField(model_name="inventoryitem",name="archived_by",field=models.ForeignKey(blank=True,null=True,on_delete=django.db.models.deletion.SET_NULL,related_name="inventoryitem_archived_by",to=settings.AUTH_USER_MODEL,verbose_name="Archived by")),
        migrations.AlterField(model_name="inventoryitem",name="created_at",field=models.DateTimeField(auto_now_add=True,verbose_name="Created at")),
        migrations.AlterField(model_name="inventoryitem",name="created_by",field=models.ForeignKey(blank=True,null=True,on_delete=django.db.models.deletion.SET_NULL,related_name="inventoryitem_created",to=settings.AUTH_USER_MODEL,verbose_name="Created by")),
        migrations.AlterField(model_name="inventoryitem",name="id",field=models.UUIDField(default=uuid.uuid4,editable=False,primary_key=True,serialize=False,verbose_name="ID")),
        migrations.AlterField(model_name="inventoryitem",name="is_archived",field=models.BooleanField(default=False,verbose_name="Archived")),
        migrations.AlterField(model_name="inventoryitem",name="reference",field=models.CharField(db_index=True,max_length=50,unique=True,verbose_name="Reference")),
        migrations.AlterField(model_name="inventoryitem",name="updated_at",field=models.DateTimeField(auto_now=True,verbose_name="Updated at")),
        migrations.AlterField(model_name="inventoryitem",name="updated_by",field=models.ForeignKey(blank=True,null=True,on_delete=django.db.models.deletion.SET_NULL,related_name="inventoryitem_updated",to=settings.AUTH_USER_MODEL,verbose_name="Updated by")),
        migrations.AlterField(model_name="inventorymovement",name="created_at",field=models.DateTimeField(auto_now_add=True,verbose_name="Created at")),
        migrations.AlterField(model_name="inventorymovement",name="created_by",field=models.ForeignKey(blank=True,null=True,on_delete=django.db.models.deletion.SET_NULL,related_name="inventorymovement_created",to=settings.AUTH_USER_MODEL,verbose_name="Created by")),
        migrations.AlterField(model_name="inventorymovement",name="id",field=models.UUIDField(default=uuid.uuid4,editable=False,primary_key=True,serialize=False,verbose_name="ID")),
        migrations.AlterField(model_name="inventorymovement",name="updated_at",field=models.DateTimeField(auto_now=True,verbose_name="Updated at")),
        migrations.AlterField(model_name="inventorymovement",name="updated_by",field=models.ForeignKey(blank=True,null=True,on_delete=django.db.models.deletion.SET_NULL,related_name="inventorymovement_updated",to=settings.AUTH_USER_MODEL,verbose_name="Updated by")),
    ]
