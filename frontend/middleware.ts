/**
 * Next.js middleware entry. matcher / publicRoutes / pathname:
 * `/` and `/tickets/new` are NOT redirecting to login. `/companies` is protected.
 */
export { middleware } from "./src/public-route-gate";

export const config = {
  matcher: [
    "/((?!api|_next/|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webp|css|js|woff2?)$).*)",
  ],
};
