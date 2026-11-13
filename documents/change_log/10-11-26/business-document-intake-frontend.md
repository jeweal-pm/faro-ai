# Business document intake frontend

Date: 2026-11-10 (Asia/Bangkok)

## Changes

- Added a tenant-authenticated `/document-import` workspace with a dedicated upload, consent, OCR status, safe page preview, OCR text review, manual document-type labeling, retention display, and cancellation/deletion flow.
- Added same-origin Next route proxies for document type lookup, upload, status, draft label updates, safe page previews, and deletion. Mutating requests require the tenant session, origin validation, CSRF, and explicit per-upload consent. Actor identity is derived by the backend from authenticated credentials.
- Added a separate paperclip entry point in the discovery composer. The existing jewelry reference-image picker remains a separate control and keeps its current search behavior.
- Added the distinct `document:import` permission to tenant API credential configuration so the capability can be granted separately.
- The interface states that this first release provides OCR/text review only; automatic classification, structured extraction, AI provider calls, RAG/Qdrant learning, and GIS writes are not available in this slice.

## Files

- `backoffice/app/document-import/`
- `backoffice/app/api/document-imports/`
- `backoffice/app/discovery-page.tsx`
- `backoffice/app/tenant/FaroAIApiCredentials.tsx`
- `documents/change_log/10-11-26/business-document-intake-frontend.md`

## API assumptions

- Backend routes follow `documents/spec/business-document-intake.md` and the coordinated v1 contract: `GET /v1/document-types`, `POST /v1/document-imports`, `GET|DELETE /v1/document-imports/{id}`, `PATCH /v1/document-imports/{id}/draft`, and `GET /v1/document-imports/{id}/preview/{page}`.
- Upload accepts PDF, PNG, and JPEG, includes optional `selected_type_id` and `language_hint`, and requires `x-faroai-document-import-consent: true` plus the backend `document:import` scope. The catalog's configured `retention.source_hours` and `retention.review_days` are displayed before consent; upload is disabled if this policy cannot be loaded.
- UI polls the returned job status without displaying synthetic progress. Active statuses are `queued`, `validating`, and `processing`.
- `no_document_text_detected` returns guidance to check image clarity or try a searchable PDF. The workspace displays the job expiry timestamps returned by the document service.
- OCR page previews display an explicit notice when the service marks extracted text as truncated. Successful deletion reports that source/OCR data is cleared immediately while encrypted previews are removed asynchronously by the worker; the job is removed from the workspace immediately.

## Verification

- No tests or builds were run, per the task instruction.
