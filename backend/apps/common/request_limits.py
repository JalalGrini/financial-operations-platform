from django.http import JsonResponse

from apps.common.security import MAX_REQUEST_BODY_BYTES


class MaxBodySizeMiddleware:
    """Reject oversized bodies before they are buffered into R2/local storage."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        try:
            length = int(request.META.get("CONTENT_LENGTH") or 0)
        except (TypeError, ValueError):
            length = 0
        if length > MAX_REQUEST_BODY_BYTES:
            return JsonResponse({"detail": "Request body is too large."}, status=413)
        return self.get_response(request)
