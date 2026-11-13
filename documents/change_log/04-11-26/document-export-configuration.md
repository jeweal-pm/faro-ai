# Document export configuration repair - 04-11-26

- The configured Backoffice `FAROAI_DEMO_API_KEY` had no matching active record for the current tenant, so the artifact context request returned 401 and Backoffice mislabeled it as missing configuration. Provisioned a tenant-scoped `chat:write` key and stored it in `.env` with mode `600`.
- The running Gateway `dist` was stale and still enforced the superseded chat-consent check on artifact context. Rebuilt the Gateway from current source and recreated only the API service; artifact export follows ADR-0044 explicit export intent.
- Started the `artifacts` Compose profile and provisioned the dedicated restricted artifact-worker database login using the configured secret. Rotated the Backoffice GIS and artifact-worker credentials and reloaded their services.
- Verified tenant and artifact context requests return HTTP 200, API readiness and Backoffice return HTTP 200, and the artifact worker connects using its restricted role.
- Created and downloaded a temporary PDF through the real artifact API/worker (HTTP 202 create, completed job, HTTP 200 download, valid `%PDF-` signature), then deleted the temporary job and file.
