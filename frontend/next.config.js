/** @type {import('next').NextConfig} */
/**
 * Vercel env vars to set (Project → Settings → Environment Variables):
 *   NEXT_PUBLIC_SENTRY_DSN
 *   SENTRY_AUTH_TOKEN
 *   SENTRY_ORG
 *   SENTRY_PROJECT
 *
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
const { withSentryConfig } = require("@sentry/nextjs/config");
const fs = require("fs");
const path = require("path");
function loadRelease() {
  const candidates = [
    path.join(__dirname, "RELEASE.json"),
    path.join(__dirname, "..", "RELEASE.json"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return require(candidate);
    }
  }
  return { release_id: "unknown", source_revision: "unknown" };
}
const release = loadRelease();
const isDevelopment = process.env.NODE_ENV !== "production";

const nextConfig = {
  reactStrictMode: true,
  turbopack: {
    root: __dirname,
  },
  skipTrailingSlashRedirect: true,
  // Vercel serves Next.js itself; standalone is for Docker/Railway-style hosts.
  ...(process.env.VERCEL ? {} : { output: "standalone" }),
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
    // Update connect-src when custom domain is added.
    const connectSrc = isDevelopment
      ? "connect-src 'self' ws: wss: http://localhost:3000 http://127.0.0.1:3000 ws://localhost:3000 ws://127.0.0.1:3000 https://3rb-extreme.up.railway.app https://o*.ingest.sentry.io https://*.ingest.sentry.io https://*.ingest.de.sentry.io"
      : "connect-src 'self' https://3rb-extreme.up.railway.app https://o*.ingest.sentry.io https://*.ingest.sentry.io https://*.ingest.de.sentry.io";
    const securityHeaders = [
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=()",
      },
      { key: "X-DNS-Prefetch-Control", value: "on" },
      {
        key: "Content-Security-Policy",
        value: [
          "default-src 'self'",
          "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://vercel.live",
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: blob: https:",
          "font-src 'self'",
          connectSrc.replace(/^connect-src /, "connect-src "),
          "frame-ancestors 'none'",
        ].join("; "),
      },
      {
        key: "Strict-Transport-Security",
        value: "max-age=31536000; includeSubDomains; preload",
      },
      { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    ];
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

module.exports = withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG || "group-3rb",
  project: process.env.SENTRY_PROJECT || "3rb-frontend",
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  widenClientFileUpload: true,
});
