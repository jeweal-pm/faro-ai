# GIS FaroAI settings save error audit — 12-11-26

Read-only trace of the GIS FaroAI integration save route. Confirmed the generic visible error is body `code: 503` in an HTTP 200 response and that source currently suppresses the underlying exception. The save flow verifies credentials, disables the central GIS tenant mapping, upserts tenant-scoped `tbl_ApplicationDetails.credentials_Keys`, then enables the mapping. “Connection verified” reflects already-loaded state. Exact failure stage cannot be determined without safe stage-specific diagnostics.

No source code, credentials, scopes, tenant settings, or database records were changed. Q&A record: `chat_log/team_agent_qa/2026-11-12T15-04-06-gis-faroai-config-save-error-audit.md`.
