# apps/financial_records/validators.py
"""
Business rule validation for financial records.

Validators raise DjangoValidationError and never touch the database beyond
reading what they are given. Services own transactions; validators own rules.
"""

from decimal import Decimal

from django.core.exceptions import ValidationError
from django.utils.translation import gettext_lazy as _

ZERO = Decimal("0.0000")


def validate_lines_balance(lines):
    """Total debits must equal total credits.

    This is the defining invariant of double-entry bookkeeping. If it does not
    hold, the record does not describe a real movement of money: something has
    come from nowhere or vanished.

    Compared as Decimal. Doing this in float is how rounding errors become
    permanent accounting discrepancies.
    """
    total_debit = sum((line.debit for line in lines), ZERO)
    total_credit = sum((line.credit for line in lines), ZERO)

    if total_debit != total_credit:
        difference = total_debit - total_credit
        raise ValidationError(
            {
                "lines": _(
                    "Debits and credits must balance. Debits total %(debit)s, "
                    "credits total %(credit)s, a difference of %(difference)s."
                )
                % {
                    "debit": total_debit,
                    "credit": total_credit,
                    "difference": difference,
                }
            }
        )


def validate_has_lines(lines):
    """A record with no lines posts nothing and must not reach the books.

    Worth checking explicitly: an empty record balances trivially (0 == 0), so
    the balance check alone would let it through.
    """
    if not lines:
        raise ValidationError(
            {"lines": _("A financial record must have at least one line to be posted.")}
        )


def validate_line_amounts(lines):
    """Each line carries exactly one side, and no negative amounts.

    The database enforces this too. It is repeated here so the API can answer
    with a readable field error instead of surfacing an IntegrityError.
    """
    for line in lines:
        if line.debit < ZERO or line.credit < ZERO:
            raise ValidationError(
                {
                    "lines": _(
                        "Line %(number)s has a negative amount. Reverse the entry "
                        "by swapping debit and credit instead."
                    )
                    % {"number": line.line_number}
                }
            )
        if line.debit > ZERO and line.credit > ZERO:
            raise ValidationError(
                {
                    "lines": _(
                        "Line %(number)s carries both a debit and a credit. "
                        "Split it into two lines."
                    )
                    % {"number": line.line_number}
                }
            )
        if line.debit == ZERO and line.credit == ZERO:
            raise ValidationError(
                {"lines": _("Line %(number)s has no amount.") % {"number": line.line_number}}
            )


def validate_record_is_editable(record):
    """Posted and cancelled records are historical facts, not working documents.

    Corrections are made by cancelling and re-issuing, which leaves an audit
    trail. Silently editing a posted record would rewrite history.
    """
    if not record.is_editable:
        raise ValidationError(
            _(
                "Record %(reference)s is %(status)s and can no longer be modified. "
                "Cancel it and issue a correction instead."
            )
            % {"reference": record.reference, "status": record.get_status_display().lower()}
        )


def validate_can_be_posted(record, lines):
    """Everything that must be true at the moment a record enters the books."""
    if record.status != record.Status.DRAFT:
        raise ValidationError(
            _("Only draft records can be posted. %(reference)s is %(status)s.")
            % {
                "reference": record.reference,
                "status": record.get_status_display().lower(),
            }
        )
    validate_has_lines(lines)
    validate_line_amounts(lines)
    validate_lines_balance(lines)
