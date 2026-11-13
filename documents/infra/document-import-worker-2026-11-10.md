# FaroAI document-import worker — infrastructure handoff

- **Date:** 2026-11-10 (Asia/Bangkok)
- **Decision:** [ADR-0056](../adr/0056-secure-business-document-intake.md), accepted review-only foundation
- **Contract:** [business-document intake spec](../spec/business-document-intake.md)
- **State:** Local development runtime enabled and synthetic end-to-end OCR checks passed on 2026-11-10. This is not a production security review or production deployment.
- **Research reviewed:** 2026-11-10; review by 2027-02-08 or earlier if the base image, dependencies, Docker configuration, parser code, or relevant advisories change.

## Runtime boundary

The OCR/parser worker is opt-in under the Compose profile `document-import`; the gateway feature flag defaults to `false`. There is no published port. The worker is attached only to the `document_import_db` internal network shared with PostgreSQL. It does not join `app`, `data`, or `host_api`, so it cannot reach the gateway, Redis, Qdrant, MCP, or provider egress through Compose.

PostgreSQL keeps its existing `data` membership and joins `document_import_db`. The gateway remains on its existing networks and reaches PostgreSQL through `data`. The network path for document work is therefore gateway → PostgreSQL over the existing path, and worker → PostgreSQL over the dedicated internal network. The worker does not make HTTP calls.

| Container | Source volume | Preview volume | Identity/network |
|---|---|---|---|
| Gateway API | RW at `/var/faroai/document-import/source` | RO at `/var/faroai/document-import/previews` | Existing UID/GID 1000; existing app/data/host_api networks |
| Document-import worker | RO at `/var/faroai/document-import/source` | RW at `/var/faroai/document-import/previews` | UID/GID 1000; only `document_import_db` |
| Volume initializer | RW only while initializing the two new volume roots | RW only while initializing the two new volume roots | One-shot, no network, root with `CHOWN` and `FOWNER` only |

The initializer sets only each named-volume root to owner `1000:1000`, mode `0700`; it does not traverse or rewrite document files. It is unprofiled because the always-on API depends on successful initialization. It only prepares empty/private storage and does not enable intake. Only the worker is profile-gated. Both volumes are new and separate from `artifact_data`.

## Resource envelope and enablement

The worker is sequential and capped at **0.20 CPU, 512 MiB RAM, 64 PIDs**, with a **128 MiB `noexec,nosuid,nodev` tmpfs**. The one-shot volume initializer is capped at 0.05 CPU, 32 MiB and 16 PIDs. The image runs non-root, with a read-only root filesystem, all Linux capabilities dropped, `no-new-privileges`, and Docker's default seccomp profile (no custom profile override).

Across configured service caps in the default stack, adding the OCR worker and initializer gives approximately **3.20 vCPU and 6,432 MiB RAM**. If the optional artifact-worker profile also runs, the configured totals are approximately **3.55 vCPU and 6,944 MiB RAM**, leaving 0.45 vCPU and 1,248 MiB below the 4-vCPU/8-GiB service budget. These are Compose limits, not measured usage; the optional-profile combination leaves limited host headroom and must be monitored. The one-shot PostgreSQL migrations service has no explicit resource cap in the current Compose file, so this sum does not bound migration peak usage.

Compose still defaults `FAROAI_DOCUMENT_IMPORT_ENABLED` to false and secret variables to empty values. In the local development `.env`, the feature is now enabled with a generated 32-byte base64 key, a provisioned restricted worker URL, and file mode `0600`. Migration 021 is applied and the `document-import` profile is running. The migration creates only a NOLOGIN group role; the provisioning script creates its dedicated LOGIN account. Never use the PostgreSQL owner credential for the worker. The application remains fail-closed if the flag, key, restricted DB credential, or ready heartbeat is missing. Do not copy local development secrets to another deployment.

After migration 021 has been applied and the normal PostgreSQL credential is configured, `bash infra/postgres/provision-document-import-worker.sh` provisions the dedicated `faroai_document_import_worker` LOGIN role, grants membership in the restricted group, and writes its URL to `.env` with mode `0600`. The script was run for the local development database. It does not enable the feature, set the encryption key, run migrations, or start containers. Treat `.env` as a secret and back it up only through the deployment's approved secret-management process.

Source objects and JPEG previews are encrypted by the application with AES-256-GCM. The image receives only the document encryption key and the restricted worker database URL; it receives no gateway, Qdrant, provider, or GIS credentials. No credential values belong in this file or in logs.

Migration 021 records source and preview expiry separately. The gateway's source-expiry sweep hard-deletes encrypted source objects after 24 hours and records `source_deleted_at`. The worker's preview cleanup runs against expired jobs after the seven-day review-data TTL, deletes the job's bounded page-preview objects, then marks `preview_deleted_at` and clears retained OCR/extraction, validation, and correction-audit payloads. A user deletion immediately hides and scrubs the job, attempts source deletion, and marks it cancelled; the worker then removes preview pages asynchronously and retains only minimal tombstone metadata. Failed source deletion is retried by the gateway's bounded cleanup. Local runtime cleanup was verified by advancing the expiry of one synthetic job; the full 24-hour/7-day wall-clock waiting period and failure/retry scenarios were not exercised.

## Image contents

- Base: `python:3.12-slim-bookworm` (official Python image; Python 3.12 and Debian Bookworm line).
- PDFium binding: `pypdfium2==5.15.2`. Version 5.15.1 was yanked upstream for an object-close regression; 5.15.2 is the subsequent upstream release. The project warns against exposing PDFium to untrusted files outside a sandbox.
- Image normalization: `Pillow==13.0.0`.
- Authenticated encryption: `cryptography==50.0.2`.
- PostgreSQL access: `psycopg[binary]==3.3.6`.
- OCR: Debian Bookworm `tesseract-ocr=5.3.0-2`, English data `tesseract-ocr-eng=1:4.1.0-2`, and Thai data `tesseract-ocr-tha=1:4.1.0-2`.
- Python packages are version-pinned and installed with pip cache disabled. Debian packages and the Python base tag must be refreshed when security fixes require it; pins do not replace advisory review.

## Research sources

All links below were reviewed on 2026-11-10.

- [Docker Compose services reference](https://docs.docker.com/reference/compose-file/services/) — read-only roots, volume modes, resource limits, capabilities, security options, and logging controls.
- [Docker Compose networking](https://docs.docker.com/compose/how-tos/networking/) — an internal network has no connection to host network interfaces; the worker receives a separate database-only path.
- [Docker Compose profiles](https://docs.docker.com/compose/how-tos/profiles/) — profile-gated worker activation and dependency resolution.
- [Docker seccomp profiles](https://docs.docker.com/engine/security/seccomp/) — retain the Docker default seccomp profile unless testing justifies an exception.
- [pypdfium2 5.15.2 release notes](https://github.com/pypdfium2-team/pypdfium2/releases/tag/5.15.2) — current release and upstream warning that PDFium needs sandboxing for untrusted input.
- [Pillow 13.0.0 on PyPI](https://pypi.org/project/pillow/13.0.0/), [cryptography 50.0.2 on PyPI](https://pypi.org/project/cryptography/50.0.2/), and [psycopg-binary 3.3.6 on PyPI](https://pypi.org/project/psycopg-binary/3.3.6/) — pinned package release metadata.
- [Tesseract installation guide](https://tesseract-ocr.github.io/tessdoc/Installation.html) and [input formats](https://tesseract-ocr.github.io/tessdoc/InputFormats.html) — OCR engine and supported input guidance; PDF pages are rendered before Tesseract is called.
- [Debian Bookworm Tesseract engine](https://packages.debian.org/bookworm/tesseract-ocr), [English language data](https://packages.debian.org/bookworm/tesseract-ocr-eng), and [Thai language data](https://packages.debian.org/bookworm/tesseract-ocr-tha) — versions pinned in the image definition.
- [Official Python slim Bookworm image definition](https://github.com/docker-library/official-images/blob/master/library/python) — supported 3.12 slim Bookworm image line.

## Local verification and remaining checks

Completed locally on 2026-11-10:

- `docker compose config --quiet` passed. The first API build exposed four TypeScript errors in the new gateway code; the types were corrected, then API and Backoffice builds completed successfully. The OCR worker image also built successfully.
- Migration 021 was applied; the migration runner skipped 002–020. The restricted worker account was provisioned, and the API, Backoffice, PostgreSQL, and OCR worker are running. API readiness returned HTTP 200; the worker heartbeat is fresh.
- Tesseract runtime contains `eng`, `tha`, and `osd`. Worker runs as UID/GID 1000, has a read-only root, private volume roots at mode 0700, no published ports, and only the `internal` PostgreSQL network. A worker connection to PostgreSQL succeeded; its role cannot select `source_name`, delete jobs, or insert audit rows. A direct external TCP probe and gateway DNS resolution were blocked.
- Synthetic uploads passed: searchable English PDF text layer, scanned Thai PDF, English PNG, and Thai PNG reached `needs_review`; a generated jewelry-ring image was rejected as `no_document_text_detected`. No real customer documents were used.
- Tenant isolation returned 404 when the other tenant requested a job. The owning tenant received its safe JPEG preview. Explicit deletion hid the job immediately and the worker removed its preview. For TTL verification only, a synthetic job's expiry was advanced; source and preview cleanup markers were set and the OCR payload was cleared. All temporary API keys, audit rows, job rows, encrypted objects, and generated fixtures were removed.
- The unauthenticated `/document-import` page redirects to sign-in as expected; an authenticated browser walkthrough was not performed. The checks above exercise the API/worker directly using temporary, short-lived tenant test keys.

Not run: parser adversarial corpus/fuzz checks, a full authenticated browser walkthrough, long-duration throughput or memory benchmarks, and production deployment. Compose runtime limits are configuration caps, not measured usage. Perform these checks before production use; this local verification does not make a security guarantee for arbitrary malicious files.

When the feature is disabled, leave the worker profile stopped and keep the gateway flag false. Rollback must not delete either named volume automatically; first stop intake and use the authorized application deletion/retention path. Review this bundle on the review-by date, when a relevant upstream security advisory appears, when any pinned package/base changes, or when the network, volume, credential, migration, or worker contract changes.

## Source snapshot hashes

SHA-256 at handoff preparation:

```text
ADR-0056:      bbdb3e2b1cecd2b5fc67f50c3c17a7fc64fc5e45b09f78a75c2a4fe52873ff52
Intake spec:   9d546e2c34faf467682a661814ddb4c2972ecf8e1b0c4d22c6cdcc3818dd4977
Compose:       b267bb448e6416e9b07d30f6d2ab95db702e3f4624f8a6b10d75cb407fe73abe
Gateway route: 4411af695e8ec72ce035dab0b94ec84d0e290a0c2eb7de69d6bc3777767fd249
Dockerfile:    5fea454981d742afd5da8e82c6c3de87b48177658eadafa43e58cd9ea2633654
Worker entry:  99e3b7bbc061ce93bb3c3eef7409274635cd164f473a68043a6e327a837394cd
Processor:     be46a13f90389d746cddc21c90bd34c2c72483fa0844ef5190d13ff50524cc8e
Migration 021: 93215ef2a7bbdab382fa96c4d439836b31d54d54dbf5b63ea78d51f5965669be
```

This entry records local development evidence only. Recompute hashes and review this bundle whenever the listed source changes.
