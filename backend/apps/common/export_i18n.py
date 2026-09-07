"""Translation of export column headers and sheet names (v17.26).

WHY THIS EXISTS
---------------
Exports were always written in English no matter which language the user had
selected. A Director working in French would set the whole interface to French,
export the client list, and get a file headed `Reference / Name / Trade name`.
The screen was translated; the artefact that leaves the building was not.

WHY IT IS A PYTHON DICT AND NOT DJANGO'S gettext
------------------------------------------------
The frontend owns the language. It is chosen per user in the interface and
lives in `document.documentElement.lang`, not in an `Accept-Language` header
and not in a server-side session. Wiring gettext would mean standing up a
locale directory, compiling .mo files as part of a build that currently has no
compile step, and still having to map the frontend's locale onto Django's.
A dict is inspectable, diffable, testable, and needs no build step. When the
project grows a translation workflow this module is the single place to swap.

THE ONE RULE THAT MATTERS
-------------------------
The printed CNSS declaration and the monthly personnel list are official
Moroccan forms. Their headers are French administrative vocabulary - SOCIETE,
NBRE J, STE, LIEU, NJD, S BRUT - and they are NOT translatable. They must read
exactly the same in every language or the file stops matching the paper form it
is filed alongside. Those headers are deliberately absent from the catalogue
below, so passing one through `translate_header` returns it unchanged, and
`test_export_i18n_contract.py` fails if any of them is ever added.
"""

from __future__ import annotations

#: Languages the interface offers. Anything else falls back to English.
SUPPORTED_EXPORT_LANGS = ("en", "fr", "ar")
DEFAULT_EXPORT_LANG = "en"

#: English header -> {lang: translation}.
#:
#: Keyed by the exact English string declared in `export_columns`, so a header
#: and its translation cannot drift apart in different files: a header that is
#: renamed simply stops matching and is caught by the contract test.
HEADER_TRANSLATIONS: dict[str, dict[str, str]] = {
    # -- shared identity / contact ------------------------------------------
    "Reference": {"fr": "Référence", "ar": "المرجع"},
    "Name": {"fr": "Nom", "ar": "الاسم"},
    "Trade name": {"fr": "Nom commercial", "ar": "الاسم التجاري"},
    "Registration number": {"fr": "Numéro d'immatriculation", "ar": "رقم التسجيل"},
    "Tax ID": {"fr": "Identifiant fiscal", "ar": "المعرف الضريبي"},
    "VAT number": {"fr": "Numéro de TVA", "ar": "رقم الضريبة على القيمة المضافة"},
    "Email": {"fr": "E-mail", "ar": "البريد الإلكتروني"},
    "Phone": {"fr": "Téléphone", "ar": "الهاتف"},
    "Address": {"fr": "Adresse", "ar": "العنوان"},
    "Status": {"fr": "Statut", "ar": "الحالة"},
    "Currency": {"fr": "Devise", "ar": "العملة"},
    "Company": {"fr": "Société", "ar": "الشركة"},
    "Kind": {"fr": "Type", "ar": "النوع"},
    "First name": {"fr": "Prénom", "ar": "الاسم الشخصي"},
    "Last name": {"fr": "Nom de famille", "ar": "الاسم العائلي"},
    "Payment terms": {"fr": "Conditions de paiement", "ar": "شروط الأداء"},
    # -- deadlines -----------------------------------------------------------
    "Title": {"fr": "Intitulé", "ar": "الموضوع"},
    "Owner": {"fr": "Responsable", "ar": "المسؤول"},
    "Due at": {"fr": "Échéance", "ar": "تاريخ الاستحقاق"},
    "Priority": {"fr": "Priorité", "ar": "الأولوية"},
    "Period type": {"fr": "Type de période", "ar": "نوع الفترة"},
    "Recurrence (days)": {"fr": "Récurrence (jours)", "ar": "التكرار (بالأيام)"},
    "Completed at": {"fr": "Date de clôture", "ar": "تاريخ الإنجاز"},
    "Description": {"fr": "Description", "ar": "الوصف"},
    # -- financial records ---------------------------------------------------
    "Date": {"fr": "Date", "ar": "التاريخ"},
    "Record type": {"fr": "Type d'écriture", "ar": "نوع السجل"},
    "Category": {"fr": "Catégorie", "ar": "الفئة"},
    "Client": {"fr": "Client", "ar": "العميل"},
    "Supplier": {"fr": "Fournisseur", "ar": "المورد"},
    "Total amount": {"fr": "Montant total", "ar": "المبلغ الإجمالي"},
    # -- cash transfers ------------------------------------------------------
    "From type": {"fr": "Type émetteur", "ar": "نوع المُرسِل"},
    "From company": {"fr": "Société émettrice", "ar": "الشركة المُرسِلة"},
    "To type": {"fr": "Type destinataire", "ar": "نوع المستقبِل"},
    "To company": {"fr": "Société destinataire", "ar": "الشركة المستقبِلة"},
    "Amount": {"fr": "Montant", "ar": "المبلغ"},
    "Note": {"fr": "Remarque", "ar": "ملاحظة"},
    # -- personnel: CNSS default (wide) export -------------------------------
    "Company Ref": {"fr": "Réf. société", "ar": "مرجع الشركة"},
    "CNSS Number": {"fr": "Numéro CNSS", "ar": "رقم الضمان الاجتماعي"},
    "Last Name": {"fr": "Nom de famille", "ar": "الاسم العائلي"},
    "First Name": {"fr": "Prénom", "ar": "الاسم الشخصي"},
    "Full Name": {"fr": "Nom complet", "ar": "الاسم الكامل"},
    "Declared Days": {"fr": "Jours déclarés", "ar": "الأيام المصرح بها"},
    "Situation": {"fr": "Situation", "ar": "الوضعية"},
    "First Declaration": {"fr": "Première déclaration", "ar": "أول تصريح"},
    "Start Date": {"fr": "Date de début", "ar": "تاريخ البداية"},
    "Stop Date": {"fr": "Date d'arrêt", "ar": "تاريخ التوقف"},
    "Resignation Date": {"fr": "Date de démission", "ar": "تاريخ الاستقالة"},
    "Current State": {"fr": "État actuel", "ar": "الحالة الحالية"},
    "Observation": {"fr": "Observation", "ar": "ملاحظة"},
    # -- audit log CSV (v17.29) ---------------------------------------------
    # That writer predates ExportableListMixin, so it was missed when this
    # module was wired in v17.26 and always emitted English headers.
    "Time": {"fr": "Heure", "ar": "الوقت"},
    "Actor": {"fr": "Auteur", "ar": "الفاعل"},
    "Role": {"fr": "Rôle", "ar": "الدور"},
    "Action": {"fr": "Action", "ar": "الإجراء"},
    "Entity": {"fr": "Entité", "ar": "الكيان"},
    "Result": {"fr": "Résultat", "ar": "النتيجة"},
    "Summary": {"fr": "Résumé", "ar": "الملخص"},
    "Reason": {"fr": "Motif", "ar": "السبب"},
    "Path": {"fr": "Chemin", "ar": "المسار"},
    # Kept as-is in French: "Correlation ID" is the term used in the logs and
    # in support conversations, and inventing a French one would break the link
    # between the CSV column and what an engineer greps for.
    "Correlation ID": {"fr": "Correlation ID", "ar": "معرّف الارتباط"},

    # -- inventory CSV (v17.29) ---------------------------------------------
    "Type": {"fr": "Type", "ar": "النوع"},
    "Quantity": {"fr": "Quantité", "ar": "الكمية"},
    "Unit": {"fr": "Unité", "ar": "الوحدة"},
    "Location": {"fr": "Emplacement", "ar": "الموقع"},
    "Purchase date": {"fr": "Date d'achat", "ar": "تاريخ الشراء"},
    "Unit cost": {"fr": "Coût unitaire", "ar": "تكلفة الوحدة"},
    "Low stock": {"fr": "Stock faible", "ar": "مخزون منخفض"},

    # -- personnel: payroll default (wide) export ----------------------------
    # RIB is deliberately absent: it is an international banking term and is
    # written the same way in all three languages.
    "Domain": {"fr": "Domaine", "ar": "المجال"},
    "City": {"fr": "Ville", "ar": "المدينة"},
    "Department": {"fr": "Département", "ar": "القسم"},
    "Emp Ref": {"fr": "Réf. employé", "ar": "مرجع الموظف"},
    "Hire Date": {"fr": "Date d'embauche", "ar": "تاريخ التوظيف"},
    "Period": {"fr": "Période", "ar": "الفترة"},
    "Scheduled Days": {"fr": "Jours prévus", "ar": "الأيام المبرمجة"},
    "Worked Days": {"fr": "Jours travaillés", "ar": "أيام العمل"},
    "Absence Days": {"fr": "Jours d'absence", "ar": "أيام الغياب"},
    "Fixed Gross": {"fr": "Brut fixe", "ar": "الأجر الخام الثابت"},
    "Gross Snapshot": {"fr": "Brut retenu", "ar": "الأجر الخام المعتمد"},
    "Supplements": {"fr": "Compléments", "ar": "التعويضات"},
    "Deductions": {"fr": "Retenues", "ar": "الاقتطاعات"},
    "Net Salary": {"fr": "Salaire net", "ar": "الأجر الصافي"},
    "Total Paid": {"fr": "Total versé", "ar": "مجموع المبالغ المؤداة"},
    "Remaining": {"fr": "Reste à payer", "ar": "المتبقي"},
    "Payment Method": {"fr": "Mode de paiement", "ar": "طريقة الأداء"},
}

#: Worksheet / PDF titles.
SHEET_TRANSLATIONS: dict[str, dict[str, str]] = {
    "Companies": {"fr": "Sociétés", "ar": "الشركات"},
    "Deadlines": {"fr": "Échéances", "ar": "الآجال"},
    "Financial records": {"fr": "Écritures financières", "ar": "السجلات المالية"},
    "Clients": {"fr": "Clients", "ar": "العملاء"},
    "Suppliers": {"fr": "Fournisseurs", "ar": "الموردون"},
    "Cash transfers": {"fr": "Transferts d'espèces", "ar": "التحويلات النقدية"},
    "Export": {"fr": "Export", "ar": "تصدير"},
}

#: Headers of the two official printed forms. Never translatable - see the
#: module docstring. Listed so the contract test can assert their absence
#: from the catalogue rather than trusting a comment.
PRINTED_FORM_HEADERS = frozenset(
    {
        # CNSS declaration
        "SOCIETE",
        "N° IMMATRICULATION",
        "NOM ET PRENOM",
        "NBRE J",
        # The declaration heads this column plain "CIN"; the monthly list uses
        # "N° CIN". Both must stay French. "CIN" is deliberately absent from
        # HEADER_TRANSLATIONS as well: like RIB it is a Moroccan
        # administrative abbreviation (Carte d'Identité Nationale) that is
        # written the same way in every language, and it appears in the wide
        # CNSS export too - so translating it there would have made one
        # English string mean two different things.
        "CIN",
        "SITUATION",
        "DATE 1ERE DECLARATION",
        "DATE RESILIATION",
        "ARCHIVE",
        # Monthly personnel list
        "STE",
        "LIEU",
        "NOM",
        "PRENOM",
        "N° CIN",
        "N° TELE",
        "DATE D'EM",
        "NJD",
        "S BRUT",
        "SUP",
        "S NET",
        "RIB",
        "TYPE PAI",
        "OBSERVATION",
    }
)


def normalise_lang(value: str | None) -> str:
    """Map anything the client sends onto a supported language.

    Accepts `fr`, `FR`, `fr-MA`, `fr_MA`. An unknown or missing value is
    English rather than an error: a wrong language on an export is a cosmetic
    problem, and refusing the download over it would not help anyone.
    """
    if not value:
        return DEFAULT_EXPORT_LANG
    base = str(value).strip().lower().replace("_", "-").split("-")[0]
    return base if base in SUPPORTED_EXPORT_LANGS else DEFAULT_EXPORT_LANG


def resolve_export_lang(request) -> str:
    """The language for this export request.

    `lang` is read from the query string first because exports are also
    triggered by plain links and new tabs, which cannot set a body. POST
    bodies are consulted second so the existing POST-based export calls can
    pass it too.
    """
    if request is None:
        return DEFAULT_EXPORT_LANG
    value = None
    params = getattr(request, "query_params", None)
    if params is not None:
        value = params.get("lang")
    if not value:
        data = getattr(request, "data", None)
        if isinstance(data, dict):
            value = data.get("lang")
    return normalise_lang(value)


def translate_header(header: str, lang: str) -> str:
    """Translate one column header, leaving unknown ones untouched.

    Unknown headers pass through on purpose. That is what keeps the printed
    forms safe, and it means a newly added column ships in English rather than
    breaking the export while somebody writes its translation.
    """
    lang = normalise_lang(lang)
    if lang == DEFAULT_EXPORT_LANG:
        return header
    return HEADER_TRANSLATIONS.get(header, {}).get(lang, header)


def translate_columns(
    columns: list[tuple[str, str]], lang: str
) -> list[tuple[str, str]]:
    """Translate the header half of `[(field, header)]`, keeping field paths.

    Field paths are the contract with the database and with the `columns=`
    query parameter, so they are never touched.
    """
    return [(field, translate_header(header, lang)) for field, header in columns]


def translate_sheet_name(name: str, lang: str) -> str:
    lang = normalise_lang(lang)
    if lang == DEFAULT_EXPORT_LANG:
        return name
    return SHEET_TRANSLATIONS.get(name, {}).get(lang, name)
