# Change log — 13-11-26

## GitHub Actions CI/CD

- Added `.github/workflows/faroai-cicd.yml` for Compose validation and builds on pull requests and pushes to `dev`.
- Added an explicitly manual staging deployment path behind a protected GitHub Environment. It uses GitHub OIDC, private ECR SHA-tagged images, a minimal checksummed S3 bundle and AWS Systems Manager; it does not use SSH or static AWS access keys.
- Added `infra/deploy/ec2-compose-deploy.sh` to deploy prebuilt images with the host-managed `/opt/faroai/.env`, a temporary Docker credential store and a readiness check.
- Updated Compose services to accept image references while retaining local-build fallbacks.
- Added ADR-0063 and the GitHub Actions CI/CD specification.
- Production deployment remains out of scope until the open database-theft/security gates are closed. AWS resources and GitHub environment configuration were not provisioned in this change.

## Validation

- GitHub Actions YAML parsed successfully; Compose config validation with `.env.example`, the hosted overlay and both optional profiles passed; deploy script passed `bash -n`; `git diff --check` passed.
- No container was started and no AWS/GitHub deployment was run.

## Source SHA-256

- Workflow: `0cddd76b30c249db4d0ef20375854d0eec265a8b42ee7da9d27e4f2c131c9ad4`
- EC2 deploy script: `599bcc8a6d5ed92a1748ad61d414dadec4d9a8a38addccd5ddf8f2af730e05f9`
- Compose image support: `5706366d2856ae9ab15492202b47e747ec271baee7a9d833d62facb4616d3ef5`
- ADR-0063: `b29f04b46fb571d62b0cc993fcefd984b99c3d5d90714232f0a555dfbf3cbaae`
- SPEC: `0740f33469587ccc0f2ad90ddf6fa03edd80dbeae17d9e561150c29936b2a1b0`
