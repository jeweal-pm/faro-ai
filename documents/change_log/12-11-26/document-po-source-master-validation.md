# Document PO source-to-GIS matching — 12 November 2026

- Added a runtime gate before document PO preview. Supplier and Ship-to IDs must uniquely match the explicit OCR name/code and be active; every product ID must come from GIS product search and match the source name/SKU.
- Document PO tool selection now permits the intermediate GIS lookup and review steps. The model can stage a missing supplier/location from source-backed fields, but each master write still requires its own review confirmation.
- Supplier creation values are checked against the OCR before FaroAI offers the GIS confirmation card. Missing or ambiguous facts stop the flow; it cannot substitute Ham, Central World, or unrelated product SKUs.
- After a separately confirmed master creation, the existing document flow re-runs GIS matching before presenting the PO preview.
- Added ADR-0059 and updated the business-document intake spec.
- Existing PO-0121 was not changed, approved, canceled, or received. It remains pending approval and is the result of the prior mismatch.
- No live GIS writes were made as part of this code change.
