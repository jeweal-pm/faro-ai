# 15-10-26 — Learning authorization save fix

- Fixed the `Save authorization` failure on Learning & training. The audit insert reused a UUID parameter for both `audit_events.tenant_id` (UUID) and `resource_id` (text), which PostgreSQL rejected with `42P08`.
- The audit insert now sends the tenant ID as a separate text parameter. The settings upsert and audit insert now run in one transaction, so the endpoint cannot report failure after committing only the authorization value.
- The failed request had already stored KT's authorization as enabled before the audit insert failed. That saved state remains enabled; the fixed endpoint is deployed, and saving again will write the corresponding audit event.
- Made the authorization upsert and audit event atomic in one database transaction, preventing a failed audit write from leaving a partial save.
- Fixed readiness after restart to establish the lazy Redis connection before pinging it.
- Verified the exact authorization upsert and audit insert inside a transaction and rolled it back. Gateway typecheck passed, all four gateway tests passed, Docker API image build completed, and API readiness returned HTTP 200.
- Recreated the API container with the new image and removed each replaced API image.
