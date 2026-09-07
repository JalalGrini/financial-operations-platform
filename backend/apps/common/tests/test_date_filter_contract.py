"""Contract guard for the shared date-range filter (v17.25).

The failure mode this defends against is the quiet one: a date filter that is
ignored shows MORE rows than the user asked for, and nothing on screen says
the filter did not apply. That is worse than an error, because the list still
looks authoritative.

The DateTimeField case is the other classic: comparing a timestamp column
against a bare date drops everything after midnight on the closing day, so
"1 to 31 August" silently loses 31 August.

These tests build querysets but never evaluate them, so they need no database
and cannot be skipped by a missing fixture.
"""

import re
from pathlib import Path
from types import SimpleNamespace

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import SimpleTestCase
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.test import APIClient, APITestCase

from apps.common.querying import apply_date_range
from apps.deadlines.models import Deadline
from apps.transfers.models import CashTransfer

APPS_DIR = Path(__file__).resolve().parent.parent.parent

User = get_user_model()

# Every list that gained date filtering in v17.25, with the field it filters.
WIRED_LISTS = {
    "personnel/views.py": ["declaration_start_date", "hire_date"],
    "parties/views.py": ["created_at"],
    "companies/views.py": ["created_at"],
    "transfers/views.py": ["transfer_date"],
    "deadlines/views.py": ["due_at"],
    # The three older hand-rolled copies, migrated onto the shared helper.
    # v17.25 left them alone as "they work and are covered"; they did not
    # validate, so a well-formed but impossible date was a 500 on user input.
    "audit_log/views.py": ["created_at"],
    "financial_records/views.py": ["record_date"],
    "inventory/views.py": ["occurred_on"],
}

# Params must never be fed to the ORM directly again. Each entry is a lookup
# that only appears if someone reintroduces a hand-rolled filter.
BANNED_RAW_LOOKUPS = {
    "audit_log/views.py": ["created_at__date__gte", "created_at__date__lte"],
    "financial_records/views.py": ["record_date__gte", "record_date__lte"],
    "inventory/views.py": ["occurred_on__gte", "occurred_on__lte"],
}


def request_with(**params):
    """Minimal stand-in: the helper only ever reads query_params."""
    return SimpleNamespace(query_params=params)


def strip_comments(source: str) -> str:
    """Drop docstrings and comments so prose never satisfies a source check."""
    source = re.sub(r'"""[\s\S]*?"""', "", source)
    return re.sub(r"(?m)#.*$", "", source)


class DateRangeFilterTests(SimpleTestCase):
    def test_absent_parameters_leave_the_queryset_untouched(self):
        """Every existing caller and saved URL must keep working unchanged."""
        base = CashTransfer.objects.all()
        self.assertIs(apply_date_range(base, request_with(), "transfer_date"), base)

    def test_blank_parameters_are_ignored(self):
        base = CashTransfer.objects.all()
        result = apply_date_range(base, request_with(date_from="", date_to=""), "transfer_date")
        self.assertIs(result, base)

    def test_date_from_and_date_to_are_both_applied_inclusively(self):
        result = apply_date_range(
            CashTransfer.objects.all(),
            request_with(date_from="2026-06-01", date_to="2026-06-30"),
            "transfer_date",
        )
        sql = str(result.query)
        self.assertIn("transfer_date", sql)
        self.assertIn(">=", sql)
        self.assertIn("<=", sql)

    def test_a_datetime_column_is_compared_by_calendar_day(self):
        """Otherwise the closing day of the range disappears from the results."""
        result = apply_date_range(
            Deadline.objects.all(), request_with(date_to="2026-08-31"), "due_at"
        )
        # Django renders the __date lookup as a date cast/extraction; a bare
        # column comparison would show none of these.
        sql = str(result.query).upper()
        self.assertTrue(
            "DATE(" in sql or "::DATE" in sql or "DJANGO_DATETIME_CAST_DATE" in sql,
            sql,
        )

    def test_an_unparseable_or_impossible_date_is_rejected_not_ignored(self):
        # 2026-13-01 is the interesting one: parse_date RAISES rather than
        # returning None, so an unguarded helper answers 500 instead of 400.
        for bad in ("31-08-2026", "august", "2026-13-01", "2026-02-30"):
            with self.subTest(value=bad):
                with self.assertRaises(ValidationError):
                    apply_date_range(
                        CashTransfer.objects.all(),
                        request_with(date_from=bad),
                        "transfer_date",
                    )

    def test_whitespace_around_a_valid_date_is_tolerated(self):
        result = apply_date_range(
            CashTransfer.objects.all(), request_with(date_from=" 2026-06-01 "), "transfer_date"
        )
        self.assertIn("transfer_date", str(result.query))


class DateFilterWiringTests(SimpleTestCase):
    """The helper is only useful where it is actually called."""

    def test_every_list_that_gained_date_filtering_still_calls_the_helper(self):
        for relative, fields in WIRED_LISTS.items():
            source = strip_comments((APPS_DIR / relative).read_text(encoding="utf-8"))
            with self.subTest(module=relative):
                self.assertIn("apply_date_range", source)
                for field in fields:
                    self.assertRegex(
                        source,
                        r"apply_date_range\([^)]*%s" % re.escape(field),
                        "%s should filter on %s" % (relative, field),
                    )

    def test_no_module_feeds_a_raw_date_parameter_into_the_orm(self):
        """The three migrated modules must not grow a hand-rolled filter again.

        This is the assertion that would have caught the original defect. The
        old code read like correct Django - `q.filter(occurred_on__gte=p[...])`
        - and there is nothing about it for a unit test to fail on until a user
        sends a bad date.
        """
        for relative, lookups in BANNED_RAW_LOOKUPS.items():
            source = strip_comments((APPS_DIR / relative).read_text(encoding="utf-8"))
            for lookup in lookups:
                with self.subTest(module=relative, lookup=lookup):
                    self.assertNotIn(
                        lookup,
                        source,
                        "%s builds %s by hand; route it through apply_date_range "
                        "so a bad date is a 400 rather than a 500." % (relative, lookup),
                    )

    def test_the_wiring_map_is_populated(self):
        """Vacuity check: an emptied map would make the test above pass."""
        self.assertGreaterEqual(len(WIRED_LISTS), 8)
        self.assertGreaterEqual(sum(len(v) for v in WIRED_LISTS.values()), 9)
        self.assertGreaterEqual(len(BANNED_RAW_LOOKUPS), 3)
        self.assertGreaterEqual(sum(len(v) for v in BANNED_RAW_LOOKUPS.values()), 6)

    def test_the_scanned_files_exist_and_are_real_modules(self):
        for relative in WIRED_LISTS:
            path = APPS_DIR / relative
            with self.subTest(module=relative):
                self.assertTrue(path.exists(), path)
                self.assertGreater(len(path.read_text(encoding="utf-8")), 1000)


class BadDateOverHttpTests(APITestCase):
    """Drive the real endpoints, because the source scan cannot prove the status.

    The scan above proves the helper is wired. It cannot prove what a client
    actually receives, and "400 not 500" is the whole point of the fix: a 500 is
    an unhandled exception, it pages whoever is on call, and it tells the user
    nothing about which field they got wrong.

    URLs are literal, matching the convention in
    test_admin_only_modules_contract.py - route names here are namespaced and
    have been guessed wrong before.
    """

    LISTS = [
        ("audit log events", "/api/v1/audit-log/events/"),
        ("financial records", "/api/v1/financial-records/records/"),
        ("inventory movements", "/api/v1/inventory/movements/"),
    ]

    # Well-formed but impossible dates are the interesting class: parse_date
    # RAISES on these rather than returning None, and Django's DateField raises
    # a non-DRF ValidationError that the exception handler does not convert.
    BAD_DATES = ["2026-13-01", "2026-02-30", "31-08-2026", "not-a-date"]

    @classmethod
    def setUpTestData(cls):
        user = User.objects.create_user(
            email="datefilter-admin@example.invalid",
            password="testpass123",
            first_name="Date",
            last_name="Filter",
        )
        group, _ = Group.objects.get_or_create(name="Administrator")
        user.groups.add(group)
        cls.user = user

    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_a_bad_date_is_a_400_on_every_migrated_list(self):
        for label, url in self.LISTS:
            for bad in self.BAD_DATES:
                with self.subTest(endpoint=label, value=bad):
                    response = self.client.get(url, {"date_from": bad})
                    self.assertEqual(
                        response.status_code,
                        status.HTTP_400_BAD_REQUEST,
                        "%s answered %s for date_from=%s; a bad date must be a "
                        "validation error, not a server error."
                        % (label, response.status_code, bad),
                    )

    def test_the_error_names_the_parameter_that_was_wrong(self):
        response = self.client.get(self.LISTS[0][1], {"date_to": "2026-13-01"})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("date_to", str(response.data))

    def test_a_valid_range_is_accepted(self):
        """Vacuity check: if these lists 400 on everything, the test above is
        meaningless."""
        for label, url in self.LISTS:
            with self.subTest(endpoint=label):
                response = self.client.get(
                    url, {"date_from": "2026-01-01", "date_to": "2026-12-31"}
                )
                self.assertEqual(response.status_code, status.HTTP_200_OK, label)

    def test_absent_dates_are_accepted(self):
        for label, url in self.LISTS:
            with self.subTest(endpoint=label):
                self.assertEqual(
                    self.client.get(url).status_code, status.HTTP_200_OK, label
                )
