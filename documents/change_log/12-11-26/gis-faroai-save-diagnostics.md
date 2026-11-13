# GIS FaroAI save diagnostics — 12-11-26

Added GIS stage-specific safe errors for FaroAI integration saves and structured logging restricted to allowlisted stage/error class. Preserved fail-closed mapping order. The previous runtime failure stage could not be confirmed because the GIS backend container/logs were unavailable. No GIS configuration or tenant data was changed.

Verification: GIS controller syntax check passed. Agent Q&A: `chat_log/team_agent_qa/2026-11-12T15-09-32-gis-faroai-save-diagnostics.md`.

GIS frontend now displays bounded, stage-specific messages only for the backend's safe error-code allowlist; unknown errors remain generic. It handles both the existing JSON envelope and HTTP error bodies. Frontend changelog: `jw-gis-frontend/docs/changelog/12-11-26-faroai-integration-save-errors.md`.

After the user's retry, backend logs narrowed the failure to organization lookup in `tenant_mapping_disable`. Root cause: `Organization.model.js` overwrites `module.exports` and ends with the logistics model, so the mapping helper was querying the wrong collection. The helper now binds directly to `GisAdminDb.tbl_organization`, with safe substage errors retained. No tenant credential or mapping data was changed during diagnosis. GIS backend dev server reloaded the fix on port 3009.

Follow-up after retries reported `tenant_mapping_disable` with `UNKNOWN`: added allowlisted mapping substages for organization context/lookup, index setup, and write failures. The disable operation now requires a matched org row. Exact previous live substage is still unconfirmed; the GIS backend/log session is not available in this environment, and unauthenticated Mongo inspection is denied. No tenant mapping or credentials were changed.

Verification: GIS controller and mapping helper syntax checks passed. Agent Q&A: `chat_log/team_agent_qa/2026-11-12T15-04-06-gis-faroai-config-save-error-audit.md` and `chat_log/team_agent_qa/2026-11-12T15-21-42-gis-mapping-disable-substage.md`.

Further split the mapped organization check into no record, tenant database context mismatch, and inactive status; responses disclose no IDs or database names. The actual condition remains unverified because this workspace cannot access the live GIS session or authenticated organization record. The GIS frontend allowlist was coordinated separately.

Source root cause identified by reviewing the GIS model export: `Organization.model.js` overwrites `module.exports` and ends with the logistics model. The GIS mapping helper now binds explicitly to `GisAdminDb.tbl_organization`; existing indexes on any prior wrong collection were not inspected or dropped. No mapping/credential records were changed.

Also fixed a likely Mongo update path conflict in FaroAI credential persistence: the update no longer sets the parent `user_actions` object while middleware sets `user_actions.updated_by`. Audit writes use dotted paths, and `created_by` is initialized only on insert. Credentials were not reposted, logged, or tested in this work.
