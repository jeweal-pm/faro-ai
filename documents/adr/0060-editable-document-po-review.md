# ADR-0060: Editable PO preparation and safe resubmission

- **Status:** Accepted
- **Date:** 2026-11-12
- **Owners:** FaroAI platform and GIS integration
- **Related:** [ADR-0058 document-to-PO workflow](0058-natural-language-document-to-po.md), [ADR-0059 source-bound matching](0059-source-bound-document-po-matching.md), [Business-document intake spec](../spec/business-document-intake.md)

## Context

OCR can succeed while Jev cannot prepare a valid GIS PO preview. The current UI exposes raw OCR text and a prose answer, so users cannot conveniently repair supplier, location, SKU, quantity, or price mappings and retry. A failed preparation must remain recoverable without replacing the original evidence or creating duplicate GIS masters.

## Decision

1. Show a structured editable PO correction form for the supplier name/code, supplier action, Ship-to name/code, Location action, and each line's product name, GIS SKU, quantity, unit price, and currency.
2. Let the user choose `Map to existing GIS master` or `Create new from document` separately for Supplier and Location. Mapping mode forbids creating a new master. Create mode still requires complete supported facts and the existing GIS review/confirmation for that master.
3. Persist corrections only in the tenant/actor-scoped corrected OCR draft, under the existing correction version and retention controls. Keep original OCR pages unchanged. Mark the serialized correction block explicitly so runtime can distinguish user-entered values from original OCR.
4. On resubmit, rerun the same prompt-bound PO preparation against GIS. Repeat exact name/code/SKU matching and preview validation. Show the new result and errors; never reuse an old preview or draft ID. A failed attempt must not block another bounded retry.
5. Keep GIS authoritative. A retry may prepare a preview but cannot bypass the existing explicit confirmation for a master write or PO write. Successful PO creation remains pending approval; FaroAI does not approve or receive inventory.
6. Do not auto-create masters because OCR/AI suggests a value. Apply duplicate checks, exact mapping, explicit create mode, separate confirmation, and audit before every GIS master write.

## Consequences

- Users can fix field extraction and GIS mapping in a form/table instead of editing the whole OCR transcript.
- User corrections are explicit and auditable, while original OCR evidence remains available for comparison.
- A manually typed existing mapping that does not resolve exactly pauses safely rather than generating another master.
- Further work is required for searchable GIS dropdowns and a centralized duplicate-review/merge workflow; this release accepts exact name/code entry as the first mapping UI.

## Acceptance criteria

- A failed PO preparation shows editable supplier/location/line-item fields and permits resubmission without uploading the file again.
- The form retains prior edits after a failed retry and supports adding/removing line rows.
- Mapping an existing supplier/location cannot trigger a create action.
- Create-new requests require source-backed details and separate GIS confirmation.
- Re-submission re-runs live GIS matching and generates a fresh preview; stale previews cannot be confirmed.
- Original OCR and the immutable source file are not overwritten by PO mapping corrections.
