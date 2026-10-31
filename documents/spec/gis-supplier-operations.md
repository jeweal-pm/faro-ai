# GIS Supplier operations through FaroAI

## Goal

Allow platform administrators to search GIS suppliers and request supplier creation or activation in Thai or English through the existing GIS Procurement assistant.

## MCP capabilities and permission boundaries

- Read/search: `search_suppliers` (required for lookup, duplicate checks, and resolving an activation target).
- Create: `create_supplier` (requires `search_suppliers`; GIS creates the record active and does not synchronize it to ERP).
- Activate: `search_suppliers` and `activate_supplier` (the search result supplies the candidate ID and state for both initial validation and confirmation revalidation).
- These capabilities are independently approved per GIS connection. Read-only lookup must never require create or activate permission. Supplier tools do not grant PO, voucher, product, or inventory permissions.
- FAROAI only calls tools explicitly approved for the selected tenant and advertised by the live MCP `tools/list` response.

## Natural-language behavior

- Understand supplier lookup, create, and activate requests in Thai and English without asking the user for tool names or GIS IDs.
- Route supplier requests from the main Discovery prompt into the existing authenticated GIS Procurement assistant.
- A supplier lookup is read-only and presents GIS-returned supplier values only.
- Before creation, resolve the requested organization and code through GIS and reject a duplicate match. Use the GIS-provided `create_supplier` schema and reject extra or invalid fields.
- Preserve user-provided values. Do not invent real-world addresses, tax IDs, emails, phone numbers, or contact details. If the user explicitly requests test/demo data and authorizes creative completion, synthetic values may be proposed for review; use `.invalid` email domains and append `(AI)` to generated organization names.
- An explicit create request writes one supplier directly after argument validation and an exact duplicate recheck. GIS has no bulk supplier operation; multiple suppliers are created as separate validated calls without a confirmation pause after each one.
- Creation makes the new supplier active in GIS. Activation is only for an existing, inactive GIS supplier. An already-active or missing supplier produces no write.

## Supplier creation

1. A signed-in platform administrator's explicit natural-language create request authorizes creation. A prompt that only searches, discusses, or drafts a supplier does not authorize a write.
2. The AI service validates the live GIS schema, required fields, and field lengths, then proposes a single supplier create action to the Gateway.
3. Gateway independently validates the supported fields and required values, checks exact organization and code matches against live GIS data, then calls `create_supplier` once. It does not create a confirmation draft or require a UI button.
4. Gateway reports success only when GIS confirms creation, records the actor, tenant, supplier ID, and outcome in the audit log, and never retries a failed or ambiguous write automatically. The response states that supplier data does not synchronize to ERP.
5. For an uncertain response, FaroAI instructs the administrator to check GIS before retrying. An exact duplicate check or GIS duplicate response stops without creating a second record.

## Activation confirmation

Activating an existing supplier continues to use the existing one-time preview and explicit confirmation flow. This change applies only to supplier creation.

## Acceptance criteria

- Searching suppliers works with `search_suppliers` approved and no supplier write permissions.
- Create requires both `search_suppliers` and `create_supplier`; an explicit create prompt performs one validated GIS write and returns its verified outcome without a separate preview button.
- Activation requires `search_suppliers` and `activate_supplier`; only a verified inactive supplier can be previewed.
- Missing capability errors identify the exact supplier permission needed.
- Duplicate creation and already-active activation do not mutate GIS.
- Supplier creation rechecks live duplicates in the Gateway and records a successful outcome before FaroAI reports success.
- Supplier activation retains its confirmation flow and live status revalidation.
- Supplier operations do not approve POs or create products, vouchers, or inventory.
