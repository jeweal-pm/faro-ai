# 2026-11-10 — Business document intake foundation

## Decision and scope

- Added ADR-0056 and the implementation spec for a reusable tenant-scoped document intake pipeline and versioned document type registry.
- Implemented the first review-only slice. It accepts one PDF, PNG, or JPEG at a time; extracts selectable PDF text where usable and runs local English/Thai OCR otherwise; generates encrypted safe page previews; and lets users manually label a registered document type.
- The registry includes Purchase, inventory movement, Sales, and Finance document families. Every type remains `registered_only`; this slice does not perform AI classification, structured business-field extraction, GIS preview/write, Qdrant indexing, model training, or central sharing.
- A short/no-text OCR result is rejected with guidance so common jewelry/product photos are not presented as business documents. This is a bounded OCR heuristic, not a general-purpose visual document classifier.

## Implementation

- Added tenant/actor-scoped gateway routes, dedicated `document:import` permission, explicit per-upload consent, byte/signature checks, AES-256-GCM source storage, OCR evidence limits, review correction versioning, 24-hour encrypted source retention, and seven-day review/preview retention.
- Added PostgreSQL migration `021_business_document_intake.sql` with a NOLOGIN worker group role and least-privilege column grants.
- Added a non-root, no-egress, opt-in OCR worker, isolated PostgreSQL-only network, dedicated source/preview volumes, bounded tmpfs/resources, and a restricted credential provisioning script. Local execution of the script and worker runtime checks are recorded below. User deletion scrubs text and removes the source immediately; the worker asynchronously deletes encrypted previews while retaining only content-free audit/tombstone metadata.
- Added a separate `/document-import` review workspace, same-origin server proxies, a paperclip entry point beside the existing image-search control, per-upload retention notice, OCR truncation notice, and tenant credential scope option. Existing image-search attachment behavior remains separate.
- Added operator details and source hashes in `documents/infra/document-import-worker-2026-11-10.md`.

## Verification and rollout

- Checked `docker compose config --quiet`; built the API, Backoffice and OCR worker images. The first API build exposed four TypeScript errors, corrected in `gateway/src/document-import.ts`; a first initializer run also revealed Compose split the shell command into argv, corrected in `docker-compose.yml`.
- Applied migration 021, provisioned the least-privilege worker login, generated a local-only 32-byte base64 encryption key in `.env` (mode 0600), enabled the local feature flag, and started the `document-import` profile. No secret value is recorded here.
- Verified API readiness, a fresh worker heartbeat, English/Thai OCR language data, UID/GID 1000, read-only worker root, internal PostgreSQL-only network, blocked external TCP/gateway DNS, 0700 storage roots, and restricted DB grants.
- Synthetic integration checks: searchable PDF, scanned Thai PDF, English PNG and Thai PNG reached review; a ring-only image was rejected. Cross-tenant read returned 404; owner preview returned JPEG; explicit delete hid the job and removed preview; accelerated expiry on a synthetic job cleared encrypted source/preview and OCR payload. Temporary keys, generated documents, records, test audit events and stored test objects were removed.
- The unauthenticated document-import page redirected to sign-in as expected; an authenticated browser walkthrough, parser adversarial corpus/fuzzing, long-running capacity benchmark and production deployment were not performed. Runtime evidence is limited to this local development stack.
- The feature flag remains false by default in Compose, but is enabled in this machine's `.env`. Runtime use requires the local migration, worker DB credential, encryption key and active `document-import` profile.
- The user has not selected the first Purchase subtype/direction or provided authorized sample documents. AI classification/extraction and any GIS mapping remain later work and require evaluated schemas and samples.
