# ADR-0041: Complete explicit GIS supplier creation without a confirmation step

- **Status:** Accepted
- **Date:** 2026-10-31
- **Deciders:** FaroAI product owner and implementation team
- **Related:** [ADR-0040 Prompt-driven GIS Supplier operations](0040-prompt-driven-gis-supplier-operations.md)
- **Specification:** [GIS Supplier operations through FaroAI](../spec/gis-supplier-operations.md)

## Context

Supplier creation through FaroAI already requires an authenticated platform administrator and the connection's approved `search_suppliers` and `create_supplier` tools. The per-supplier preview and confirmation button adds a second step after the administrator has already issued an explicit create prompt. GIS creates the supplier as active and does not synchronize the record to ERP.

## Decision

1. An explicit natural-language supplier creation request from an authenticated platform administrator authorizes creation in that request. Search-only, discussion, or draft requests never authorize a write.
2. The AI service may propose a supplier create action, but the Gateway remains the only component that sends the GIS mutation. It validates required fields, checks exact organization and code duplicates against live GIS data immediately before writing, and calls `create_supplier` once.
3. Remove the supplier-create confirmation preview and button. Return a success message only after GIS confirms creation; audit the actor, tenant, supplier ID, and outcome.
4. Do not retry an ambiguous GIS write automatically. Tell the administrator to check GIS before retrying.
5. Keep supplier lookup read-only and separately permissioned. Keep supplier activation, PO creation, voucher creation, and inventory receipt confirmation flows unchanged.
6. GIS has no bulk create operation; handle multiple suppliers as separate validated calls and do not show a confirmation prompt after each create.

## Consequences

- Supplier creation completes in one prompt/response cycle when required fields and GIS permissions are available.
- Duplicate checks, tool approval checks, audit logging, and no-retry behavior remain server-side.
- Activation and other procurement writes retain their existing explicit confirmation controls.

## Review triggers

Revisit if GIS adds an idempotent supplier-create endpoint, bulk creation, or ERP synchronization.
