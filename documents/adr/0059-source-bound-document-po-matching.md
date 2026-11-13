# ADR-0059: Source-bound matching for document-based purchase orders

- **Status:** Accepted
- **Date:** 2026-11-12
- **Owners:** FaroAI platform and GIS integration
- **Related:** [ADR-0058 Natural-language PO creation from an attached business document](0058-natural-language-document-to-po.md), [Business-document intake spec](../spec/business-document-intake.md)

## Context

OCR can correctly read a supplier, delivery location, and product lines while the language model selects other valid GIS records. GIS validates whether those IDs may be used in a PO; it does not compare the selected records with the source document. PO-0121 demonstrated this gap: the PDF identified a synthetic supplier and two specific SKUs, but the prepared PO used Ham and unrelated ring products.

## Decision

1. Treat OCR as the evidence for the document's Supplier, Ship-to Location, product name/SKU, quantity, and unit price. The model may interpret the document, but may not replace an explicit identity with a similar or default GIS record.
2. Before `preview_purchase_order`, FaroAI independently searches GIS for the exact source Supplier and Location. When both source name and code exist, the same unique GIS record must match both. The selected IDs must equal those GIS results and be active.
3. Every PO product ID must come from the current GIS `search_po_products` result. Its SKU or exact product name must be present in the source. If the document pairs an exact name with a different SKU, reject the candidate. Quantity and unit price must also be supported by OCR evidence.
4. If the Supplier is absent, do not use another supplier. When all GIS-required supplier fields are explicitly supported by the document, prepare a `create_supplier` review card and require the user to confirm that separate master write. Ask the user only for missing required fields. After confirmation, resume the same document request and re-resolve the supplier from GIS.
5. Apply the same stop-and-review behavior to a missing Ship-to Location. A new Location requires complete source-backed fields and an exact active GIS tax master. Do not infer or substitute a Location or tax value.
6. If a source identity is unclear, a lookup is incomplete, duplicates exist, or a product cannot be matched, stop before PO preview and explain which value needs review. Never create or confirm a PO from a mismatched source mapping.
7. Keep the established explicit confirmation for each missing GIS master and the normal PO preview/confirmation flow. OCR content remains untrusted evidence; it cannot authorize writes. GIS remains authoritative for creation, numbering, audit, and pending-approval status.

## Consequences

- A valid GIS ID is not sufficient by itself; FaroAI also verifies that it represents the source document's exact business identity.
- Missing suppliers can be added through the existing GIS MCP `create_supplier` tool after a review card. GIS creates the supplier as active in GIS only; it does not synchronize it to ERP.
- Documents with incomplete or ambiguous supplier/location facts pause for user input instead of falling back to tenant defaults.
- Existing POs created before this check are not modified automatically. In particular, the mismatched PO-0121 remains pending approval until an authorized GIS user decides what to do with it.

## Acceptance criteria

- The source supplier `FaroAI Sample Jewellery Supplier (AI)` and code `FARO-DEMO-SUP-001` can never resolve to Ham or another non-exact supplier.
- The source product SKUs `AI-CTW-CHN-008` and `AI-CTW-BRC-005` cannot be replaced by ring SKUs during PO preview.
- A missing supplier with complete source evidence creates a review card; confirmation creates exactly that supplier, then reruns source matching before PO preview.
- A missing/ambiguous supplier, location, SKU, quantity, price, or tax stops before PO creation and never silently selects a default.
- A GIS validation failure cannot override source-to-master mismatch checks.
