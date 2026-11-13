# GIS optional knowledge-review consent and 403 diagnosis

- Date: 2026-11-11 (Asia/Bangkok)
- Request: Make GIS FaroTest's consent options match FaroAI and resolve the generic chat permission/consent error.

## Decision and scope

- Keep the required chat-processing consent.
- Add a separate optional, unchecked consent to review scrubbed text Q&A as knowledge for the current tenant.
- Do not treat this as local/shared model-training consent or direct Qdrant indexing; existing human review/approval remains required.
- Forward the optional choice only through a validated GIS backend header.
- Expose only allowlisted, safe upstream 403 reasons so the active deployment can be diagnosed.

## Implementation status

- FaroAI ADR/spec updated. GIS frontend added the optional, unchecked tenant-knowledge review checkbox and sends `ai_improve_consent` per request. GIS backend validates that boolean and forwards it only as the dedicated consent header; training consent remains false.
- GIS backend maps only allowlisted upstream 403 codes (`consent_required`, `forbidden`, `tenant_disabled`) to safe explanations. Static checks passed; the exact reason for the earlier live 403 has not been observed through an authenticated browser request.

## Document upload follow-up

- Added a separate FARO test paperclip flow for PDF, PNG, and JPEG documents, with explicit per-file local OCR consent, upload status polling, OCR text review, page preview, and deletion.
- GIS backend proxies the existing FaroAI document-import endpoints using the separate `document:import` scope; chat retains `chat:write`. Files are capped at 20 MiB and checked by signature before forwarding.
- FaroAI's `FAROAI_DOCUMENT_IMPORT_ENABLED` flag was observed enabled and the document-import worker running on 2026-11-11. The GIS tenant app credential still must include `document:import`; this was not changed automatically.
- `localhost:5003` was confirmed to be served by the React dev process in `jw-gis-frontend`, and `localhost:3009` by `jw-gis-backend`. No end-to-end upload was run because the tenant credential's `document:import` grant was not verified.
- Static ESLint passed for the frontend. Backend `node --check` and `git diff --check` passed. No tests or builds were run.
