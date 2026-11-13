# Natural-language PO creation from an attached document — 11-11-26

- Added ADR-0058 and extended the document-intake spec for natural-language PO creation from one attached PDF/image.
- Discovery chat now accepts prompts such as “Add this document to a PO”; local OCR runs first, then only bounded OCR text is sent to Jev's eligible paid model after separate, per-file consent. Editing the prompt clears consent.
- The server loads OCR from the tenant/actor-owned job; model instructions mark it untrusted, require GIS-resolved masters, and stop before preview when required numeric line values do not appear in the OCR text or user prompt.
- FaroAI reuses GIS `preview_purchase_order`; the user must confirm the validated preview before the existing gateway calls `create_purchase_order`. A created PO remains pending GIS approval; no approve/receive operation is part of this flow.
- Added and applied migration `022_document_model_consent.sql` after 021. Rebuilt and restarted `api`, `ai-service`, and `backoffice`; API and AI service health checks passed and Backoffice returned HTTP 200. The previous images for these services are no longer present. No live GIS write was performed.
- The container build ran Next.js production compilation and its TypeScript stage successfully. No separate end-to-end file import or GIS PO creation was performed.
- GIS MCP contract review exposed a missing read-only Supplier Country/Phone response, so GIS added the tenant-scoped `get_supplier` tool. Source bytes/images, OCR history retention beyond the document job, Qdrant, training, and shared learning are not enabled.

## Country and phone follow-up

- Generated PO import fixtures now require Supplier Country and Phone; Thailand is used only in the generated sample, with a clearly synthetic phone value.
- For uploaded PDFs missing Country, resolve only from an exact tenant-scoped GIS Supplier detail read. Never infer it from Buyer, tenant, or Ship-to. Ask the user if a new Supplier needs a country that GIS cannot verify. Phone remains optional and may be omitted when neither source nor GIS supplies it.
- Buyer / Bill To remains source reference data. First release is limited to one Ship-to Location per PO.
- Added the read-only `get_supplier` MCP capability to FaroAI's procurement tool contract and exposed it only to the attached-document PO workflow alongside supplier search. FaroAI refuses to call it for an ID not returned by the current GIS supplier search.
- Added document-scoped GIS create previews for missing Supplier and Store/Warehouse Location, plus the existing Purchase order Voucher preview. Each master write requires a separate explicit confirmation; after success the same file job and unchanged original prompt continue automatically toward the normal PO preview. Location creation checks its Tax against an active GIS tax master.
- Added [PO document sample with Country and Phone](../../../user-check/po-import-samples-standard/po-document-country-phone-test.pdf). Supplier, Buyer, and Store details and phone values are synthetic; the PDF is not authorization to create GIS records.
- No supplier/location/voucher/PO record was created in this update.

## Editable OCR review and continuation fix

- Fixed an immediate-review race: a fast OCR job could return `needs_review` in the upload response, bypass polling, and never start the PO workflow.
- `needs_review` now exposes editable OCR text, versioned save, and an explicit “Save and continue to PO review” action for an opted-in PO request. Saved corrections feed the same document job into Jev; GIS writes still require their separate previews and confirmation.
- Correction audit stores only a SHA-256 digest and character count for OCR edits; original OCR pages remain unchanged. Corrected text remains within tenant/actor job access and the existing expiry/deletion lifecycle.
