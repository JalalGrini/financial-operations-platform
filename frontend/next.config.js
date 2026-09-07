/** @type {import('next').NextConfig} */
/**
 * Audit fix: this file previously did two harmful things —
 *
 * 1. It stamped `Access-Control-Allow-Origin: *` together with
 *    `Access-Control-Allow-Credentials: true` on /api/v1/* responses. That
 *    combination is rejected by browsers (the CORS spec forbids the wildcard
 *    on credentialed requests) and, had any browser accepted it, would have
 *    exposed the authenticated API to every website. CORS policy belongs to
 *    the Django backend (corsheaders with an explicit origin allow-list);
 *    the frontend proxy is same-origin and needs no CORS headers at all.
 *
 * 2. It proxied /api/v1/* to a hard-coded `http://localhost:8000`, which
 *    breaks any non-local deployment. That rewrite is now unnecessary: the
 *    single route handler at `src/app/api/v1/[[...path]]/route.ts` proxies
 *    every API call with correct cookie/CSRF/redirect handling and reads its
 *    backend address from BACKEND_INTERNAL_URL / NEXT_PUBLIC_API_BASE_URL.
 */
const release = require("../RELEASE.json");
const isDevelopment = process.env.NODE_ENV !== "production";

const nextConfig = {
  reactStrictMode: true,
  turbopack: {
    root: __dirname,
  },
  skipTrailingSlashRedirect: true,
  output: "standalone",
  env: {
    NEXT_PUBLIC_RELEASE_ID: release.release_id,
    NEXT_PUBLIC_SOURCE_REVISION: release.source_revision,
  },
  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = {
        ignored: ["**/node_modules/**", "**/.next/**"],
      };
    }
    return config;
  },
  async headers() {
    const connectSrc = isDevelopment
      ? "connect-src 'self' ws: wss: http://localhost:3000 http://127.0.0.1:3000 ws://localhost:3000 ws://127.0.0.1:3000"
      : "connect-src 'self'";
    const securityHeaders = [
      {
        key: "Content-Security-Policy",
        value: `default-src 'self'; script-src 'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ""}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; ${connectSrc}; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'${isDevelopment ? "" : "; upgrade-insecure-requests"}`,
      },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
      },
      { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      {
        key: "Strict-Transport-Security",
        value: "max-age=31536000; includeSubDomains; preload",
      },
    ];
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

module.exports = nextConfig;
