# Production setup — Groupe 3RB (3RB Extreme)

No custom domain yet. Public URLs are `https://3rb-extreme.up.railway.app` (Django on Railway) and `https://3rb-extreme.vercel.app` (Next.js on Vercel). Settings live under `backend/config/settings/` (not `backend/settings/`).

Do not commit secret values. Set them in each provider’s dashboard.

## Railway (`efop-backend`)

Status is from the Railway MCP against project **efop-production**, service **efop-backend**. Variable *values* are not returned to this session; names that exist are marked **set**.

| Variable | Status | Notes |
|---|---|---|
| `DJANGO_SETTINGS_MODULE` | set | Must be `config.settings.production` |
| `DJANGO_ENVIRONMENT` | set | `production` |
| `DJANGO_SECRET_KEY` | set | Must stay ≥50 chars, no placeholder text |
| `DJANGO_DEBUG` | set | Must remain false |
| `DJANGO_ALLOWED_HOSTS` | set | Code also defaults to `3rb-extreme.up.railway.app` and always adds `healthcheck.railway.app` |
| `DATABASE_URL` | set | Railway Postgres (private). GitHub backups use the public TCP proxy instead |
| `POSTGRES_*` | set | Fallback if `DATABASE_URL` is absent |
| `REDIS_URL` | set | Railway Redis plugin. Production `CACHES` uses django-redis. The Upstash URL from the hardening prompt was **not** written over this |
| `CORS_ALLOWED_ORIGINS` | set | Code always includes `https://3rb-extreme.vercel.app` |
| `CSRF_TRUSTED_ORIGINS` | set | Code always includes `https://3rb-extreme.vercel.app` |
| `TRUST_X_FORWARDED_FOR` | set | Required behind Railway’s proxy |
| `JWT_AUTH_COOKIE_SECURE` | set | |
| `USE_S3_STORAGE` | set | Must be true |
| `R2_ACCESS_KEY_ID` | set | |
| `R2_SECRET_ACCESS_KEY` | set | |
| `R2_BUCKET_NAME` | set | App files bucket (`efop-files`) |
| `R2_ACCOUNT_ID` | set | |
| `R2_ENDPOINT_URL` | missing (optional) | Built from `R2_ACCOUNT_ID` when empty |
| `SENTRY_DSN_BACKEND` | set | Present on the live service. Source maps / SDK init still need the **next git deploy** of production.py |
| `CELERY_BROKER_URL` / `CELERY_RESULT_BACKEND` | set | |
| `SECURE_SSL_REDIRECT` | set (env) | Code now forces `True` with health-check exemptions |

Railway dashboard health check path is `/api/health/`. That path **404s on the live replica today** because the new Django code is not on `origin/main` yet. Live liveness is still `GET /api/v1/health/` (HTTP 200). `railway.toml` is updated to `/api/health/` so the next deploy of this tree matches the dashboard.

Do not accept the leftover Railway staged patch (variable rewrite + `port: null`) unless you have reviewed it in the dashboard. `SENTRY_DSN_BACKEND` is already on the live service.

After adding `rest_framework_simplejwt.token_blacklist`, run `python manage.py migrate` (already in the Railway pre-deploy command).

## Vercel (`3rb-extreme`)

Project `group-3-rb/3rb-extreme` (`prj_wW7aO0auAx0V0oB67HNUsnx7HAUa`). The Vercel MCP stays **403** for this team scope (`list_teams` is empty; `get_project` / deployments / shareable URL fail). CLI as `grp3rb-9607` works. Re-auth the Vercel MCP to the **group-3-rb** team if you want MCP access.

| Variable | Status | Notes |
|---|---|---|
| `NEXT_PUBLIC_SENTRY_DSN` | set | Production/preview/development. DSN host matches `3rb-frontend` (EU ingest) |
| `SENTRY_AUTH_TOKEN` | set | Secret (build-time source map upload only). Never expose to the browser |
| `SENTRY_ORG` | set | `group-3rb` |
| `SENTRY_PROJECT` | set | `3rb-frontend` |
| `BACKEND_INTERNAL_URL` | set | Production (and preview/development after this pass): `https://3rb-extreme.up.railway.app/api/v1` |
| `NEXT_PUBLIC_API_BASE_URL` | set | `/api/v1` (same-origin proxy) |
| `NEXT_PUBLIC_API_URL` | set | `https://3rb-extreme.up.railway.app` (Sentry `tracePropagationTargets`) |

These frontend env vars apply on the **next Vercel production deploy**. Live `3rb-extreme.vercel.app` still serves the previous build (no new CSP/Sentry until that deploy). MCP cannot fetch the protected URL (403).

## GitHub repository secrets

Required by `.github/workflows/db-backup.yml`. Names confirmed set via `gh secret list` (values never printed). Re-synced from Railway this pass; `DATABASE_URL` was rewritten to the public Postgres TCP proxy (`sakura.proxy.rlwy.net:48502`) because GitHub-hosted runners cannot resolve `*.railway.internal`.

| Secret | Status | Notes |
|---|---|---|
| `RAILWAY_BACKEND_URL` | set | `3rb-extreme.up.railway.app` |
| `AWS_ACCESS_KEY_ID` | set | Same value as Railway `R2_ACCESS_KEY_ID` |
| `AWS_SECRET_ACCESS_KEY` | set | Same value as Railway `R2_SECRET_ACCESS_KEY` |
| `AWS_S3_ENDPOINT_URL` | set | Built from `R2_ACCOUNT_ID` when Railway has no `R2_ENDPOINT_URL` |
| `DATABASE_URL` | set | Public TCP proxy, not the private Railway hostname |
| `DJANGO_SECRET_KEY` | set | Required to boot production settings |
| `REDIS_URL` | set | Required to boot production settings |
| `R2_BUCKET_NAME` | set | App bucket (django-storages). Backup files go to bucket `3rb-backups` |
| `R2_ACCOUNT_ID` | set | |
| `DJANGO_ALLOWED_HOSTS` | set | e.g. `3rb-extreme.up.railway.app` |

Cloudflare R2 bucket **`3rb-backups`** was created (private, WEUR, Standard). The workflow file exists locally at `.github/workflows/db-backup.yml` but is **not on GitHub yet** (`gh workflow list` is empty; no commit/push this session). Daily backups will not run until that workflow is on `main`.

Helper (prints names only): `python scripts/sync_github_backup_secrets.py`.

## TODO when a custom domain is added

1. `backend/config/settings/production.py` — add the API host to `DJANGO_ALLOWED_HOSTS` / the `production_allowed_hosts` default; add `https://<frontend-domain>` to `_cors_locked` and `_csrf_locked`.
2. `frontend/next.config.js` — update CSP `connect-src` (comment is already in the file).
3. Railway env: `DJANGO_ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS`, `CSRF_TRUSTED_ORIGINS`.
4. Vercel env: `BACKEND_INTERNAL_URL`, any public API URL vars.
5. GitHub secret `RAILWAY_BACKEND_URL` if the API origin changes.
6. Cloudflare / DNS — not configured in this session.

## Checklist (this session)

- [x] Step 1 — Production security settings (`DEBUG=False`, HSTS, cookies, `X_FRAME_OPTIONS`, blacklist migrate comment). `CSRF_COOKIE_HTTPONLY` stays `False` so the Next.js CSRF double-submit flow keeps working (the original prompt asked for `True`; that would break `GET /api/v1/auth/csrf/`).
- [x] Step 2 — JWT hardening in production (15 min access, 7 day refresh, rotate + blacklist). Signing key is `SECRET_KEY` / `DJANGO_SECRET_KEY`, not a non-existent `SECRET_KEY` env var.
- [x] Step 3 — CORS lockdown (`CORS_ALLOW_ALL_ORIGINS = False`, Vercel origin allow-list, credentials).
- [x] Step 4 — `django-ratelimit==4.1.0` plus cache-backed `middleware.rate_limit.RateLimitMiddleware` after `SecurityMiddleware`.
- [x] Step 5 — `django-redis==5.4.0` and production `CACHES` / cache sessions.
- [x] Step 6 — `GET /api/health/` in code; Railway health path + `railway.toml` set to `/api/health/` (live replica still 404s until deploy).
- [x] Step 7 — Sentry MCP: `3rb-backend` and `3rb-frontend` already exist (DSNs match). SDK on backend + frontend. `SENTRY_DSN_BACKEND` set on Railway. Vercel Sentry env set via CLI.
- [x] Step 8 — Vercel security headers + CSP `connect-src` for `https://3rb-extreme.up.railway.app` and Sentry ingest (`https://o*.ingest.sentry.io` plus EU `*.ingest.de.sentry.io`).
- [x] Step 9 — `generate_presigned_url()`. No public R2 / `AWS_S3_CUSTOM_DOMAIN` URLs were being returned to the frontend; downloads stay on authenticated `/api/v1/...` paths.
- [x] Step 10 — `backup_db` management command + daily GitHub Action (`03:00` UTC + `workflow_dispatch`). Package `__init__.py` files added so Django can load the command. R2 bucket `3rb-backups` created. Secrets set. Workflow not on GitHub until push.
- [x] Step 11 — Security audit (see below).
- [x] Step 12 — This file.

## Step 11 audit notes

**`DEBUG = True`** — only in `backend/config/settings/development.py` (and comments/docs). Production forces `False`.

**`CORS_ALLOW_ALL_ORIGINS = True`** — only in development settings. Production is `False`.

**`localhost` / `127.0.0.1`** — development CORS/CSRF, Celery defaults in `base.py` (overridden on Railway), OpenAPI `SERVERS` in `base.py` (overridden in production to the Railway URL). Not used as production `ALLOWED_HOSTS`.

**Hardcoded secrets** — no live AWS keys, Sentry auth tokens, or production passwords in tracked source. Test/seed passwords exist in tests and `backend/scripts/seed_data.py` (local seed only). `.env` / `.env.local` are gitignored.

**`pip check`** — no broken requirements (previous pass).

**`npx next build`** — succeeded (Next.js 16.3.4) on the previous pass. During the first build Sentry warned that `withSentryConfig` should be imported from `@sentry/nextjs/config`; `frontend/next.config.js` now uses that import.

**`python manage.py check --deploy`** — exited 0 on the previous pass. 182 issues, all `drf_spectacular` schema warnings (pre-existing). **Zero** Django `security.*` warnings.

## Still required to go live

1. Commit and push the local hardening tree (not done in this session). Until then Railway still runs old Django (`/api/health/` 404) and GitHub has no `db-backup` workflow.
2. Trigger a Vercel production deploy after that push so Sentry env vars and CSP headers reach `3rb-extreme.vercel.app`.
3. Optional: rotate the Sentry auth token and any Redis password that were pasted in chat.
