# ADR-0048: Least-privilege PO search and bounded details

- **Status:** Accepted
- **Date:** 2026-11-07
- **Owners:** FaroAI platform engineering; GIS MCP team owns the GIS read contract

## Context

Read-only PO lookups were coupled to broad procurement credentials and loaded a supplier master page before searching. Detailed searches then called get_purchase_order once per PO, adding MCP round trips and model tool turns. A data-analysis follow-up could also fail because the deterministic analysis endpoint required the unrelated chat:write scope.

## Decision

1. Recognize read-only procurement access as gis:procurement:read. The procurement assistant accepts either read or write scope; read-only service credentials are restricted to GIS lookup tools. Confirming a PO, receipt, supplier, or voucher action continues to require gis:procurement:write.
2. Permit the deterministic, bounded procurement data-analysis endpoint when the credential has chat:write, gis:procurement:read, or gis:procurement:write. Procurement-scoped calls may analyze only the bounded PO rows already loaded in the current view and do not require model-chat consent because no model or external provider processes those rows. This does not authorize model chat or GIS mutations.
3. Resolve an explicitly named supplier with the narrow search_suppliers tool when available. Retain get_product_master_data as a compatibility fallback for older GIS connections.
4. After Jev selects the workflow model, FAROAI may execute an exact, tenant-scoped supplier and PO lookup and pass the bounded GIS result to that model for the final response. The model remains responsible for interpreting the user's request and presenting the result; it does not receive unfiltered GIS data.
5. search_purchase_orders may return bounded line details with include_lines=true. FAROAI requests at most 10 POs for the initial detail view, verifies supplier and status filters, and avoids per-PO detail calls when the batched result is complete.
6. GIS remains the source of truth. Search is read-only, scoped by the configured organization, and never approves or writes a PO or inventory receipt.

## Consequences

- Read-only work no longer needs mutation tool approvals or chat:write solely to calculate totals from displayed PO data.
- Existing connections that do not support include_lines retain the existing bounded get_purchase_order fallback.
- A search is limited to 10 detailed POs per response; larger result sets report the total and can be narrowed or paged.
- Jev remains in the request path and continues selecting the eligible model; the optimization removes redundant data loads and detail round trips.
