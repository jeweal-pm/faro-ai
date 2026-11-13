# SPEC: Procurement read access and PO search latency

- **Decision:** [ADR-0048](../adr/0048-read-only-po-search-permissions-and-latency.md)
- **Date:** 2026-11-07

## Authorization

- A tenant service key with gis:procurement:read may call the procurement assistant for GIS reads and deterministic procurement analysis.
- A read-only key is restricted server-side to supplier lookup, PO search, PO detail, and master lookup compatibility tools. It cannot stage or perform supplier, voucher, PO, or receipt writes.
- gis:procurement:write remains required for the confirmation endpoint and is accepted as a superset for procurement reads.
- /v1/skills/analyze accepts chat:write or a GIS procurement scope because its allow-listed operations calculate over supplied numeric PO rows. Procurement-scoped calls analyze only already-loaded PO rows and do not require model-chat consent; the endpoint does not access GIS, send prompts to a model, or write records.
- Missing authorization remains a 403. The frontend must show the API's actionable message and correlation ID without suggesting that GIS create tools be enabled for a search.

## Read flow

1. FaroAI classifies a supplier/PO read request and Jev selects the eligible task model and Base Skill.
2. If the user names a supplier, FaroAI uses search_suppliers with an extracted bounded name query; it falls back to get_product_master_data only if the connection lacks the supplier search tool.
3. FaroAI accepts only a unique live GIS supplier match, then searches the same configured GIS organization using the supplier ID and explicit status filter.
4. When advertised by tools/list, FaroAI sets include_lines=true and caps the initial detailed result to 10 POs. It checks completeness and status before displaying results.
5. The selected task model receives only the supplier match and bounded PO result for interpretation. If the result already contains complete lines, FaroAI does not make per-PO detail calls or ask the model for another tool round.
6. If GIS does not advertise batched details, FaroAI keeps the existing per-PO get_purchase_order fallback, capped at 10.

## Limits and failure behavior

- The GIS MCP implementation limits detailed pages to 20 POs and 1,000 PO lines; FAROAI uses a stricter 10-PO initial view.
- Incomplete detail rows are not presented as complete. Supplier, status, and configured organization constraints are preserved.
- A failed MCP call, non-unique supplier match, or unauthorized request is reported as a failure/clarification; FAROAI does not substitute another supplier, status, or tenant.
- PO search never approves a PO, creates or edits a PO, receives inventory, or grants mutation authority.
