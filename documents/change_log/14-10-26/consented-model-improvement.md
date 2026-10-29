# Consented model improvement and training

Date: 14-10-26

- Added ADR-0012 to separate tenant-scoped RAG knowledge promotion from supervised fine-tuning, with end-user consent, tenant authorization for shared contributions, manual review, expiry, deletion and release controls.
- Added the implementation spec and updated the ADR implementation audit to record the current state and remaining runtime/trainer gaps.
- Added PostgreSQL migration 004 for tenant shared-training authorization, scrubbed interaction candidates and dataset export manifests.
- Added purpose-specific consent propagation through the Backoffice and gateway. Candidates require improvement or matching local/shared training consent and are scrubbed before storage.
- Added redaction for credential patterns, bearer tokens, common cloud access-key IDs, email addresses, links, phone-like values and Luhn-valid payment card numbers before candidate persistence.
- Added a Backoffice Learning & training view for review, independent RAG/local/shared approval, withdrawal and JSONL export.
- Approved RAG candidates are queued for Qdrant indexing and can be deleted through a tenant-scoped internal operation. The embedding worker now reports indexing completion/failure to the candidate.
- Shared contribution is blocked in self-hosted deployments even if a deployment flag is accidentally enabled. Review uses a compare-and-set update; deletion marks the candidate withdrawn before vector removal, and the worker checks candidate approval around indexing to prevent deleted items from being reintroduced.
- Added 90-day cleanup for pending candidates and export audit records with content hashes.
- Fine-tuning jobs, immutable dataset snapshots, model evaluation and release are not implemented. The current CPU-only environment has no configured trainer, and export does not mean model weights changed.
- Cache maintenance: `pnpm store prune` removed unused pnpm metadata/files; packages still linked by the workspace were retained. No new libraries were installed.
- Validation: gateway and Backoffice TypeScript typechecks pass. Python syntax validation could not run because the host only exposes a Windows Store launcher, with no Python interpreter installed. Docker runtime/migration verification remains unavailable while Docker Engine is returning an internal error.
