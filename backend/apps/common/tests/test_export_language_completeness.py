"""Every export writer must follow the selected language.

v17.26 wired `export_i18n` into `ExportableListMixin` and the personnel report
exports. Two writers predate that mixin and were missed, so they always emitted
English headers no matter what language the user had chosen:

    apps/audit_log/views.py   -> Time / Actor / Role / ...
    apps/inventory/views.py   -> Reference / Company / Type / ...

This file pins the fix and, more importantly, pins the RULE: system-generated
content follows the language, user-entered content never does.
"""

import re
from pathlib import Path

from django.test import SimpleTestCase

from apps.common.export_i18n import (
    DEFAULT_EXPORT_LANG,
    HEADER_TRANSLATIONS,
    SUPPORTED_EXPORT_LANGS,
    normalise_lang,
    resolve_export_lang,
    translate_header,
)

APPS = Path(__file__).resolve().parent.parent.parent


def strip_comments(source: str) -> str:
    source = re.sub(r'"""[\s\S]*?"""', "", source)
    return re.sub(r"(?m)#.*$", "", source)


# Writers that are NOT the shared mixin and must each localise their own header.
HAND_ROLLED_WRITERS = ("audit_log/views.py", "inventory/views.py")

AUDIT_HEADERS = (
    "Time",
    "Actor",
    "Role",
    "Company",
    "Action",
    "Entity",
    "Reference",
    "Result",
    "Summary",
    "Reason",
    "Path",
    "Correlation ID",
)

INVENTORY_HEADERS = (
    "Reference",
    "Company",
    "Type",
    "Name",
    "Quantity",
    "Unit",
    "Location",
    "Status",
    "Purchase date",
    "Unit cost",
    "Currency",
    "Low stock",
)


class HandRolledWritersLocaliseTests(SimpleTestCase):
    def test_each_hand_rolled_writer_calls_the_shared_translator(self):
        for relative in HAND_ROLLED_WRITERS:
            source = strip_comments((APPS / relative).read_text(encoding="utf-8"))
            with self.subTest(module=relative):
                self.assertIn("resolve_export_lang", source)
                self.assertIn("translate_header", source)

    def test_every_header_they_emit_has_a_translation(self):
        """A missing entry is the silent failure mode.

        `translate_header` returns the header unchanged when it is not in the
        table, which is right for a printed form and wrong for a column nobody
        got round to translating - the export succeeds and half the row is
        English.
        """
        for label in AUDIT_HEADERS + INVENTORY_HEADERS:
            with self.subTest(header=label):
                self.assertIn(
                    label,
                    HEADER_TRANSLATIONS,
                    f"{label!r} is emitted by a CSV export but has no translation, "
                    f"so that column stays English in French and Arabic.",
                )

    def test_each_translation_is_present_for_every_supported_language(self):
        for label in AUDIT_HEADERS + INVENTORY_HEADERS:
            entry = HEADER_TRANSLATIONS[label]
            for lang in SUPPORTED_EXPORT_LANGS:
                if lang == DEFAULT_EXPORT_LANG:
                    continue
                with self.subTest(header=label, lang=lang):
                    self.assertIn(lang, entry)
                    self.assertTrue(entry[lang].strip())

    def test_arabic_headers_are_in_arabic_script(self):
        """Guards against French being pasted into the Arabic slot."""
        arabic = re.compile(r"[\u0600-\u06FF]")
        checked = 0
        for label in AUDIT_HEADERS + INVENTORY_HEADERS:
            value = HEADER_TRANSLATIONS[label].get("ar", "")
            # "Correlation ID" is deliberately partly latin; skip pure-latin ones
            # only if they are the documented exceptions.
            if not arabic.search(value):
                self.fail(f"{label!r} Arabic header is not in Arabic script: {value!r}")
            checked += 1
        self.assertGreaterEqual(checked, 20)


class LanguageResolutionTests(SimpleTestCase):
    def test_a_missing_language_falls_back_to_english_rather_than_failing(self):
        self.assertEqual(normalise_lang(None), DEFAULT_EXPORT_LANG)
        self.assertEqual(normalise_lang("klingon"), DEFAULT_EXPORT_LANG)

    def test_regional_tags_resolve_to_their_base_language(self):
        for value in ("fr", "FR", "fr-MA", "fr_MA"):
            with self.subTest(value=value):
                self.assertEqual(normalise_lang(value), "fr")

    def test_the_query_string_wins_because_exports_are_plain_links(self):
        class Req:
            query_params = {"lang": "ar"}
            data = {"lang": "fr"}

        self.assertEqual(resolve_export_lang(Req()), "ar")

    def test_english_is_a_passthrough(self):
        # No lookup, so an untranslated header can never be mangled in English.
        self.assertEqual(translate_header("Correlation ID", "en"), "Correlation ID")


class PrintedFormsStayFrenchTests(SimpleTestCase):
    """The two paper forms must NOT follow the interface language.

    The CNSS declaration and the monthly personnel list are filed with Moroccan
    authorities. Their headers are French administrative vocabulary and must read
    identically in every language or the file stops matching the paper form.
    """

    PRINTED = ("SOCIETE", "NBRE J", "STE", "LIEU", "NJD", "S BRUT", "S NET", "CIN")

    def test_printed_headers_are_never_translated(self):
        for label in self.PRINTED:
            for lang in SUPPORTED_EXPORT_LANGS:
                with self.subTest(header=label, lang=lang):
                    self.assertEqual(
                        translate_header(label, lang),
                        label,
                        f"{label!r} belongs to a printed form and must not change "
                        f"with the interface language.",
                    )
