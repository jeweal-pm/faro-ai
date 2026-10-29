# Tenant-local learning export runtime fix

Date: 17-10-26

- ADR-0023 and the learning specs already allow tenant-scoped local dataset export in hosted multi-tenant deployments when the local-learning deployment switch and that tenant's authorization are enabled.
- The running API container was still serving older gateway code baked into its image, which returned the obsolete single-tenant-only error. The host's compiled `gateway/dist` was current, but the local Compose override did not mount it into the API container.
- Added a read-only `gateway/dist` bind mount to the local Compose override and recreated only the API container. No Docker image was rebuilt.
- Runtime verification: API readiness returned HTTP 200, Backoffice dev page returned HTTP 200, and the API container now reads the current `dist/admin.js` route without the single-tenant-only export guard.
- Updated the fast-install plan in Markdown and HTML to match ADR-0023: hosted multi-tenant export is supported with per-tenant authorization, consent/review controls, and tenant-scoped output.
- The tenant KT had local authorization recorded but 0 candidates and 0 eligible exports; recorded the empty export result without reading candidate content. Updated the export contract to return a clear 409 instead of a zero-byte file or empty manifest.
- Discovery showed “AI discovery has not been configured” because the standalone host dev server did not inherit deployment variables from the root `.env`. Started the existing Backoffice container with the project Compose files and existing image (no rebuild); it receives the configured demo tenant/key and reaches the API at `http://api:3000`. Verified Backoffice HTTP 200 and API readiness HTTP 200. Use `http://127.0.0.1:3001/` for discovery and `http://127.0.0.1:3001/admin` for Backoffice.

- Backoffice was unreachable because its container had exited. Restarted the Backoffice Next.js dev server on port 3003 using the existing 
ode_modules (no install or image rebuild); set a 1536 MB Node heap after the first startup hit out-of-memory. Verified http://127.0.0.1:3003/admin returns HTTP 200.
- Credit adjustment requests failed Origin validation because the API allowed BACKOFFICE_URL=http://127.0.0.1:3003 while the active Backoffice container is served on port 3001. Updated the local .env value to port 3001 and recreated only the API container with the existing image (no rebuild). Confirmed the API receives the corrected origin and readiness returns HTTP 200.
- Submitted the additional discovery prompt batch through the local frontend UI. The requested 100-item prompt array accidentally contained 101 entries; all 101 completed. Added a per-prompt result report at user-check/2026-10-17-discovery-prompt-run.md. The run showed 15 zero-result responses and exact repeated product names in 21 responses; tenant credit balance stayed at 199.
