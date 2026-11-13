# Document-to-PO one-consent continuation — 11-11-26

- Replaced the mandatory OCR review/continue step with automatic Jev PO preparation when a document reaches `needs_review` and the upload has explicit consent for the same PO prompt.
- Added `POST /v1/document-imports/{id}/procurement`; it reads OCR from the authenticated tenant/client/GIS-actor-owned job, verifies saved consent and prompt binding, and forwards only extracted text to the existing GIS procurement assistant.
- Added `document:procurement` as a narrow FaroAI OAuth scope, plus a confirmation route requiring `gis:procurement:write`. The checked submission authorizes automatic confirmation of the exact GIS-validated PO draft after preview success, removing a second confirmation click for this document-to-PO flow.
- Bound document job ownership to the stable OAuth client plus a server-attested GIS actor so a newly issued scoped token can continue the same upload.
- Forwarded the same GIS actor to preview and PO confirmation, so the preview draft and the confirm request resolve to the same scoped actor.
- Clear extracted OCR, prompt-bound consent, and PO results at the seven-day review expiry and when a user deletes the document.
- Added migration `023_document_po_prompt_consent.sql` for a keyed prompt-consent hash. Earlier model-consent records without prompt binding are invalidated.
- Updated ADR-0058 and the document intake spec. GIS frontend/backend changes are coordinated separately and have their own GIS changelog.
- Missing/ambiguous required values, missing permission, failed preview, or unclear write outcome stops without an automatic retry; the UI must show a review/error state rather than claim success.
- No live GIS records were created or modified. FaroAI gateway and GIS frontend builds, targeted lint, and diff checks passed. Migration `023_document_po_prompt_consent` was applied, the FaroAI API image was rebuilt/recreated, and `/health/ready` returned success. No end-to-end PO creation was attempted.
