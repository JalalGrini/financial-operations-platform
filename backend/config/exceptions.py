"""Custom exception handler for consistent, non-misleading API errors."""

import logging

from django.db import IntegrityError
from rest_framework import status as drf_status
from rest_framework.response import Response
from rest_framework.views import exception_handler

logger = logging.getLogger(__name__)

UNIQUE_CONSTRAINT_FIELDS = {
    "unique_personnel_cin": "cin",
    "personnel_person_cin_key": "cin",
    "unique_company_reg_number": "registration_number",
    "unique_company_tax_id": "tax_id",
    "unique_company_vat_number": "vat_number",
    "fdt_unique_type_version": "version",
    "fdt_one_default_published": "record_type",
    "fdtf_unique_template_key": "key",
}


def _integrity_metadata(exc):
    cause = getattr(exc, "__cause__", None)
    sqlstate = getattr(cause, "sqlstate", None) or getattr(cause, "pgcode", None)
    diag = getattr(cause, "diag", None)
    constraint = getattr(diag, "constraint_name", None) if diag else None
    message = str(cause or exc)
    return sqlstate, constraint, message


def _is_unique_violation(exc):
    sqlstate, _constraint, message = _integrity_metadata(exc)
    lowered = message.lower()
    return (
        sqlstate == "23505"
        or "unique constraint" in lowered
        or "unique constraint failed" in lowered
    )


def custom_exception_handler(exc, context):
    """Wrap DRF errors while translating only proven unique conflicts.

    Not-null, foreign-key, check-constraint, and unknown database defects are
    deliberately *not* disguised as user duplicate errors. They remain 500s and
    are logged so engineering can repair the underlying contract.
    """
    if isinstance(exc, IntegrityError):
        if _is_unique_violation(exc):
            _sqlstate, constraint, _message = _integrity_metadata(exc)
            field = UNIQUE_CONSTRAINT_FIELDS.get(constraint, "non_field_errors")
            text = (
                "A record with the same unique value already exists "
                "(it may be archived — check 'Show Archived' or use a different value)."
            )
            field_errors = {field: [text]}
            return Response(
                {
                    "success": False,
                    "message": "A record with the same unique value already exists.",
                    "errors": field_errors,
                    **field_errors,
                },
                status=drf_status.HTTP_400_BAD_REQUEST,
            )
        logger.exception(
            "Unexpected database integrity failure in %s",
            context.get("view") if context else "unknown view",
        )
        return None

    response = exception_handler(exc, context)
    if response is not None:
        original = response.data
        payload = {
            "success": False,
            "message": "An error occurred.",
            "errors": original,
        }
        if isinstance(original, dict):
            payload.update(original)
        response.data = payload
    return response
