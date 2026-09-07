from django.conf import settings


class SecurityHeadersMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        response.setdefault(
            "Content-Security-Policy",
            getattr(
                settings,
                "CONTENT_SECURITY_POLICY",
                "default-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
            ),
        )
        response.setdefault(
            "Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()"
        )
        response.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.setdefault("Cross-Origin-Opener-Policy", "same-origin")
        response.setdefault("X-Permitted-Cross-Domain-Policies", "none")
        return response
