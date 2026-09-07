# apps/authentication/cookies.py
"""
Centralized HttpOnly JWT cookie lifecycle helpers.

M1-A (Engineering Log: "Canonical Cookie Authentication and Runtime
Unification"): every prior view hand-rolled its own `set_cookie()` /
`delete_cookie()` calls with slightly different attribute values (see
Entry M1A-1's findings — the refresh cookie name was hard-coded as the
literal string `"refresh_token"` in three different places instead of
`settings.JWT_AUTH_REFRESH_COOKIE`, and `LogoutView` discarded the
response object its cookie deletions were applied to). This module is
the single source of truth for:

- Which cookie names are used (always read from settings, never
  hard-coded).
- Which attributes (`secure`, `httponly`, `samesite`, `path`, `domain`)
  are applied on both `set` and `delete`, so a cookie set with one set
  of attributes can never fail to be deleted because a delete call used
  different attributes (browsers require exact attribute matches,
  particularly `path` and `domain`, to actually clear a cookie).

Every view that needs to set or clear the access/refresh JWT cookies
MUST use these two functions rather than calling
`response.set_cookie()`/`response.delete_cookie()` directly.
"""
from django.conf import settings


def _access_cookie_kwargs():
    return {
        "key": settings.JWT_AUTH_COOKIE,
        "max_age": int(settings.SIMPLE_JWT["ACCESS_TOKEN_LIFETIME"].total_seconds()),
        "path": settings.JWT_AUTH_COOKIE_PATH,
        "domain": settings.JWT_AUTH_COOKIE_DOMAIN,
        "secure": settings.JWT_AUTH_COOKIE_SECURE,
        "httponly": True,
        "samesite": settings.JWT_AUTH_COOKIE_SAMESITE,
    }


def _refresh_cookie_kwargs():
    return {
        "key": settings.JWT_AUTH_REFRESH_COOKIE,
        "max_age": int(settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"].total_seconds()),
        "path": settings.JWT_AUTH_REFRESH_COOKIE_PATH,
        "domain": settings.JWT_AUTH_COOKIE_DOMAIN,
        "secure": settings.JWT_AUTH_COOKIE_SECURE,
        "httponly": True,
        "samesite": settings.JWT_AUTH_COOKIE_SAMESITE,
    }


def set_auth_cookies(response, access_token: str, refresh_token: str):
    """Set the HttpOnly access and refresh JWT cookies on `response`.

    `access_token`/`refresh_token` must already be the final `str(...)`
    encoded JWT — this function does not stringify or otherwise
    transform its inputs (Entry M1A-1 found a prior implementation
    passing a live `AccessToken` object instead of its string form to
    one branch of `set_cookie`).
    """
    access_kwargs = _access_cookie_kwargs()
    access_kwargs["value"] = access_token
    response.set_cookie(**access_kwargs)

    refresh_kwargs = _refresh_cookie_kwargs()
    refresh_kwargs["value"] = refresh_token
    response.set_cookie(**refresh_kwargs)
    return response


def clear_auth_cookies(response):
    """Delete the access and refresh JWT cookies on `response`, using
    exactly the `path`/`domain`/`samesite` attributes they were created
    with, so the browser actually clears them."""
    access_kwargs = _access_cookie_kwargs()
    response.delete_cookie(
        key=access_kwargs["key"],
        path=access_kwargs["path"],
        domain=access_kwargs["domain"],
        samesite=access_kwargs["samesite"],
    )

    refresh_kwargs = _refresh_cookie_kwargs()
    response.delete_cookie(
        key=refresh_kwargs["key"],
        path=refresh_kwargs["path"],
        domain=refresh_kwargs["domain"],
        samesite=refresh_kwargs["samesite"],
    )
    return response


def get_access_token_from_cookie(request):
    """Read the raw access-token string from its HttpOnly cookie, or
    `None` if absent. Centralized so no call site hard-codes the cookie
    name."""
    return request.COOKIES.get(settings.JWT_AUTH_COOKIE)


def get_refresh_token_from_cookie(request):
    """Read the raw refresh-token string from its HttpOnly cookie, or
    `None` if absent. Centralized so no call site hard-codes the cookie
    name."""
    return request.COOKIES.get(settings.JWT_AUTH_REFRESH_COOKIE)
