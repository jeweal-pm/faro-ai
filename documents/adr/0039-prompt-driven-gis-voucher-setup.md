# ADR-0039: Prompt-driven GIS Purchase Order voucher setup

- **Status:** Accepted
- **Date:** 2026-10-30
- **Owners:** FaroAI platform
- **Related ADR:** [ADR-0026 Natural-language GIS procurement](0026-natural-language-gis-procurement.md)
- **Related specification:** [Prompt-driven GIS master operations](../spec/gis-procurement-master-operations.md)
- **Supplier operations:** superseded by [ADR-0040](0040-prompt-driven-gis-supplier-operations.md)

## Context

The GIS MCP exposes `create_voucher_type`, but FaroAI's procurement prompt did not allow the operation. The existing Central World voucher is a POS receipt voucher, not a Purchase Order voucher. GIS MCP's supplier master is read-only and has no supplier create or activate operation. The `create_product_master` tool explicitly rejects Supplier records.

## Decision

1. Add a narrow natural-language flow for creating an active GIS `Purchase order` Voucher Type. Keep it separate from PO creation, inventory receipt, and the withdrawn Store setup panel.
2. Expose only the live GIS read tools needed to resolve active locations and existing purchase vouchers, plus the approved `create_voucher_type` mutation. Never expose arbitrary MCP calls.
3. Treat a model call to `create_voucher_type` as a proposal only. FaroAI validates the live tool schema, supported group, active GIS location IDs, active duplicate check, and active status; then stores a preview bound to tenant and actor for one-time confirmation.
4. On confirmation, Gateway rechecks active voucher duplicates and each selected location. If the preview changed, stop and ask for a fresh confirmation. Call the GIS create tool exactly once only after those checks pass.
5. Mark test vouchers with `(AI)` in the name. A duplicate create result is not treated as activation. If GIS finds a duplicate that is inactive, report that activation is unsupported.
6. At the time of this decision, Supplier records remained read-only. Supplier prompt operations are subsequently handled by ADR-0040; never misuse `create_product_master` for Supplier records.

## Consequences

- Users can request a PO Voucher in the existing procurement prompt and review its location, group, and numbering before FaroAI writes it through GIS MCP.
- Ordinary PO searches and existing PO/receipt flows do not require voucher mutation permission.
- Supplier setup follows ADR-0040 and its separate permission and confirmation flow.
- Voucher setup requires explicit approval of `search_locations`, `get_location`, `get_product_master_data`, and `create_voucher_type` on that GIS connection.

## Verification criteria

- A voucher request without required MCP permissions stops before any write and identifies the missing tool approvals.
- A valid request produces a preview without calling `create_voucher_type`.
- Confirmation rechecks live GIS data and creates the voucher at most once.
- An existing active voucher is reused; an inactive duplicate is not claimed to be active or silently modified.
- Supplier create/activate prompts produce no GIS writes and explain the missing MCP capability.
