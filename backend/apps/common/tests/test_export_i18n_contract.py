"""Guard for export header translation (v17.26).

Two failure modes are worth a test here, and they pull in opposite directions:

1. A new export column is declared in English and nobody translates it, so a
   French user gets a file with one English column among fifteen French ones.
   The static scan below catches that: every header declared anywhere in an
   `export_columns` tuple must exist in the catalogue.

2. Somebody "helpfully" adds the printed CNSS and personnel form headers to
   the catalogue. Those are official Moroccan forms - SOCIETE, NBRE J, STE,
   LIEU, NJD, S BRUT - and translating them breaks the correspondence with the
   paper document the file is filed against. That must stay impossible, so it
   is asserted as an absence.

The scan reads the source rather than importing the viewsets: importing pulls
in the whole Django app registry and a header can also be declared on a mixin
or built in a helper, while the text itself is always right there in the file.
"""

from __future__ import annotations

import re
from pathlib import Path
from types import SimpleNamespace

import pytest

from apps.common.export_i18n import (
    DEFAULT_EXPORT_LANG,
    HEADER_TRANSLATIONS,
    PRINTED_FORM_HEADERS,
    SHEET_TRANSLATIONS,
    SUPPORTED_EXPORT_LANGS,
    normalise_lang,
    resolve_export_lang,
    translate_columns,
    translate_header,
    translate_sheet_name,
)

APPS = Path(__file__).resolve().parents[2]

#: Headers that are intentionally identical in all three languages. RIB is an
#: international banking term; it is written "RIB" in French, English and in
#: Moroccan Arabic banking usage. Anything added here needs a reason.
UNTRANSLATED_BY_DESIGN = {"RIB", "CIN", "ICE", "RC", "CNSS"}

#: Languages that must carry a translation for every header.
TRANSLATED_LANGS = tuple(
    lang for lang in SUPPORTED_EXPORT_LANGS if lang != DEFAULT_EXPORT_LANG
)


def _strip_comments(source: str) -> str:
    """Blank out comments so a commented-out column is not counted."""
    return re.sub(r"(?m)#[^\n]*", "", source)


#: Ends a declaration window: the next function or class at any indentation.
#: Anchored to a newline so `def` inside a string or a type annotation does not
#: cut the window short.
_WINDOW_END = re.compile(r"\n[ \t]*(?:def |class |@)")

#: Hard cap so a marker in a file with no following `def` cannot swallow the
#: rest of the module and pick up unrelated 2-tuples.
_WINDOW_MAX = 4000


def _declaration_window(source: str, start: int) -> str:
    """Return the text from `start` to the next function/class definition.

    Bracket matching was tried first and cannot serve both declaration shapes:
    `export_columns = [` opens immediately, while `def _cnss_columns()` opens
    with an empty signature followed by a `list[...]` annotation, so any
    "first bracket" rule finds the wrong one and skips the 43 personnel
    headers entirely. Reading a window and letting PAIR do the work has no
    such failure mode.
    """
    window = source[start : start + _WINDOW_MAX]
    end = _WINDOW_END.search(window)
    return window[: end.start()] if end else window


#: `("field.path", "Header Text")` - the shape every export column uses.
PAIR = re.compile(r'\(\s*"[^"]+"\s*,\s*"([^"]+)"\s*\)')

#: Where columns are declared: the mixin attribute on viewsets, and the two
#: personnel helpers that build the wide CNSS and payroll exports.
DECLARATIONS = (
    "export_columns",
    "def _cnss_columns",
    "def _payroll_columns",
)


def _declared_headers() -> dict[str, list[str]]:
    """Every English header declared in the backend, by file."""
    found: dict[str, list[str]] = {}
    for path in sorted(APPS.rglob("*.py")):
        if "__pycache__" in path.parts or "/tests/" in str(path):
            continue
        source = _strip_comments(path.read_text(encoding="utf-8"))
        for marker in DECLARATIONS:
            for match in re.finditer(re.escape(marker), source):
                window = _declaration_window(source, match.end())
                headers = PAIR.findall(window)
                if headers:
                    found.setdefault(str(path.relative_to(APPS)), []).extend(headers)
    return found


DECLARED = _declared_headers()
ALL_DECLARED = sorted({h for headers in DECLARED.values() for h in headers})


class TestNotVacuous:
    """If the scan finds nothing, every assertion below passes for free."""

    def test_the_scan_found_the_export_declarations(self):
        assert len(DECLARED) >= 6, (
            "expected export columns in at least the six wired list views plus "
            f"personnel; found {sorted(DECLARED)}"
        )
        assert len(ALL_DECLARED) >= 40, (
            f"only {len(ALL_DECLARED)} headers found; the scan is probably broken"
        )

    def test_the_catalogue_is_populated(self):
        assert len(HEADER_TRANSLATIONS) >= 60
        assert len(SHEET_TRANSLATIONS) >= 5
        assert len(PRINTED_FORM_HEADERS) >= 20


class TestEveryHeaderIsTranslated:
    def test_all_declared_headers_are_in_the_catalogue(self):
        missing = [
            header
            for header in ALL_DECLARED
            if header not in HEADER_TRANSLATIONS
            and header not in PRINTED_FORM_HEADERS
            and header not in UNTRANSLATED_BY_DESIGN
        ]
        assert missing == [], (
            "these export headers would leave the building in English: "
            f"{missing}. Add them to HEADER_TRANSLATIONS in "
            "apps/common/export_i18n.py."
        )

    @pytest.mark.parametrize("lang", TRANSLATED_LANGS)
    def test_every_catalogue_entry_covers_every_language(self, lang):
        incomplete = [
            header
            for header, translations in HEADER_TRANSLATIONS.items()
            if not translations.get(lang, "").strip()
        ]
        assert incomplete == [], f"{lang} translation missing for: {incomplete}"

    @pytest.mark.parametrize("lang", TRANSLATED_LANGS)
    def test_every_sheet_name_covers_every_language(self, lang):
        incomplete = [
            name
            for name, translations in SHEET_TRANSLATIONS.items()
            if not translations.get(lang, "").strip()
        ]
        assert incomplete == [], f"{lang} sheet name missing for: {incomplete}"

    def test_arabic_entries_are_in_arabic_script(self):
        """Catches French pasted into the Arabic column."""
        arabic = re.compile(r"[\u0600-\u06FF]")
        values = [
            translations["ar"]
            for translations in HEADER_TRANSLATIONS.values()
            if len(translations.get("ar", "")) > 3
        ]
        assert len(values) >= 50
        scripted = [value for value in values if arabic.search(value)]
        assert len(scripted) / len(values) > 0.9


class TestPrintedFormsAreNeverTranslated:
    """The official CNSS / personnel forms must read identically everywhere."""

    def test_no_printed_header_is_in_the_catalogue(self):
        leaked = sorted(PRINTED_FORM_HEADERS & set(HEADER_TRANSLATIONS))
        assert leaked == [], (
            "these belong to the official printed forms and must not be "
            f"translated: {leaked}"
        )

    @pytest.mark.parametrize("lang", SUPPORTED_EXPORT_LANGS)
    def test_printed_headers_pass_through_unchanged(self, lang):
        for header in PRINTED_FORM_HEADERS:
            assert translate_header(header, lang) == header

    @pytest.mark.parametrize("lang", SUPPORTED_EXPORT_LANGS)
    def test_the_cnss_form_row_survives_translate_columns(self, lang):
        """The real declaration header row, translated as a unit."""
        row = [
            ("company", "SOCIETE"),
            ("cnss_number", "N\u00b0 IMMATRICULATION"),
            ("full_name", "NOM ET PRENOM"),
            ("declared_days", "NBRE J"),
            ("cin", "CIN"),
            ("situation", "SITUATION"),
        ]
        assert translate_columns(row, lang) == row


class TestTranslationBehaviour:
    def test_unknown_headers_are_left_alone(self):
        """The safety property: absence from the catalogue means untouched."""
        assert translate_header("Some Brand New Column", "fr") == (
            "Some Brand New Column"
        )

    def test_english_is_a_no_op(self):
        for header in list(HEADER_TRANSLATIONS)[:20]:
            assert translate_header(header, "en") == header

    def test_a_known_header_actually_changes(self):
        # Without this, every test above could pass with an identity mapping.
        assert translate_header("Net Salary", "fr") == "Salaire net"
        assert translate_header("Net Salary", "ar") != "Net Salary"

    def test_net_salary_is_untouched_in_english(self):
        """Pins the assumption in apps/personnel/tests/test_services.py.

        That test asserts b"Net Salary" appears in the payroll export body.
        Localising the default headers would have broken it for any non-English
        request; it stays true because English is the default and a no-op.
        """
        columns = [("calculated_net_salary", "Net Salary")]
        assert translate_columns(columns, DEFAULT_EXPORT_LANG) == columns

    def test_translate_columns_preserves_field_paths(self):
        """Only the label may change - the field is the data contract."""
        columns = [("company.name", "Company"), ("net", "Net Salary")]
        translated = translate_columns(columns, "fr")
        assert [field for field, _ in translated] == [
            field for field, _ in columns
        ]
        assert [label for _, label in translated] != [
            label for _, label in columns
        ]

    def test_sheet_names_translate_and_tolerate_unknowns(self):
        assert translate_sheet_name("Companies", "fr") != "Companies"
        assert translate_sheet_name("CNSS 06 2026", "fr") == "CNSS 06 2026"


class TestLanguageResolution:
    @pytest.mark.parametrize(
        "value,expected",
        [
            ("fr", "fr"),
            ("FR", "fr"),
            ("fr-MA", "fr"),
            ("ar-MA", "ar"),
            ("en-GB", "en"),
            ("de", "en"),
            ("", "en"),
            (None, "en"),
            ("../../etc/passwd", "en"),
        ],
    )
    def test_normalise_lang(self, value, expected):
        assert normalise_lang(value) == expected

    def test_query_string_wins_over_body(self):
        request = SimpleNamespace(
            query_params={"lang": "fr"}, data={"lang": "ar"}
        )
        assert resolve_export_lang(request) == "fr"

    def test_body_is_used_when_the_query_string_is_silent(self):
        request = SimpleNamespace(query_params={}, data={"lang": "ar"})
        assert resolve_export_lang(request) == "ar"

    def test_defaults_to_english_when_nothing_is_supplied(self):
        request = SimpleNamespace(query_params={}, data={})
        assert resolve_export_lang(request) == "en"

    def test_survives_a_request_without_the_attributes(self):
        assert resolve_export_lang(None) == "en"
        assert resolve_export_lang(SimpleNamespace()) == "en"

    def test_a_non_dict_body_does_not_raise(self):
        """Multipart and streamed bodies are not dicts."""
        request = SimpleNamespace(query_params={}, data="raw body")
        assert resolve_export_lang(request) == "en"


class TestWiring:
    """The catalogue is useless if nothing calls it."""

    def test_the_generic_list_export_resolves_and_translates(self):
        source = (APPS / "common" / "export_mixin.py").read_text(encoding="utf-8")
        assert "resolve_export_lang(request)" in source
        assert "translate_columns(" in source
        assert "translate_sheet_name(" in source

    def test_the_personnel_reports_take_a_language(self):
        source = (APPS / "personnel" / "services.py").read_text(encoding="utf-8")
        assert 'lang: str = "en"' in source
        # Printed templates must be selected before any translation happens.
        assert 'if template == "declaration":' in source
        assert 'if template == "monthly_list":' in source

    def test_the_report_views_pass_the_requested_language(self):
        source = (APPS / "personnel" / "views.py").read_text(encoding="utf-8")
        assert source.count('lang=normalise_lang(request.data.get("lang"))') == 2
