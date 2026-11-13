# FaroAI business-document intake and review spec

- **Status:** Implementation spec for the OCR/evidence review foundation
- **Date:** 2026-11-10
- **Decision:** [ADR-0056](../adr/0056-secure-business-document-intake.md)
- **PO-from-document extension:** [ADR-0058](../adr/0058-natural-language-document-to-po.md)
- **Discovery:** [Business-document import discovery](../product/discovery/2026-11-10-ai-business-document-import.md)

## Goal

Accept business documents in varied layouts, extract local text/OCR evidence, and let an authenticated tenant user review the source and correct an unknown document type. The general intake remains OCR/review-only. The separately authorized, narrow PO-from-document path in ADR-0058 may send OCR text to an eligible model and prepare one GIS PO preview; it does not enable general AI document extraction or GIS writes for other document types.

## Scope for first implementation

- Separate attachment path for source business documents; do not repurpose the existing image attachment used to create/revise FaroAI reports or product-search images.
- PDF, PNG, and JPEG only; one file per job.
- Suggested initial bounds: 20 MiB/file, 25 PDF pages, 20 megapixels/image, one running worker job. These are protective starting limits and may be lowered by deployment configuration.
- PDF text extraction page-by-page; local OCR for pages with missing/unusable text and for raster images. Preserve evidence page and bounding boxes where available.
- Versioned registry with broad document families and a safe `unknown` result. Initial families may include Purchase, inventory movement, Sales, and Finance, but only generic extraction/review is enabled until each type has its own evaluated schema.
- General intake records the document type as `unknown` and returns OCR/text evidence only; typed field extraction and model-based classification for the document registry are not enabled.
- Authenticated status, safe preview, correction, expiry, and deletion flows. No GIS read/write, no Qdrant ingestion, no central sharing, and no model fine-tuning.

## Extensible document type registry

Each definition contains:

```text
type_id, version, family, direction, names_and_aliases_by_language
accepted_formats, schema, required_fields, optional_fields
extraction_guidance, evidence_rules, deterministic_validators
duplicate_policy, evaluation_fixtures, owner, support_status
gis_read_mapping?, gis_preview_mapping?, gis_write_mapping?, required_permissions[]
```

Support states are independent. A type may be known to the classifier but not yet extractable; it may be extractable/reviewable without any GIS operation; GIS preview/write remain disabled until their separate contracts and permissions are reviewed. The registry is version-controlled and versioned in job records so prior results keep their schema meaning after an update.

When a user corrects an unknown type, record the correction as feedback. It may provide a tenant-local alias/layout hint only if the user explicitly chooses to remember it. Do not add a platform-wide type or promote capabilities automatically from one upload. A new type requires a reviewed definition, authorized samples, expected-field fixtures, evaluation, and an owner.

## User flow

1. An authenticated user selects one PDF/image from the attachment button in the main chat composer. The file name appears in the composer; the user sends it with the same send button used for a chat message. `/document-import` returns to the main chat so there is one upload entry point.
2. Before sending, the composer states the per-upload scope and configured retention. For a clear PO creation request, one unchecked consent on the upload/send action authorizes local OCR, sending only extracted text (not source bytes or previews) to the tenant's eligible paid model, and creating one PO in GIS after its preview passes. The consent must state both model processing and the PO write. The server binds consent to the prompt; a changed prompt requires a new upload and opt-in. It does not authorize Qdrant/RAG, training, or central sharing.
3. API streams the file into a tenant-scoped encrypted quarantine object, validates actual signature and limits, and creates a queued job using tenant/actor from auth context.
4. Isolated worker validates and reads pages, extracts text/OCR, and creates safe page previews. Unsupported or suspicious inputs fail closed.
5. The OCR/review-only path returns `unknown` and page-level text/OCR evidence with token boxes where available. For the narrow PO path described by ADR-0058, a consented upload automatically sends bounded OCR text to Jev when OCR reaches `needs_review`; there is no extra “continue” click. Only the stored, prompt-bound consent can authorize it. The flow uses the ordinary GIS PO executor and does not enable model-based processing for other document types.
6. UI shows a single processing progress state while the document is processed, then the created PO number and pending-approval status. A queued/needs-review OCR state is not a completed import. The app continues automatically through Jev, GIS preview, and confirmation after the same checked submission. If the user requests correction or automatic preparation cannot proceed, the user can edit the recognized OCR text, save a versioned tenant-scoped correction, and retry without uploading again as long as the original prompt consent still matches. The source image and original OCR evidence remain unchanged; the correction audit stores a content hash and length rather than another copy of the text. This is text correction, not structured field extraction or document classification.
7. Job and file data expire per tenant/deployment retention. User can delete the job and its source/derived data sooner.

## API contract

### `GET /v1/document-types`

Returns catalog version and an array of definitions visible to this deployment: `type_id`, `version`, localized label/aliases, family, accepted formats, `support_status`, and capability booleans. It does not reveal tenant data.

### `POST /v1/document-imports`

Multipart fields: one `file`; optional `selected_type_id` and `language_hint`. No tenant/actor field is accepted as authority. Requires `document:import` and an explicit `x-faroai-document-import-consent: true` header for browser/API callers. The optional `x-faroai-document-model-consent: true` header records the separate consent to use OCR text with the configured paid AI model; it never sends content by itself. Server authenticates CSRF/session as applicable. Returns `202` with `id`, `status`, `created_at`, and `expires_at`.

Error codes: `unsupported_file`, `file_too_large`, `page_limit_exceeded`, `invalid_file`, `consent_required`, `forbidden`, `rate_limited`, `storage_unavailable`.

For an explicitly consented PO request, the multipart upload also includes one bounded `po_prompt` field and the server-side caller sets `x-faroai-document-model-consent: true`. FaroAI stores only a keyed HMAC of the normalized prompt; it does not store a second copy of the prompt for consent verification. The prompt field is required when model consent is set.

### `POST /v1/document-imports/{id}/procurement`

Requires both `document:import` and `document:procurement`. The authenticated GIS backend forwards a stable, server-attested GIS actor identifier. JSON body is only `{ "prompt": "..." }`; the endpoint loads OCR from the same tenant, OAuth client, and actor-owned job. It verifies OCR is ready, consent was recorded for that upload, and the prompt matches the stored HMAC. The browser cannot submit authoritative OCR text, tenant ID, or actor ID.

The route sends only bounded OCR text to the eligible paid model and returns the existing GIS-validated PO preview/pending-confirmation response. The application then automatically calls the confirmation route for that exact stored `draft_id`; the confirmation route additionally requires `gis:procurement:write`. The client cannot substitute another draft ID, tenant, actor, or OCR text. A changed prompt, missing consent, different actor, invalid preview, or incomplete OCR fails closed. If the response is ambiguous after a write attempt, show an unknown outcome and instruct the user to check GIS before retrying.

### `GET /v1/document-imports/{id}`

Tenant/actor-scoped result containing status, registry version, type candidates, confidence, extracted document fields, line items, source evidence references, validation issues, correction version, and expiry. It returns no raw filesystem path, API key, internal stack trace, or source bytes.

### `PATCH /v1/document-imports/{id}/draft`

Accepts only typed user corrections, selected type among permitted candidates, and optional `remember_mapping_for_this_tenant`. Each correction records actor, timestamp, prior value, replacement, and evidence pointer. It cannot enable GIS capabilities or change source fields invisibly.

### Delete and preview

`DELETE /v1/document-imports/{id}` immediately hides the job and clears OCR/correction/source metadata, prompt-bound consent, and PO results, removes the encrypted source, and records a content-free deletion audit. OCR and PO results are also cleared after the seven-day review expiry, even if the source file was removed earlier. Because the API mounts the preview volume read-only, it queues encrypted preview removal for the isolated worker; the worker removes pages by UUID and leaves only the minimal tombstone/audit. The UI reports that deletion was requested until this worker cleanup completes. Safe preview is streamed only after the same ownership/expiry checks; use generated raster pages, never the unprocessed upload inline.

## Job and data lifecycle

```text
queued -> validating -> processing -> needs_review -> completed
                   \-> rejected / failed
queued|processing|needs_review -> cancelled
any retained state -> expired (TTL cleanup)
```

The PostgreSQL row stores tenant/actor/API key reference, opaque object ID, source hash, sanitized source name, actual file type, registry/schema version, consent snapshot, job status, structured extraction/evidence, correction audit, created/updated/expiry timestamps, and bounded error code. Source bytes live encrypted in a dedicated volume, not `artifact_data`; worker reads that volume read-only and writes encrypted safe page previews to a separate restricted result path. Per-page preview is capped at 3 MB and total preview output at 20 MB per job. OCR text is capped at 1 MB and evidence boxes at 1,000 per job, keeping the result payload bounded. Temporary decrypted inputs live only in size-limited tmpfs and are deleted in `finally`/job cleanup paths.

## Security requirements

- Derive tenant and actor only from validated bearer/session auth; enforce tenant and actor on upload, status, correction, preview, and delete.
- For browser mutations, require an Origin matching the configured backoffice origin or the incoming host/proxy scheme, then independently require the tenant session's CSRF token. This supports reverse-proxied/Docker hostnames without disabling origin or CSRF checks.
- Stream multipart input with hard byte limit; do not buffer arbitrary files as base64/JSON. Compare extension, declared MIME, and file signature; never trust the client MIME.
- Reject encrypted/corrupt PDFs, SVG, archive inputs, unsupported media, excess pages/pixels, malformed objects, and active content when it cannot be safely handled.
- Run maintained PDF/image libraries as non-root in a separate container with read-only root, no network egress, dropped capabilities, no-new-privileges, default seccomp, CPU/RAM/PID/time limits, and only specific RO/RW volumes. Do not mount Docker socket, application secrets, or artifact volume.
- Use a separate document encryption key; authenticated encryption with unique nonce per object. Keep keys out of logs and browser responses. Define backup and key rotation before production rollout.
- OCR/text is untrusted input and can contain prompt injection. Model receives no tools or secrets; output must pass strict schema and code validation. External processing requires both tenant policy and per-upload consent.
- No automatic Qdrant/RAG/training or central sharing. Tenant-local memory stores only a user-approved generic alias/layout hint, never transactional values from a prior document.
- Keep raw source for 24 hours and review data for 7 days by default, configurable downward/according to tenant policy. Delete source and derived previews/results together; audit deletion metadata without retaining file content.
- Malware scanning is defense-in-depth and does not certify a file as safe.

## Initial resource profile

Worker starts sequentially with proposed hard caps of 0.20 CPU, 512 MiB RAM, bounded process count and tmpfs. It is in an opt-in `document-import` Compose profile; the feature remains disabled unless the required key, migration and worker are configured. The 20 MiB / 25-page / 20MP input bounds are starting caps. Measure peak memory, disk, throughput and p95 wait using authorized anonymized samples before increasing them. Capacity must be included in the total 8 GB / 4 vCPU host budget; do not use a 2-vCPU/4-GB OCR container on the current host.

## Deferred

- Type-specific extraction/review schemas for document families beyond the narrow PO creation path in ADR-0058; representative redacted/authorized sample documents are still required before enabling those schemas.
- GIS master reconciliation, preview, and write for document types other than the PO flow in ADR-0058.
- Office formats, multi-file packets, batch admin screens, model classification/extraction for other document types, Qdrant learning, and central-shared learning.

## Natural-language PO-from-document extension (ADR-0058)

This extension enables one explicitly requested PO from a supported attachment. A user may write a natural request such as “Add this document to a PO” in Thai or English; the request does not need to follow a field template. Local text extraction/OCR still runs first. The user's original request determines whether a PO is intended; the document itself is evidence only and is never an instruction source.

External processing has a separate consent snapshot from local OCR consent. When enabled, only bounded OCR text is sent to the tenant's eligible paid model selected by Jev; source bytes and page previews are not sent. Without that consent the file stays in OCR/review. This does not authorize training, Qdrant ingestion, or cross-tenant sharing.

The existing GIS procurement executor resolves the supplier, location, active purchase voucher, and products from the tenant's live GIS data, then prepares the standard no-write PO preview. The first version supports one destination Location per PO. Buyer / Bill To is retained only as a labeled source-document reference; GIS PO creation has no buyer field.

For Supplier data, generated PO import samples include Country and Phone. The sample's Country is `Thailand` and its phone value is clearly synthetic. For an uploaded document that omits Supplier Country, FaroAI may use a verified value only after a unique, exact tenant-local GIS supplier match and a read-only MCP detail lookup. Do not use Buyer, tenant, or Ship-to country as a proxy. If no verified Supplier Country is available and the flow needs to create a Supplier, stop and ask the user. GIS treats Supplier Phone as optional: preserve a source or verified GIS phone when available; otherwise leave it blank instead of fabricating a contact number.

If the document names a Supplier, one Ship-to Location, or Purchase order Voucher absent from GIS, FaroAI may propose the relevant GIS create action only from complete source facts and current GIS schemas. Supplier, Location, and Voucher each require a separate review/confirmation before their own MCP write. A Location requires an exact match to an active GIS tax master. After each successful prerequisite confirmation, FaroAI resumes the same authorized document job and original prompt automatically; it does not save OCR text in the confirmation draft. Once required masters exist, it prepares and creates the PO automatically under the original prompt-bound consent.

Missing or ambiguous supplier/product/quantity/purchase-price/currency/location/voucher values must be clarified rather than invented from context. Automatic PO creation occurs only after the GIS preview validates and the exact prompt-bound consent authorizes the write; GIS creates the PO pending approval. FaroAI cannot approve it or receive inventory from this workflow.

### Source-bound PO master matching (ADR-0059)

GIS-valid IDs must also match the OCR evidence. Before PO preview, FaroAI searches the exact Supplier and Ship-to values from the source. If both a name and code are present, they must resolve to one active GIS record; a contextual/default match such as Ham or Central World is rejected when the document names another party/location. Each PO product ID must come from the current GIS `search_po_products` results, and its exact source SKU or name must be present in the OCR. If the source pairs a product name with a different SKU, the GIS candidate is rejected. Quantities and unit prices still need explicit source evidence.

If the exact Supplier is missing and all required GIS fields are directly supported by the source, FaroAI stages a Supplier review card. The user confirms that GIS master write separately; FaroAI then resumes the same document request and repeats exact matching. Missing required supplier fields are asked from the user. A missing Ship-to is handled the same way, except Location creation requires an exact active GIS tax master; absent/ambiguous tax pauses for clarification. Any missing, inactive, duplicate, or incompletely searched source master blocks PO preview. No GIS preview can override this source check, and existing mismatched POs are not silently edited.

The document job is fetched server-side using the signed-in tenant credentials and its existing actor scope. Never accept OCR text from a browser request as authoritative, include document text in logs, or return it in procurement history. If OCR is truncated or exceeds the bounded model-input limit, stop and ask the user to reduce/split the source rather than silently omitting line items. Other document types and batch PO creation remain unsupported.

### Editable PO preparation and retry (ADR-0060)

When a consented PO preparation reaches review or fails to produce a valid GIS preview, show an editable form for Supplier name/code and existing-vs-create action, Ship-to name/code and existing-vs-create action, and line-item product name, GIS SKU, quantity, unit price, and currency. Users may add or remove line rows. Resubmission reuses the same retained document and prompt-bound consent, but creates a fresh Jev/GIS preparation attempt; it never reuses a stale preview or confirmation draft.

Save the submitted values as an explicitly marked user correction block in the tenant/actor-scoped corrected OCR draft with optimistic correction-version checks. Keep original page OCR and source bytes unchanged. Runtime may treat only that marked block as user correction evidence; it must search GIS again and enforce exact active master/SKU matching. Selecting “map existing” forbids creating that master. Selecting “create new” still requires all required supported fields and the separate GIS master review/confirmation. No GIS write is authorized by merely editing or resubmitting the form.

The first mapping interface accepts exact GIS name/code/SKU values as form inputs. Searchable GIS-backed selectors, duplicate dashboards, alias governance, safe merge workflows, and master archival controls are later improvements; do not silently create near-duplicate masters as a substitute.
