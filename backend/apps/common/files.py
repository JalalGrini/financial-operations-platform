"""Helpers for streaming private ImageField files."""

import mimetypes

from django.http import FileResponse
from rest_framework import status
from rest_framework.response import Response


def private_image_response(file_field, *, missing):
    """Return the stored image, or 404 if the row has no readable file.

    Do not call ``storage.exists()`` first. django-storages reports every key
    as missing when overwrite is enabled, and R2 HeadObject can 400 while
    GetObject still succeeds. ``open()`` is the same path inventory already uses.
    """
    if not file_field:
        return Response({"detail": missing}, status=status.HTTP_404_NOT_FOUND)
    try:
        handle = file_field.open("rb")
    except FileNotFoundError:
        return Response({"detail": missing}, status=status.HTTP_404_NOT_FOUND)
    name = getattr(file_field, "name", "") or "image"
    response = FileResponse(
        handle,
        content_type=mimetypes.guess_type(name)[0] or "image/jpeg",
    )
    response["Content-Disposition"] = f'inline; filename="{name.rsplit("/", 1)[-1]}"'
    response["Cache-Control"] = "private, no-store"
    response["X-Content-Type-Options"] = "nosniff"
    return response
