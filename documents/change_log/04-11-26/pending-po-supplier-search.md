# Pending PO supplier search fix - 04-11-26

- Fixed supplier resolution to match the request against live GIS supplier names (including possessives), then pinned PO searches to the matching GIS supplier ID.
- Removed redundant model-generated free-text query values from supplier-scoped searches unless the user supplied an explicit PO number; status filters are normalized to the GIS numeric codes.
- Added a bounded live-GIS detail fallback when the model omits structured PO details, so matching records populate the procurement result cards; it loads up to 10 most recent records.
- Confirmed the live GIS search returned 12 pending POs for Heritage Gold Components and FaroAI returned 10 structured PO details, all with `pending_approval` status. No PO data was changed.
- Rebuilt and recreated only the AI service. Python syntax compilation and `/health/ready` passed (HTTP 200); the replaced AI-service image ID is no longer present.
