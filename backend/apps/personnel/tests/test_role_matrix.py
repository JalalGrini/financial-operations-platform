# apps/personnel/tests/test_role_matrix.py
"""
Role x endpoint authorization matrix tests for the Personnel domain.

WHY THIS FILE EXISTS
--------------------
EFOP deliberately gives every member of staff visibility into every company:
Assistants and Directors are responsible for all companies at once, so there is
no per-company tenant boundary by design.

That design choice makes the *role* the only meaningful authorization boundary
in the system. If a role check is wrong, there is no second layer to catch it.
These tests therefore lock the intended matrix explicitly:

    Endpoint group    | Administrator | Assistant        | Director
    ------------------|---------------|------------------|-----------
    read (GET)        | allow         | allow            | allow
    create (POST)     | allow         | allow            | DENY
    update (PATCH)    | allow         | allow            | DENY
    delete (DELETE)   | allow         | DENY             | DENY

The detail-route tests below also cover a regression class that unit-testing
permission classes in isolation cannot catch: object-level permission checks
that reference model attributes which do not exist. Such a bug raises
AttributeError inside has_object_permission; if it is swallowed by a broad
``except Exception: return False`` it silently degrades into "access denied"
for legitimate users rather than failing loudly.
"""
from django.contrib.auth.models import Group
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from apps.personnel.tests.factories import (
    create_test_adjustment,
    create_test_payment,
    create_test_payroll,
    create_test_user,
)

ADMINISTRATOR = "Administrator"
ASSISTANT = "Assistant"
DIRECTOR = "Director"


def make_user(role: str, email: str):
    """Create a user belonging to exactly one EFOP role group."""
    user = create_test_user(email=email)
    group, _ = Group.objects.get_or_create(name=role)
    user.groups.add(group)
    return user


class PayrollDetailRouteAccessTests(APITestCase):
    """
    Detail (object-level) access to payroll records.

    Regression guard for audit finding H-4: ``CanManagePayroll`` performed a
    per-company membership check via ``user.companies``, an attribute that does
    not exist on the User model. Every non-Administrator was silently denied
    object-level access to payroll data, which broke the Assistant role - the
    platform's primary operator.
    """

    def setUp(self):
        self.client = APIClient()
        # Payroll fixtures are created by an Administrator so that creator-based
        # logic cannot be confused with role-based logic.
        self.owner = make_user(ADMINISTRATOR, "owner@example.com")
        self.payroll = create_test_payroll(user=self.owner)
        self.adjustment = create_test_adjustment(payroll=self.payroll, user=self.owner)
        self.payment = create_test_payment(payroll=self.payroll, user=self.owner)

    def _get(self, role, email, url):
        self.client.force_authenticate(user=make_user(role, email))
        return self.client.get(url)

    # --- reads must succeed for all three roles -------------------------------

    def test_administrator_can_retrieve_payroll_detail(self):
        url = reverse("personnel:monthly-payroll-detail", args=[self.payroll.id])
        resp = self._get(ADMINISTRATOR, "admin@example.com", url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_assistant_can_retrieve_payroll_detail(self):
        """An Assistant manages payroll and must be able to open a record."""
        url = reverse("personnel:monthly-payroll-detail", args=[self.payroll.id])
        resp = self._get(ASSISTANT, "assistant@example.com", url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_director_can_retrieve_payroll_detail(self):
        """A Director has read access to payroll for oversight."""
        url = reverse("personnel:monthly-payroll-detail", args=[self.payroll.id])
        resp = self._get(DIRECTOR, "director@example.com", url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_assistant_can_retrieve_adjustment_detail(self):
        """PayrollAdjustment has no .employment attribute - only .payroll_record."""
        url = reverse("personnel:payroll-adjustment-detail", args=[self.adjustment.id])
        resp = self._get(ASSISTANT, "assistant2@example.com", url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_assistant_can_retrieve_payment_detail(self):
        """PayrollPayment has no .employment attribute - only .payroll_record."""
        url = reverse("personnel:payroll-payment-detail", args=[self.payment.id])
        resp = self._get(ASSISTANT, "assistant3@example.com", url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    # --- writes must respect the role matrix ---------------------------------

    def test_director_cannot_update_payroll(self):
        self.client.force_authenticate(user=make_user(DIRECTOR, "director-write@example.com"))
        url = reverse("personnel:monthly-payroll-detail", args=[self.payroll.id])
        resp = self.client.patch(url, {"observations": "unauthorized edit"}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_director_cannot_delete_payroll(self):
        self.client.force_authenticate(user=make_user(DIRECTOR, "director-delete@example.com"))
        url = reverse("personnel:monthly-payroll-detail", args=[self.payroll.id])
        resp = self.client.delete(url)
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_assistant_cannot_delete_payroll(self):
        """DELETE (which archives, not destroys, since Cycle 17 - state/
        IMPLEMENTATION_PLAN.md Section 11, decision C-5) is Administrator-
        only, same as the separate confirmation-gated `permanent_delete`
        true-purge route; an Assistant is turned away by the permission
        layer before reaching either one.
        """
        self.client.force_authenticate(user=make_user(ASSISTANT, "assistant-delete@example.com"))
        url = reverse("personnel:monthly-payroll-detail", args=[self.payroll.id])
        resp = self.client.delete(url)
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_administrator_delete_payroll_archives_not_destroys(self):
        """Administrator's plain DELETE passes the permission layer, but
        (Cycle 17, C-1) must archive the row via `SoftDeleteViewSetMixin`,
        not issue a real SQL DELETE. `MonthlyPayrollRecordViewSet` has no
        `restore` action yet (tracked Cycle 18 backlog, see
        apps/common/tests/test_soft_delete_guard.py MISSING_ARCHIVE_ACTIONS),
        so this only proves the row survives archived, not that it can be
        brought back through this API yet.
        """
        self.client.force_authenticate(user=make_user(ADMINISTRATOR, "admin-delete@example.com"))
        url = reverse("personnel:monthly-payroll-detail", args=[self.payroll.id])
        resp = self.client.delete(url)
        self.assertEqual(resp.status_code, status.HTTP_204_NO_CONTENT)

        from apps.personnel.models import MonthlyPayrollRecord

        archived = MonthlyPayrollRecord.all_objects.get(pk=self.payroll.id)
        self.assertTrue(
            archived.is_archived,
            "Administrator DELETE must archive the payroll record, not "
            "destroy it - it was still found via all_objects but "
            "is_archived is False.",
        )

    def test_unauthenticated_access_is_rejected(self):
        self.client.force_authenticate(user=None)
        url = reverse("personnel:monthly-payroll-detail", args=[self.payroll.id])
        resp = self.client.get(url)
        self.assertIn(
            resp.status_code,
            (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN),
        )


class PayrollListRouteAccessTests(APITestCase):
    """Collection-level access to payroll records."""

    def setUp(self):
        self.client = APIClient()
        self.owner = make_user(ADMINISTRATOR, "listowner@example.com")
        self.payroll = create_test_payroll(user=self.owner)
        self.url = reverse("personnel:monthly-payroll-list")

    def test_all_roles_can_list_payrolls(self):
        """All staff see all companies' payroll by design."""
        for role, email in (
            (ADMINISTRATOR, "l-admin@example.com"),
            (ASSISTANT, "l-assistant@example.com"),
            (DIRECTOR, "l-director@example.com"),
        ):
            with self.subTest(role=role):
                self.client.force_authenticate(user=make_user(role, email))
                resp = self.client.get(self.url)
                self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_director_cannot_create_payroll(self):
        self.client.force_authenticate(user=make_user(DIRECTOR, "l-director-create@example.com"))
        resp = self.client.post(self.url, {}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_user_with_no_role_group_is_denied(self):
        """Fail closed: an authenticated user with no EFOP role gets nothing."""
        self.client.force_authenticate(user=create_test_user(email="norole@example.com"))
        resp = self.client.get(self.url)
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
