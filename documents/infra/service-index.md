# Infrastructure service index

| Service | Decision | Research | State | Evidence |
|---|---|---|---|---|
| Base Skills artifact worker | ADR-0036 | 2026-10-30, review by 2027-01-30 | Image and isolated tests passed; deployment, identity and end-to-end security checks pending | [handoff](base-skills-artifact-worker-2026-10-30.md), [investigation](../task/investigation/2026-10-30-artifact-worker-rollout.md) |
| Business document parser/OCR worker | ADR-0056 | 2026-11-10, review by 2027-02-08 | Local development build and synthetic OCR/tenant-isolation/expiry checks passed; runtime enabled locally. Adversarial parser review, browser login walkthrough, capacity measurements, and production deployment pending | [handoff](document-import-worker-2026-11-10.md) |

Reference SHA-256 at review: ADR English `2de83c121dbaf94941eb03a2be4c9b96867d6666ee8c6453147a7b7b26595a9a`; `docker-compose.yml` `b267bb448e6416e9b07d30f6d2ab95db702e3f4624f8a6b10d75cb407fe73abe`; worker Dockerfile `5fea454981d742afd5da8e82c6c3de87b48177658eadafa43e58cd9ea2633654`; role migration `93215ef2a7bbdab382fa96c4d439836b31d54d54dbf5b63ea78d51f5965669be`. Re-evaluate evidence whenever these inputs, versions, advisories or deployment assumptions change. This entry does not assert a review of other project services.

For the document-import worker, exact source snapshot hashes and the dated research/evidence boundary are in [its handoff](document-import-worker-2026-11-10.md). The evidence is local-development-only; remaining security and production checks are listed there.
