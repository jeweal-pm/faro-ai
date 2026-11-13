# PO read access and search latency — 07-11-26

- Added gis:procurement:read for the procurement assistant; read-only service keys receive only lookup tools, while confirmation still requires gis:procurement:write.
- Allowed deterministic PO analysis with an existing chat:write or GIS procurement scope, removing the unrelated chat-scope failure for PO totals. Procurement-scoped analysis operates on already-loaded rows without external model processing or model-chat consent.
- Supplier resolution now uses a bounded GIS search_suppliers query where available instead of loading up to 100 supplier records. The legacy master lookup remains as a compatibility fallback.
- Jev still selects the Base Skill and eligible model. Once selected, FaroAI can fetch up to 10 filtered PO details through one batched read, then use one task-model response. GIS remains authoritative and no records are changed.
- GIS-side API change: search_purchase_orders(include_lines=true) reads up to 20 POs and 1,000 lines in one bounded query. Changelog: /home/joke/dev/jw-gis-backend/docs/changelog/2026-11-07-mcp-po-search-batched-details.md (GIS repository ignores docs/).
- Added ADR-0048 and its SPEC. Gateway TypeScript build passed and the API container restarted healthy. No live GIS search or UI verification was run, and no GIS records were written.
- Analysis follow-ups now append only the calculation answer; the original PO result message remains visible and is not rendered a second time. Filtered PO results continue to render their filtered rows.
