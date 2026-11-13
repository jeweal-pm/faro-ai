# Infrastructure service index

| Service | Decision | Research | State | Evidence |
|---|---|---|---|---|
| Base Skills artifact worker | ADR-0036 | 2026-10-30, review by 2027-01-30 | Image and isolated tests passed; deployment, identity and end-to-end security checks pending | [handoff](base-skills-artifact-worker-2026-10-30.md), [investigation](../task/investigation/2026-10-30-artifact-worker-rollout.md) |
| Business document parser/OCR worker | ADR-0056 | 2026-11-10, review by 2027-02-08 | Local development build and synthetic OCR/tenant-isolation/expiry checks passed; runtime enabled locally. Adversarial parser review, browser login walkthrough, capacity measurements, and production deployment pending | [handoff](document-import-worker-2026-11-10.md) |
| GitHub Actions CI and AWS staging delivery | ADR-0063 | 2026-11-13, review by 2027-02-11 | Workflow and deployment script statically validated; GitHub/AWS setup and staging run pending; production deployment prohibited by open security gates | [SPEC](../spec/github-actions-cicd.md), [workflow](../../.github/workflows/faroai-cicd.yml) |

Reference SHA-256 at review: ADR English `2de83c121dbaf94941eb03a2be4c9b96867d6666ee8c6453147a7b7b26595a9a`; `docker-compose.yml` `b267bb448e6416e9b07d30f6d2ab95db702e3f4624f8a6b10d75cb407fe73abe`; worker Dockerfile `5fea454981d742afd5da8e82c6c3de87b48177658eadafa43e58cd9ea2633654`; role migration `93215ef2a7bbdab382fa96c4d439836b31d54d54dbf5b63ea78d51f5965669be`. Re-evaluate evidence whenever these inputs, versions, advisories or deployment assumptions change. This entry does not assert a review of other project services.

For the document-import worker, exact source snapshot hashes and the dated research/evidence boundary are in [its handoff](document-import-worker-2026-11-10.md). The evidence is local-development-only; remaining security and production checks are listed there.

GitHub Actions delivery research and review date: 2026-11-13; review by 2027-02-11. Recheck action pins, AWS IAM/OIDC policy, ECR scan/tag policy and SSM deployment behavior before enabling staging or production. Exact config SHA-256 values are recorded in the 13-11-26 change log after final validation.

CI/CD configuration SHA-256 at review: workflow `0cddd76b30c249db4d0ef20375854d0eec265a8b42ee7da9d27e4f2c131c9ad4`; EC2 deploy script `599bcc8a6d5ed92a1748ad61d414dadec4d9a8a38addccd5ddf8f2af730e05f9`; Compose `5706366d2856ae9ab15492202b47e747ec271baee7a9d833d62facb4616d3ef5`; ADR-0063 `b29f04b46fb571d62b0cc993fcefd984b99c3d5d90714232f0a555dfbf3cbaae`; SPEC `0740f33469587ccc0f2ad90ddf6fa03edd80dbeae17d9e561150c29936b2a1b0`.
