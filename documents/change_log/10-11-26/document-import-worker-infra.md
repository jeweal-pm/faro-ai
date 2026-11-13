# 2026-11-10 — Document import worker infrastructure

- Added a dedicated, opt-in parser/OCR worker image using pinned pypdfium2, Pillow, cryptography, psycopg and Debian Tesseract English/Thai packages.
- Added private source/preview named volumes, one-shot permission initialization, and a no-egress internal PostgreSQL-only network; gateway access is flag-gated and the worker has no published port.
- Added an unexecuted provisioning script for the restricted worker LOGIN role; it stores the connection URL in `.env` without enabling the feature.
- Refreshed the handoff source hashes after the worker and migration cleanup contract was aligned (`preview_deleted_at` plus worker updates to correction audit metadata).
- Kept worker caps at 0.20 CPU/512 MiB with bounded tmpfs; documented the aggregate 8-GB/4-vCPU budget, secrets, review window and pending checks in `documents/infra/document-import-worker-2026-11-10.md`.
- Updated `documents/infra/service-index.md`. No build, test, container start, volume change, migration execution or deployment was performed.
