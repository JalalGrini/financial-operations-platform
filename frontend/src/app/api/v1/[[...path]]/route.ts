import { NextRequest, NextResponse } from "next/server";

/**
 * Same-origin API proxy — single optional catch-all for /api/v1/*.
 *
 * The browser talks only to this Next.js origin; this route forwards each
 * request to the Django backend and relays the response — including every
 * Set-Cookie header, which is what makes the HttpOnly cookie session (M1-A)
 * work without any cross-origin CORS exposure.
 *
 * Correct-by-construction properties the earlier per-directory proxies got
 * wrong, and which this single implementation now guarantees everywhere:
 * - Set-Cookie headers from the backend reach the browser (login/refresh
 *   actually establish a session),
 * - the X-CSRFToken request header is forwarded (unsafe cookie-authenticated
 *   requests pass the backend's CSRF enforcement),
 * - the request body is read exactly once (a followed redirect reuses the
 *   buffered bytes instead of crashing on an already-consumed stream),
 * - the target URL preserves the raw request path byte-for-byte (no double
 *   /api/v1 prefix, no trailing-slash loss through params re-encoding),
 * - backend redirects (Django's APPEND_SLASH 308s) are followed server-side,
 *   and only when they point back at the configured backend, so this proxy
 *   cannot be turned into an open redirect follower,
 * - response bodies are streamed through untouched (JSON, text, XLSX
 *   downloads), never JSON-re-encoded.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function resolveBackendUrl(): string {
  if (!process.env.BACKEND_INTERNAL_URL) {
    throw new Error("BACKEND_INTERNAL_URL is not set");
  }
  const candidate = process.env.BACKEND_INTERNAL_URL.trim();
  if (!candidate) {
    throw new Error("BACKEND_INTERNAL_URL is not set");
  }
  if (!/^https?:\/\//.test(candidate)) {
    throw new Error("BACKEND_INTERNAL_URL is not set");
  }
  return candidate.replace(/\/+$/, "");
}

const BACKEND_URL = resolveBackendUrl();

const BACKEND_ORIGIN = new URL(BACKEND_URL).origin;

/** Request headers forwarded from the browser to the backend (allow-list). */
const FORWARDED_REQUEST_HEADERS = [
  "cookie",
  "x-csrftoken",
  "content-type",
  "accept",
  "origin",
  "referer",
  "x-forwarded-proto",
];

/** Response headers relayed from the backend to the browser. */
const RELAYED_RESPONSE_HEADERS = [
  "content-type",
  "content-disposition",
  "cache-control",
];

const REDIRECT_STATUSES = new Set([301, 302, 307, 308]);
const MAX_REDIRECTS = 2;

function buildBackendUrl(request: NextRequest): string {
  // nextUrl.pathname is the raw (still percent-encoded) request path.
  let suffix = request.nextUrl.pathname.replace(/^\/api\/v1\/?/, "");
  // Django requires trailing slashes on endpoint URLs. If an incoming request path
  // omits the trailing slash (and is not a static/file endpoint with an extension),
  // append it so Django's CommonMiddleware doesn't throw a 500 RuntimeError on POST/PUT/DELETE.
  if (suffix && !suffix.endsWith("/") && !/\.[a-zA-Z0-9]+$/.test(suffix)) {
    suffix += "/";
  }
  return `${BACKEND_URL}/${suffix}${request.nextUrl.search}`;
}

function buildRequestHeaders(request: NextRequest): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) {
      headers[name] = value;
    }
  }
  // Never invent Content-Type. Multipart uploads need the original
  // multipart/form-data; boundary=... header. Defaulting to JSON strips it
  // and Django rejects the file ("submitted data was not a file").
  const contentType = request.headers.get("content-type");
  if (contentType) {
    headers["content-type"] = contentType;
  }
  // This hop is server-to-server. Forwarding the browser Origin/Referer makes
  // Django CSRF treat a same-origin Vercel proxy POST as cross-site against
  // the Railway Host (403 "Origin checking failed"). Rewrite to the backend
  // origin and mark the original client as HTTPS so cookie CSRF still works.
  headers["origin"] = BACKEND_ORIGIN;
  headers["referer"] = `${BACKEND_ORIGIN}/`;
  headers["x-forwarded-proto"] = "https";
  headers["x-forwarded-host"] = request.nextUrl.host;
  return headers;
}

async function proxyRequest(request: NextRequest) {
  const headers = buildRequestHeaders(request);

  // Read the body exactly once; the buffer is reused if a redirect must be
  // followed (calling request.text()/arrayBuffer() twice throws
  // "Body has already been consumed").
  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  const body = hasBody ? Buffer.from(await request.arrayBuffer()) : undefined;

  let url = buildBackendUrl(request);
  let response: Response | null = null;

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount++) {
    response = await fetch(url, {
      method: request.method,
      headers,
      body,
      redirect: "manual",
      // Credentials travel explicitly via the forwarded Cookie header; this
      // fetch is server-to-server.
      credentials: "include",
    });

    const location = response.headers.get("location");
    const isRedirect = REDIRECT_STATUSES.has(response.status) && !!location;
    if (
      isRedirect &&
      location.startsWith(BACKEND_ORIGIN) &&
      redirectCount < MAX_REDIRECTS
    ) {
      // Django's APPEND_SLASH and similar same-backend redirects: follow
      // server-side so the browser never sees the internal backend origin.
      url = location;
      continue;
    }
    break;
  }

  if (!response) {
    return NextResponse.json(
      {
        success: false,
        message: "Bad gateway.",
        errors: { upstream: ["No response from backend."] },
      },
      { status: 502 },
    );
  }

  const responseHeaders = new Headers();
  for (const name of RELAYED_RESPONSE_HEADERS) {
    const value = response.headers.get(name);
    if (value) {
      responseHeaders.set(name, value);
    }
  }
  // A redirect we decided not to follow (different host, or redirect budget
  // exhausted) must not leak the internal backend origin to the browser:
  // rewrite a same-backend absolute Location into its path-relative form.
  const location = response.headers.get("location");
  if (location) {
    responseHeaders.set(
      "location",
      location.startsWith(BACKEND_ORIGIN)
        ? location.slice(BACKEND_ORIGIN.length)
        : location,
    );
  }
  // Relay every Set-Cookie header — this is what lets the backend establish,
  // rotate, and clear the HttpOnly session cookies through the proxy. (The
  // backend must keep JWT_AUTH_COOKIE_DOMAIN unset so the cookies arrive as
  // host-only cookies for this origin.)
  for (const cookie of response.headers.getSetCookie()) {
    responseHeaders.append("set-cookie", cookie);
  }

  return new NextResponse(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
}

export async function GET(request: NextRequest) {
  return proxyRequest(request);
}

export async function POST(request: NextRequest) {
  return proxyRequest(request);
}

export async function PUT(request: NextRequest) {
  return proxyRequest(request);
}

export async function PATCH(request: NextRequest) {
  return proxyRequest(request);
}

export async function DELETE(request: NextRequest) {
  return proxyRequest(request);
}

export async function OPTIONS(request: NextRequest) {
  return proxyRequest(request);
}
