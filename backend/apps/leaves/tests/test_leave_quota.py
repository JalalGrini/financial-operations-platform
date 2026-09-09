from datetime import date

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from rest_framework.test import APIClient, APITestCase

from apps.companies.models import Company
from apps.personnel.models import Employment, PersonnelPerson

User = get_user_model()


def make_user(email, role):
    user = User.objects.create_user(
        email=email, password="testpass123", first_name="A", last_name="B"
    )
    group, _ = Group.objects.get_or_create(name=role)
    user.groups.add(group)
    return user


class LeaveQuotaApiTests(APITestCase):
    def setUp(self):
        self.assistant = make_user("leave-asst@example.com", "Assistant")
        self.company = Company.objects.create(name="Leave Co", created_by=self.assistant)
        self.person = PersonnelPerson.objects.create(
            first_name="Yasmine",
            last_name="Golnar",
            cin="LEAVECIN01",
            created_by=self.assistant,
        )
        self.employment = Employment.objects.create(
            person=self.person,
            company=self.company,
            employee_reference="LV-1",
            contract_type="permanent",
            employment_status="active",
            hire_date=date(2026, 1, 1),
            authorized_leave_days_per_year=5,
            created_by=self.assistant,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.assistant)

    def test_over_quota_requires_confirmation(self):
        response = self.client.post(
            "/api/v1/leaves/",
            {
                "personnel": str(self.person.id),
                "employment": str(self.employment.id),
                "leave_type": "annual",
                "start_date": "2026-06-01",
                "end_date": "2026-06-10",
                "national_holiday_days": 0,
                "international_holiday_days": 0,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("leave_over_quota", str(response.data))

    def test_over_quota_can_be_forced(self):
        response = self.client.post(
            "/api/v1/leaves/",
            {
                "personnel": str(self.person.id),
                "employment": str(self.employment.id),
                "leave_type": "annual",
                "start_date": "2026-06-01",
                "end_date": "2026-06-10",
                "national_holiday_days": 2,
                "international_holiday_days": 0,
                "confirm_over_quota": True,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["chargeable_days"], 7)
        self.assertEqual(response.data["duration_days"], 9)
