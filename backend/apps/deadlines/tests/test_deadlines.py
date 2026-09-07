from datetime import timedelta
from django.contrib.auth.models import Group
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase
from apps.accounts.models import User
from apps.deadlines.models import Deadline
class DeadlineApiTests(APITestCase):
 def test_lifecycle(self):
  u=User.objects.create_user(email="deadline@example.com",password="StrongPass123!",first_name="QA",last_name="Deadline");Group.objects.get_or_create(name="Assistant")[0].user_set.add(u);self.client.force_authenticate(u)
  r=self.client.post(reverse("deadlines:deadline-list"),{"title":"Payroll validation","due_at":(timezone.now()+timedelta(days=1)).isoformat(),"priority":"high","owner":str(u.id)},format="json");self.assertEqual(r.status_code,201);d=Deadline.objects.get(pk=r.data["id"])
  self.assertEqual(self.client.post(reverse("deadlines:deadline-complete",args=[d.id]),{},format="json").status_code,200);d.refresh_from_db();self.assertEqual(d.status,"completed");self.assertIsNotNone(d.completed_at)
  r=self.client.post(reverse("deadlines:deadline-reopen",args=[d.id]),{},format="json");self.assertEqual(r.data["status"],"upcoming")
