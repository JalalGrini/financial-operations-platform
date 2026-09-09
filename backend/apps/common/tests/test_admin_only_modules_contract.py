"""Treasury and Personnel Reports are Administrator-only (v17.21).

WHY THIS FILE EXISTS
--------------------
The owner decided on 2026-08-29 to withdraw these two modules from Assistant
and Director without deleting the API (deleting it would have been a ~112-test
re-baseline). "Withdrawn" has to mean the API refuses them, not that the
sidebar link is hidden: v17.18 hid both entries and anyone holding the URL kept
full access. Hiding a nav entry is not access control.

So this file drives the real HTTP endpoints, as a client would, and asserts:

    Administrator / superuser   pass the permission layer
    Assistant / Director        403 on every verb, reads included
    no role / anonymous         refused

ASSERTION STYLE
---------------
Denials assert exactly 403. Grants assert only "not 401/403", matching
test_endpoint_role_matrix.py: a preview POST may legitimately answer 400 for
serializer reasons that have nothing to do with authorization. What is being
asserted is whether the caller got past the permission layer.

URLS ARE LITERAL ON PURPOSE
---------------------------
Route names in this project are namespaced and have been guessed wrong before,
producing NoReverseMatch. These paths are copied from config/api_urls.py
("personnel/" and "treasury/" under "api/v1/") and the two urls.py files.
"""

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

User = get_user_model()

FORBIDDEN = status.HTTP_403_FORBIDDEN
REFUSED = (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN)

# (label, method, url, payload)
TREASURY_ENDPOINTS = [
    ("treasury accounts", "get", "/api/v1/treasury/accounts/", None),
    ("treasury transactions", "get", "/api/v1/treasury/transactions/", None),
    ("treasury transfers", "get", "/api/v1/treasury/transfers/", None),
    ("treasury reconciliations", "get", "/api/v1/treasury/reconciliations/", None),
]

PERSONNEL_REPORT_ENDPOINTS = [
    ("report types", "get", "/api/v1/personnel/reports/types/", None),
    ("report dashboard", "get", "/api/v1/personnel/reports/dashboard/", None),
    (
        "cnss monthly preview",
        "post",
        "/api/v1/personnel/reports/cnss-monthly/preview/",
        {"year": 2026, "month": 8},
    ),
    (
        "payroll monthly preview",
        "post",
        "/api/v1/personnel/reports/payroll-monthly/preview/",
        {"year": 2026, "month": 8},
    ),
]

ADMIN_ONLY_ENDPOINTS = TREASURY_ENDPOINTS + PERSONNEL_REPORT_ENDPOINTS + [
    ("users", "get", "/api/v1/accounts/users/", None),
    ("audit events", "get", "/api/v1/audit-log/events/", None),
    ("help tickets staff", "get", "/api/v1/help/tickets/list/", None),
    (
        "configuration write",
        "post",
        "/api/v1/configuration/categories/",
        {"name": "Admin-only config probe"},
    ),
]


def make_user(email, role=None, superuser=False):
    user = User.objects.create_user(
        email=email,
        password="testpass123",
        first_name="Admin",
        last_name="Only",
    )
    if superuser:
        user.is_superuser = True
        user.is_staff = True
        user.save(update_fields=["is_superuser", "is_staff"])
    if role:
        group, _ = Group.objects.get_or_create(name=role)
        user.groups.add(group)
    return user


class AdminOnlyModuleContractTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.administrator = make_user("adminonly-admin@example.invalid", "Administrator")
        cls.assistant = make_user("adminonly-assistant@example.invalid", "Assistant")
        cls.director = make_user("adminonly-director@example.invalid", "Director")
        cls.no_role = make_user("adminonly-norole@example.invalid", None)
        cls.superuser = make_user("adminonly-super@example.invalid", None, superuser=True)

    def as_user(self, user):
        client = APIClient()
        client.force_authenticate(user=user)
        return client

    def call(self, client, method, url, payload):
        if method == "post":
            return client.post(url, payload or {}, format="json")
        return client.get(url)

    # -- the point of the batch ---------------------------------------------

    def test_an_assistant_is_refused_everywhere_reads_included(self):
        client = self.as_user(self.assistant)
        for label, method, url, payload in ADMIN_ONLY_ENDPOINTS:
            with self.subTest(endpoint=label):
                response = self.call(client, method, url, payload)
                self.assertEqual(
                    response.status_code,
                    FORBIDDEN,
                    f"Assistant {method.upper()} {label} must be 403, got "
                    f"{response.status_code}. Body: {getattr(response, 'data', None)}",
                )

    def test_a_director_is_refused_everywhere_reads_included(self):
        """Director is the read-everything role, which is exactly why this matters.

        A Director can read every other domain in the platform. These two
        modules are the deliberate exception, so a passing read here would be a
        real access-control regression rather than a cosmetic one.
        """
        client = self.as_user(self.director)
        for label, method, url, payload in ADMIN_ONLY_ENDPOINTS:
            with self.subTest(endpoint=label):
                response = self.call(client, method, url, payload)
                self.assertEqual(
                    response.status_code,
                    FORBIDDEN,
                    f"Director {method.upper()} {label} must be 403, got "
                    f"{response.status_code}. Body: {getattr(response, 'data', None)}",
                )

    def test_a_user_with_no_role_is_refused(self):
        client = self.as_user(self.no_role)
        for label, method, url, payload in ADMIN_ONLY_ENDPOINTS:
            with self.subTest(endpoint=label):
                self.assertEqual(
                    self.call(client, method, url, payload).status_code,
                    FORBIDDEN,
                    f"No-role user must not reach {label}.",
                )

    def test_anonymous_callers_are_refused(self):
        client = APIClient()
        for label, method, url, payload in ADMIN_ONLY_ENDPOINTS:
            with self.subTest(endpoint=label):
                self.assertIn(
                    self.call(client, method, url, payload).status_code,
                    REFUSED,
                    f"Anonymous caller must not reach {label}.",
                )

    # -- vacuity: the denials above must not be passing for the wrong reason -

    def test_an_administrator_still_gets_through(self):
        """Vacuity guard.

        Every test above would also pass if these URLs 404'd, were removed from
        the router, or if the whole module were deleted. This asserts the
        endpoints still exist and still serve an Administrator, which is the
        owner's requirement: keep the module, restrict the audience.
        """
        client = self.as_user(self.administrator)
        for label, method, url, payload in ADMIN_ONLY_ENDPOINTS:
            with self.subTest(endpoint=label):
                response = self.call(client, method, url, payload)
                self.assertNotIn(
                    response.status_code,
                    REFUSED,
                    f"Administrator {method.upper()} {label} must pass the "
                    f"permission layer, got {response.status_code}. "
                    f"Body: {getattr(response, 'data', None)}",
                )
                self.assertNotEqual(
                    response.status_code,
                    status.HTTP_404_NOT_FOUND,
                    f"{label} answered 404 - the endpoint is gone, so the "
                    "denial tests above are vacuous.",
                )

    def test_a_superuser_still_gets_through(self):
        """Superusers bypass the role matrix everywhere else; keep that consistent."""
        client = self.as_user(self.superuser)
        for label, method, url, payload in ADMIN_ONLY_ENDPOINTS:
            with self.subTest(endpoint=label):
                self.assertNotIn(
                    self.call(client, method, url, payload).status_code,
                    REFUSED,
                    f"Superuser must reach {label}.",
                )

    def test_the_endpoint_list_is_not_empty(self):
        """Second vacuity guard: a truncated list would silence this whole file."""
        self.assertGreaterEqual(len(TREASURY_ENDPOINTS), 4)
        self.assertGreaterEqual(len(PERSONNEL_REPORT_ENDPOINTS), 4)
        self.assertGreaterEqual(len(ADMIN_ONLY_ENDPOINTS), 8)
