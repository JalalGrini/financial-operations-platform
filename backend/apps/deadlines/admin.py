from django.contrib import admin
from .models import Deadline
@admin.register(Deadline)
class DeadlineAdmin(admin.ModelAdmin):
 list_display=("title","company","owner","due_at","priority","status")
 list_filter=("status","priority","channel")
