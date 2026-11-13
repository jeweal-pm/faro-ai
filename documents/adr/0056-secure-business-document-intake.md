# ADR-0056: Secure, extensible business-document intake

- **Status:** Accepted for the OCR/evidence review foundation; model extraction and GIS actions remain out of scope
- **Date:** 2026-11-10
- **Decision owners:** FaroAI platform
- **Related:** [ADR-0003 Tenant ID](0003-use-tenant-id-for-design.md), [ADR-0005 PostgreSQL](0005-use-postgres-for-general-database.md), [ADR-0026 GIS procurement](0026-natural-language-gis-procurement.md), [ADR-0036 Base Skills](0036-platform-base-skills.md), [ADR-0042 document consent](0042-explicit-document-generation-consent.md), [ADR-0047 generated-document revisions](0047-prompt-driven-document-revisions.md), [Document intake spec](../spec/business-document-intake.md)

## Context

FaroAI can create or revise its own reports, but it does not safely accept arbitrary business documents for extraction. The existing artifact worker and volume are deliberately scoped to rendering FaroAI-generated output. Untrusted supplier PDFs and images require a separate trust, storage, authorization, retention, and parsing boundary. The first Purchase subtype and direction have not been selected, so this decision must not imply a specific GIS operation or permission to write.

The platform should accept varied business-document types and layouts over time. Recognizing a type, extracting a reviewable draft, reconciling it with GIS, and writing to GIS are separate capabilities.

## Decision

1. Implement a shared, tenant-scoped document-intake pipeline and a versioned **Document Type Registry**. A registry definition contains type ID/aliases, family/direction, schema version, field evidence rules, validators, duplicate policy, evaluation fixtures, owner, supported formats, and capability state. Initial example families include Purchase, inventory movement, Sales, and Finance; examples do not imply that GIS can create them.
2. Keep capability states separate: `recognized`, `extractable_reviewable`, `gis_preview_enabled`, and `gis_write_enabled`. The first code slice is OCR/evidence review only: it records `unknown`, returns page text and safe previews, and does not use a model to classify or extract typed business fields. It has no GIS preview/write route and never reuses procurement write tools implicitly.
3. Start with bounded PDF, PNG, and JPEG uploads. Reject SVG, Office archives, encrypted/corrupt PDFs, unsupported formats, and files exceeding configured byte/page/pixel/time limits. Detect PDF text per page; use local OCR only where extracted text is absent or unusable. Render safe page previews for review; never serve an unprocessed source file inline.
4. Store source bytes in a dedicated private quarantine volume, separate from `artifact_data`. Encrypt each stored object using authenticated encryption; keep the master key in deployment secret configuration. The API derives tenant and actor from authenticated context, requires a dedicated document-import permission and explicit per-upload processing consent, and never trusts a tenant ID in the multipart body.
5. Process files in a separate, non-root, no-egress worker. It reads quarantined input read-only, decrypts only into bounded temporary storage, and writes bounded OCR/evidence/safe-preview results. Use strict limits and a single active job initially. The worker cannot call GIS, AI providers, or arbitrary URLs. The API controls any later model call and sends document content to an external provider only when tenant policy and the user's document-processing consent both allow it.
6. Store job metadata, OCR evidence and audit data in PostgreSQL. Use an explicit lifecycle (`queued`, `processing`, `needs_review`, `completed`, `rejected`, `failed`, `expired`, `cancelled`), tenant-bound access for every read/correction, and automatic expiry of source and derived files. Initial proposed retention defaults are 24 hours for encrypted source and 7 days for review data; expose these as configuration and do not retain beyond tenant policy. Limit each generated preview to 3 MB, all previews from one job to 20 MB, OCR text to 1 MB, and evidence boxes to 1,000 per job.
7. Treat OCR text and visible document content as untrusted data, including prompt-injection instructions. Any later model output must conform to a versioned schema and pass deterministic validation; the model receives no credentials or GIS tools. Antivirus is defense-in-depth, not a guarantee.
8. A correction can create a tenant-local alias/layout hint only after explicit user action. Do not train a model, index a source document in Qdrant, or share tenant data centrally by default. Shared patterns require separate explicit opt-in, de-identification, review, and deletion rules.
9. Require human review of extracted fields and evidence. Unknown or ambiguous types remain `unknown` and can be corrected without automatically changing registry capabilities. Adding a type or promoting its support status requires reviewed schema, fixtures, security checks, and an evaluation result.
10. Keep OCR as an opt-in Compose profile until actual memory, CPU, throughput, and disk behavior are measured. Begin with a single sequential worker capped at **0.20 CPU / 512 MiB** as an initial measurement limit; the feature is disabled by default. Do not use the earlier 2-vCPU/4-GB estimate as deployment sizing. Do not start or rebuild containers as part of this decision.

## API boundary

- `GET /v1/document-types` returns the versioned type catalog and capability stages available in this deployment.
- `POST /v1/document-imports` accepts one multipart file, requires authenticated tenant/actor, `document:import` permission and explicit document-processing consent, then returns a job ID.
- `GET /v1/document-imports/{id}` returns the caller's job status, type candidates, OCR evidence, extracted fields (empty until a typed extractor is implemented), evidence references and validation issues.
- `PATCH /v1/document-imports/{id}/draft` records user corrections and their audit metadata; optional tenant-local learning is a separate explicit choice.
- Source/safe-preview download routes must check tenant, actor/session, expiry, and object authorization on every request. User deletion immediately hides and scrubs the job, deletes its source, and asks the isolated worker to remove encrypted preview files; retain only minimal, content-free audit/tombstone metadata.
- No GIS write endpoint is included in the first release. A later document type needs a separate documented GIS read/preview/write mapping and permission review.

## Consequences

- New document types can be added without rebuilding upload, quarantine, OCR, review, or job orchestration.
- The first release can be implemented before choosing the Purchase subtype, but it cannot claim GIS import for any type without a mapped and authorized GIS operation.
- OCR and PDF parsing add operational cost and risk; the opt-in profile and single-job resource cap limit initial load, while measurements decide scaling.
- Per-upload consent and tenant-specific provider policy prevent the upload itself from silently authorizing external model processing.
- Source files, generated artifacts, RAG documents, and training datasets remain distinct data classes with separate retention and authorization.

## Research and security references

Reviewed 2026-11-10:

- [Docker Compose service security and resource settings](https://docs.docker.com/reference/compose-file/services/) — read-only roots, capabilities, CPU/memory limits, and read-only volume options.
- [Docker seccomp security profiles](https://docs.docker.com/engine/security/seccomp/) — keep Docker's default seccomp profile unless a tested service need requires otherwise.
- [Tesseract 5 user manual](https://tesseract-ocr.github.io/tessdoc/) and [input formats](https://tesseract-ocr.github.io/tessdoc/InputFormats.html) — Tesseract OCRs images; PDF pages must be rendered to a supported image format first.
- [pypdfium2 project and security note](https://github.com/pypdfium2-team/pypdfium2) — PDF rendering/text support; upstream explicitly warns against exposing it to untrusted input without a sandbox.
- [OCRmyPDF PDF security guidance](https://ocrmypdf.readthedocs.io/en/latest/pdfsecurity.html) — PDFs can contain executable/remote features and OCR tools are not malware protection. FaroAI therefore uses worker isolation and does not treat OCR/sanitization as proof that a source is benign.

## Acceptance and rollout

The sponsor authorized starting the feature on 2026-11-10. This accepted decision covers the review-only foundation and its isolated worker boundary only. It does not select the first Purchase subtype/direction, approve GIS writes, or authorize live deployment. Roll out only after implementation review and static security/resource validation; enabling the worker in a running environment remains a separate deployment action.
