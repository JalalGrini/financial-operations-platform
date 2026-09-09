import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Edge middleware logic (not named proxy.ts — Next 16 treats src/proxy.ts as
 * the convention file and conflicts with root middleware.ts).
 *
 * Public routes always pass through — never a /login redirect.
 * Authenticated users on the landing page / login page are sent to the dashboard.
 * Unauthenticated visitors on any protected route are redirected to /login.
 */

const SESSION_COOKIE_NAME = "access_token";

const PUBLIC_EXACT: ReadonlySet<string> = new Set([
  "/",
  "/services",
  "/contact",
  "/tickets",
  "/tickets/new",
  "/security",
  "/privacy",
  "/status",
  "/login",
  "/forgot-password",
]);

const PUBLIC_PREFIXES: readonly string[] = [
  "/(marketing)/",
  "/auth/",
];

function isPublicRoute(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

const PROTECTED_PREFIXES: readonly string[] = [
  "/dashboard",
  "/admin",
  "/profile",
  "/personnel",
  "/sites",
  "/finance",
  "/reports",
  "/settings",
  "/transfers",
  "/treasury",
  "/financial-records",
  "/parties",
  "/leaves",
  "/configuration",
  "/deadlines",
  "/inventory",
  "/users",
  "/clients",
  "/suppliers",
  "/audit-log",
  "/notifications",
  "/tagged",
  "/companies",
  "/tresorerie",
];

function isProtectedRoute(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSessionCookie = Boolean(
    request.cookies.get(SESSION_COOKIE_NAME)?.value,
  );

  if (isPublicRoute(pathname)) {
    if (pathname === "/" && hasSessionCookie) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    if (pathname.startsWith("/login") && hasSessionCookie) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    return NextResponse.next();
  }

  if (isProtectedRoute(pathname) && !hasSessionCookie) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}
