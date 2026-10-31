# ADR-0040: Prompt-driven GIS Supplier operations

- **Status:** Accepted
- **Date:** 2026-10-30
- **Deciders:** FaroAI product owner and implementation team
- **Related:** [ADR-0026 Natural-language GIS procurement](0026-natural-language-gis-procurement.md), [ADR-0039 Prompt-driven GIS voucher setup](0039-prompt-driven-gis-voucher-setup.md)
- **Specification:** [GIS Supplier operations through FaroAI](../spec/gis-supplier-operations.md)

## Context

GIS MCP now advertises `search_suppliers`, `create_supplier`, and `activate_supplier`. FaroAI previously treated suppliers as read-only and returned a hard-coded limitation message. GIS Supplier creation is a direct write that creates an active record, requires multiple business fields, does not synchronize to ERP, and has no GIS preview or bulk-create operation. Activation also directly changes a GIS status.

## Decision

1. Support supplier lookup, creation, and activation from the existing GIS Procurement prompt in Thai and English. Keep supplier search permission independent from supplier mutation permissions.
2. Keep supplier mutations server-owned. The model may request `create_supplier` or `activate_supplier` only to stage an application preview; the AI service must not call either GIS mutation directly during prompt processing.
3. Before creation, check exact organization and code duplicates using `search_suppliers`, validate fields against the current GIS runtime schema, and show all submitted details for review. Before activation, resolve a supplier returned by GIS, verify its current inactive status, and show its identity and status in the preview.
4. Require an authenticated administrator's explicit confirmation. Store exact arguments with tenant/actor binding and a one-time 15-minute draft. Gateway rechecks GIS state, rebuilds the preview, and makes one mutation call only if the preview still matches.
5. Preserve user-supplied values. Do not invent real-world business addresses, tax IDs, or contact information. Synthetic test values are permitted only when the user explicitly requests test/demo data and authorizes creative completion; mark generated organization names `(AI)` and use `.invalid` test email addresses.
6. Stage one supplier per confirmation because GIS exposes no bulk supplier operation. Do not auto-retry an uncertain write. Report that supplier creation is GIS-only and does not synchronize to ERP.

## Consequences

- Supplier search remains available without create or activate permissions.
- Create and activate are separately approved and audited capabilities. Activation uses only `search_suppliers` plus `activate_supplier`; it does not depend on the unrelated product-master permission.
- Duplicate or stale records stop before write; confirmation is required for every supplier mutation.
- Ten requested suppliers require ten previews and confirmations until GIS offers an approved bulk API.
- `create_product_master` is never used for Supplier records.

## Review triggers

Revisit when GIS adds supplier preview/bulk operations, ERP synchronization, or a transaction that combines supplier creation and activation.
