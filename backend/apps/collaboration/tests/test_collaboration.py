from django.contrib.auth.models import Group
from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.collaboration.models import Notification


class NotificationIsolationTests(TestCase):
    def setUp(self):
        role, _ = Group.objects.get_or_create(name="Assistant")
        self.a = User.objects.create_user(
            email="a@example.com", password="StrongPass!123", first_name="A", last_name="User"
        )
        self.a.groups.add(role)
        self.b = User.objects.create_user(
            email="b@example.com", password="StrongPass!123", first_name="B", last_name="User"
        )
        self.b.groups.add(role)
        Notification.objects.create(recipient=self.a, category="system", title="A only")

    def test_recipient_cannot_read_another_inbox(self):
        c = APIClient()
        c.force_authenticate(self.b)
        r = c.get("/api/v1/collaboration/notifications/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data["count"], 0)

    def test_unread_count_and_mark_all(self):
        c = APIClient()
        c.force_authenticate(self.a)
        self.assertEqual(
            c.get("/api/v1/collaboration/notifications/unread-count/").data["count"], 1
        )
        self.assertEqual(
            c.post("/api/v1/collaboration/notifications/read-all/", {}).status_code, 200
        )
