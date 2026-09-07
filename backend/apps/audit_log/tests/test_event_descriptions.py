# apps/audit_log/tests/test_event_descriptions.py
"""The audit log has to say what happened, and why it did not.

Reported as: "the audit is not clear enough for me i need it to be clearer like
someone created something or failed to and why".

Before this, every write was recorded as action "create_or_action" with
summary "POST /api/v1/... returned 500" and an ALWAYS EMPTY reason. The QA
database held 137 events sharing that one action value. The app had no tests at
all, which is how it stayed that way.

These tests pin the wording, because the wording IS the feature.
"""

from django.contrib.auth.models import Group
from django.test import RequestFactory, SimpleTestCase
from rest_framework import status
from rest_framework.response import Response
from rest_framework.test import APITestCase

from apps.accounts.models import User
from apps.audit_log.describe import (
    ACTION_PHRASES,
    build_summary,
    extract_reason,
    extract_reference,
    resolve_action,
    result_for_status,
)
from apps.audit_log.models import AuditEvent, AuditResult


class FakeActor:
    is_authenticated = True

    def __init__(self, name="Karim Director", email="karim@example.invalid"):
        self._name = name
        self.email = email

    def get_full_name(self):
        return self._name


class ResolveActionTests(SimpleTestCase):
    """A POST is not automatically "create_or_action"."""

    def setUp(self):
        self.factory = RequestFactory()

    def _request(self, method, path, url_name=None):
        request = getattr(self.factory, method.lower())(path)
        if url_name is not None:
            request.resolver_match = type("Match", (), {"url_name": url_name, "func": None})()
        return request

    def test_post_to_a_list_route_is_create(self):
        request = self._request("post", "/api/v1/transfers/cash-transfers/", "cash-transfer-list")
        self.assertEqual(resolve_action(request), "create")

    def test_post_to_a_custom_action_uses_the_action_name(self):
        request = self._request(
            "post",
            "/api/v1/transfers/cash-transfers/2b0b4c1e-0000-4000-8000-000000000000/confirm/",
            "cash-transfer-confirm",
        )
        self.assertEqual(resolve_action(request), "confirm")

    def test_collection_level_custom_action_is_named(self):
        request = self._request(
            "post", "/api/v1/reports/reports/upload-ready/", "report-upload-ready"
        )
        self.assertEqual(resolve_action(request), "upload-ready")

    def test_login_is_named(self):
        request = self._request("post", "/api/v1/auth/login/", "login")
        self.assertEqual(resolve_action(request), "login")

    def test_patch_is_update(self):
        request = self._request(
            "patch", "/api/v1/accounts/me/preferences/", "account-preferences"
        )
        self.assertEqual(resolve_action(request), "update")

    def test_put_on_a_named_noun_route_is_update_not_the_noun(self):
        """Calling a PUT on /preferences/ an action named "preferences" would
        move the vagueness rather than remove it."""
        request = self._request("put", "/api/v1/accounts/me/preferences/", "account-preferences")
        self.assertEqual(resolve_action(request), "update")

    def test_delete_is_delete(self):
        request = self._request(
            "delete",
            "/api/v1/inventory/items/2b0b4c1e-0000-4000-8000-000000000000/",
            "item-detail",
        )
        self.assertEqual(resolve_action(request), "delete")

    def test_post_at_a_detail_route_does_not_report_the_uuid_as_the_action(self):
        request = self._request(
            "post",
            "/api/v1/inventory/items/2b0b4c1e-0000-4000-8000-000000000000/",
            "item-detail",
        )
        self.assertEqual(resolve_action(request), "create")

    def test_never_returns_the_old_catch_all(self):
        for path, url_name in [
            ("/api/v1/transfers/cash-transfers/", "cash-transfer-list"),
            ("/api/v1/companies/2b0b4c1e-0000-4000-8000-000000000000/archive/", "company-archive"),
            ("/api/v1/auth/logout/", "logout"),
        ]:
            request = self._request("post", path, url_name)
            self.assertNotEqual(resolve_action(request), "create_or_action")


class ExtractReasonTests(SimpleTestCase):
    """The "why". This field was previously never populated."""

    def _response(self, data, code):
        response = Response(data, status=code)
        response.status_code = code
        return response

    def test_drf_detail_message(self):
        response = self._response({"detail": "You do not have permission."}, 403)
        self.assertEqual(extract_reason(response, 403), "You do not have permission.")

    def test_field_errors_are_named(self):
        response = self._response({"amount": ["Transfer amount must be greater than zero."]}, 400)
        reason = extract_reason(response, 400)
        self.assertIn("amount", reason)
        self.assertIn("greater than zero", reason)

    def test_several_field_errors_are_all_reported(self):
        response = self._response(
            {"company": ["This field is required."], "period_start": ["This field is required."]},
            400,
        )
        reason = extract_reason(response, 400)
        self.assertIn("company", reason)
        self.assertIn("period_start", reason)

    def test_non_field_errors_read_as_plain_sentences(self):
        response = self._response(
            {"non_field_errors": ["A company cannot transfer to itself."]}, 400
        )
        self.assertEqual(extract_reason(response, 400), "A company cannot transfer to itself.")

    def test_the_projects_envelope_shape_is_unwrapped(self):
        """This codebase wraps errors as {success, message, errors:{...}} AND
        repeats the fields at the top level, so naive flattening duplicates
        every message."""
        response = self._response(
            {
                "success": False,
                "message": "An error occurred.",
                "errors": {"amount": ["Must be greater than zero."]},
                "amount": ["Must be greater than zero."],
            },
            400,
        )
        reason = extract_reason(response, 400)
        self.assertEqual(reason.count("Must be greater than zero."), 1)
        # The envelope's fixed generic string must not bury the real reason.
        self.assertNotIn("An error occurred.", reason)

    def test_the_generic_envelope_message_is_used_only_as_a_last_resort(self):
        response = self._response({"success": False, "message": "An error occurred."}, 400)
        self.assertEqual(extract_reason(response, 400), "An error occurred.")

    def test_passwords_are_never_echoed_into_the_reason(self):
        response = self._response({"password": ["The password 'hunter2' is too common."]}, 400)
        reason = extract_reason(response, 400)
        self.assertIn("[REDACTED]", reason)
        self.assertNotIn("hunter2", reason)

    def test_server_error_without_a_body_still_says_something_useful(self):
        response = self._response(None, 500)
        self.assertIn("server", extract_reason(response, 500).lower())

    def test_missing_record_without_a_body(self):
        response = self._response(None, 404)
        self.assertIn("not found", extract_reason(response, 404).lower())

    def test_streaming_responses_are_not_consumed(self):
        """Reading .content on a streaming CSV export would raise, and
        consuming the iterator would hand the user an empty file."""

        class Streaming:
            streaming = True
            status_code = 200

            @property
            def content(self):  # pragma: no cover - must never be reached
                raise AssertionError("the audit trail must not read a streaming body")

        self.assertEqual(extract_reason(Streaming(), 200), "")


class ExtractReferenceTests(SimpleTestCase):
    def test_reference_is_read_from_a_create_response(self):
        response = Response({"id": "abc", "reference": "TRF-2026-00001"}, status=201)
        self.assertEqual(extract_reference(response), "TRF-2026-00001")

    def test_absent_reference_is_blank_not_an_error(self):
        response = Response({"id": "abc"}, status=201)
        self.assertEqual(extract_reference(response), "")


class BuildSummaryTests(SimpleTestCase):
    """The sentence a person reads in the table."""

    def test_success_reads_as_a_completed_action(self):
        summary = build_summary(
            actor=FakeActor(),
            action="create",
            label="cash transfer",
            reference="",
            result=AuditResult.SUCCESS,
            reason="",
        )
        self.assertEqual(summary, "Karim Director created a cash transfer")

    def test_success_names_the_record_when_known(self):
        summary = build_summary(
            actor=FakeActor(),
            action="confirm",
            label="cash transfer",
            reference="TRF-2026-00001",
            result=AuditResult.SUCCESS,
            reason="",
        )
        self.assertEqual(summary, "Karim Director confirmed cash transfer TRF-2026-00001")

    def test_denied_says_not_allowed(self):
        summary = build_summary(
            actor=FakeActor(),
            action="delete",
            label="company",
            reference="",
            result=AuditResult.DENIED,
            reason="Permission was refused for this account.",
        )
        self.assertIn("was not allowed to delete a company", summary)
        self.assertIn("Permission was refused", summary)

    def test_failed_says_could_not_and_gives_the_reason(self):
        summary = build_summary(
            actor=FakeActor(),
            action="create",
            label="cash transfer",
            reference="",
            result=AuditResult.FAILED,
            reason="amount: Transfer amount must be greater than zero.",
        )
        self.assertIn("could not create a cash transfer", summary)
        self.assertIn("greater than zero", summary)

    def test_self_actions_do_not_invent_a_target(self):
        summary = build_summary(
            actor=FakeActor(),
            action="login",
            label="login",
            reference="",
            result=AuditResult.SUCCESS,
            reason="",
        )
        self.assertEqual(summary, "Karim Director signed in")

    def test_an_anonymous_actor_is_described_not_blank(self):
        summary = build_summary(
            actor=None,
            action="login",
            label="login",
            reference="",
            result=AuditResult.DENIED,
            reason="Permission was refused for this account.",
        )
        self.assertTrue(summary.startswith("An unauthenticated visitor"))

    def test_an_unknown_action_still_produces_a_sentence(self):
        summary = build_summary(
            actor=FakeActor(),
            action="some_new_action",
            label="widget",
            reference="",
            result=AuditResult.SUCCESS,
            reason="",
        )
        self.assertIn("some new action", summary)

    def test_summary_never_exceeds_the_column_width(self):
        summary = build_summary(
            actor=FakeActor(),
            action="create",
            label="cash transfer",
            reference="",
            result=AuditResult.FAILED,
            reason="x" * 4000,
        )
        self.assertLessEqual(len(summary), 500)

    def test_no_summary_is_a_raw_http_line(self):
        for action in ("create", "update", "delete", "confirm"):
            summary = build_summary(
                actor=FakeActor(),
                action=action,
                label="cash transfer",
                reference="",
                result=AuditResult.SUCCESS,
                reason="",
            )
            self.assertNotIn("/api/v1/", summary)
            self.assertNotIn("returned", summary)

    def test_every_phrase_entry_has_a_base_and_past_form(self):
        """Guards the tuple shape: a one-element entry would unpack wrongly and
        produce "was not allowed to created"."""
        for action, phrases in ACTION_PHRASES.items():
            self.assertEqual(len(phrases), 2, f"{action} must map to (base, past)")
            base, past = phrases
            self.assertTrue(base and past, f"{action} has an empty phrase")


class ResultForStatusTests(SimpleTestCase):
    def test_mapping(self):
        self.assertEqual(result_for_status(200), AuditResult.SUCCESS)
        self.assertEqual(result_for_status(201), AuditResult.SUCCESS)
        self.assertEqual(result_for_status(401), AuditResult.DENIED)
        self.assertEqual(result_for_status(403), AuditResult.DENIED)
        self.assertEqual(result_for_status(400), AuditResult.FAILED)
        self.assertEqual(result_for_status(404), AuditResult.FAILED)
        self.assertEqual(result_for_status(500), AuditResult.FAILED)


class MiddlewareEndToEndTests(APITestCase):
    """Drive real requests through the real middleware and read the log back.

    This is the test that would have caught the original complaint.
    """

    def setUp(self):
        self.user = User.objects.create_user(
            email="audit-e2e@example.com",
            password="StrongPass123!",
            first_name="Karim",
            last_name="Director",
        )
        Group.objects.get_or_create(name="Administrator")[0].user_set.add(self.user)
        AuditEvent.objects.all().delete()

    def _latest(self):
        event = AuditEvent.objects.order_by("-created_at").first()
        self.assertIsNotNone(event, "no audit event was recorded")
        return event

    def test_a_failed_create_records_a_readable_summary_and_a_reason(self):
        self.client.force_authenticate(self.user)
        response = self.client.post(
            "/api/v1/transfers/cash-transfers/",
            {"from_entity_type": "company", "to_entity_type": "company"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        event = self._latest()
        self.assertEqual(event.result, AuditResult.FAILED)
        self.assertEqual(event.action, "create")
        self.assertIn("could not create", event.summary)
        self.assertTrue(event.reason, "the reason must explain why the request failed")
        self.assertIn("Karim Director", event.summary)

    def test_a_successful_create_names_the_new_record(self):
        from datetime import date

        from apps.companies.models import Company

        alpha = Company.objects.create(
            name="Audit Alpha", registration_number="RC-AA", tax_id="IF-AA",
            address="Casa", phone="0500000000", email="aa@example.invalid",
        )
        beta = Company.objects.create(
            name="Audit Beta", registration_number="RC-AB", tax_id="IF-AB",
            address="Casa", phone="0500000001", email="ab@example.invalid",
        )
        self.client.force_authenticate(self.user)
        response = self.client.post(
            "/api/v1/transfers/cash-transfers/",
            {
                "from_entity_type": "company",
                "from_company": str(alpha.pk),
                "to_entity_type": "company",
                "to_company": str(beta.pk),
                "amount": "100.00",
                "currency": "MAD",
                "transfer_date": date(2026, 8, 20).isoformat(),
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)

        event = self._latest()
        self.assertEqual(event.result, AuditResult.SUCCESS)
        self.assertEqual(event.action, "create")
        self.assertEqual(event.entity_type, "CashTransfer")
        self.assertTrue(event.entity_reference.startswith("TRF-"))
        self.assertIn("created cash transfer", event.summary)
        self.assertEqual(event.reason, "")

    def test_an_unauthenticated_write_is_recorded_as_denied_with_a_reason(self):
        response = self.client.post(
            "/api/v1/transfers/cash-transfers/", {}, format="json"
        )
        self.assertIn(response.status_code, (401, 403))

        event = self._latest()
        self.assertEqual(event.result, AuditResult.DENIED)
        self.assertIn("was not allowed to", event.summary)
        self.assertTrue(event.reason)

    def test_a_custom_action_is_recorded_by_its_own_name(self):
        from datetime import date

        from apps.companies.models import Company
        from apps.transfers.models import CashTransfer

        alpha = Company.objects.create(
            name="Audit Gamma", registration_number="RC-AG", tax_id="IF-AG",
            address="Casa", phone="0500000002", email="ag@example.invalid",
        )
        beta = Company.objects.create(
            name="Audit Delta", registration_number="RC-AD", tax_id="IF-AD",
            address="Casa", phone="0500000003", email="ad@example.invalid",
        )
        transfer = CashTransfer.objects.create(
            from_entity_type="company", from_company=alpha,
            to_entity_type="company", to_company=beta,
            amount="100.0000", currency="MAD", transfer_date=date(2026, 8, 20),
            created_by=self.user,
        )
        self.client.force_authenticate(self.user)
        response = self.client.post(
            f"/api/v1/transfers/cash-transfers/{transfer.pk}/confirm/", {}, format="json"
        )
        self.assertEqual(response.status_code, 200, response.data)

        event = self._latest()
        self.assertEqual(event.action, "confirm")
        self.assertIn("confirmed", event.summary)
        self.assertEqual(event.entity_id, str(transfer.pk))

    def test_reads_are_not_logged(self):
        self.client.force_authenticate(self.user)
        self.client.get("/api/v1/transfers/cash-transfers/")
        self.assertEqual(AuditEvent.objects.count(), 0)
