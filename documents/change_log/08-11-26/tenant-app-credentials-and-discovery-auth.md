# Tenant application credentials and discovery authentication

- Added ADR-0052 and the tenant app credentials/discovery authentication spec before implementation.
- Scope: tenant-scoped API client credentials, short-lived bearer tokens, and authenticated `/` usage; credentials remain server-side.
- Added a one-time client-secret UI, tenant-scoped OAuth client-credentials exchange, expiring/revocable bearer tokens, and a sign-in gate on `/` bound to the authenticated tenant session.
- Added tenant-session authorization for discovery, document/analysis actions, and existing prompt-only GIS workflows; the homepage and server actions no longer rely on `FAROAI_DEMO_API_KEY`.
- Applied migration `020_tenant_app_credentials.sql` to the local FaroAI PostgreSQL database.
- Gateway typecheck/build and the Backoffice production Next.js build (including TypeScript) pass; `api` and `backoffice` containers were recreated successfully.
- Local Docker has no dangling images left after replacing the affected images; filesystem has 142 GB available. Other services were left running.
