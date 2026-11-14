# GitHub Actions CI/CD Specification

**Status:** Implemented for CI and staging template; AWS staging resources and production gates remain operator work.

**Date:** 2026-11-13

**Decision:** [ADR-0063](../adr/0063-github-actions-secure-staging-delivery.md)

## Goals and boundaries

- Validate the Compose model and build every FaroAI application image on pull requests and pushes to `dev`.
- Allow a human-approved staging deployment from a selected `dev` commit.
- Never put `.env`, tenant credentials, provider keys, database passwords, or deployment credentials in Git, image build arguments, S3 release archives, or workflow output.
- Do not deploy production. The current [database-theft review](../infra/2026-11-13-db-theft-security-review.md) identifies unresolved production blockers.
- The pipeline builds and deploys. It does not claim that automated application tests exist; no test suite is invoked by this workflow.
- Creating an EC2 instance does not require a code change to the pipeline. Its identifier and AWS settings are supplied through the protected `staging` GitHub Environment.

## Workflow

File: `.github/workflows/faroai-cicd.yml`

| Event | Work | AWS access |
|---|---|---|
| Pull request targeting `dev` | Compose validation and build all app images/profiles | None |
| Push to `dev` | Compose validation and build all app images/profiles | None |
| Manual dispatch on `dev`, `deploy_staging=true` | Repeat validation/build, publish SHA-tagged images, transfer a minimal release bundle, deploy by SSM, check API readiness | OIDC role after `staging` environment approval |

Image repositories are `faroai-api`, `faroai-ai-service`, `faroai-backoffice`, `faroai-artifact-worker`, and `faroai-document-import-worker`. The AI worker and AI service share the AI image. Each published image uses the full source commit SHA as its tag and carries source/revision labels, SBOM and provenance.

The private S3 archive contains only `docker-compose.yml`, `docker-compose.hosted.yml`, PostgreSQL initialization/migration files and the EC2 deployment script. The workflow computes the archive SHA-256; the EC2 deployment script path is executed only after the host verifies it. S3 must have Block Public Access, TLS-only bucket policy, versioning, server-side encryption, and a lifecycle rule for old release objects.

The EC2 deployment reads optional non-secret overrides from `/opt/faroai/.env`. If absent, the deployment script creates an empty root-owned file with mode `0600`, and Compose defaults apply. Runtime secrets are fetched separately from AWS Secrets Manager into a protected temporary file. The deployment script uses a temporary Docker credential directory, pulls the immutable commit-tagged images, runs Compose with `--no-build`, and checks `/health/ready`. It does not print container logs or secret values. Deployment failure does not automatically roll back a database migration.

## GitHub setup

1. Protect `dev`: require pull requests and successful `validate-and-build`; disallow force-pushes and direct pushes according to the repository's team policy.
2. Create a GitHub Environment named `staging`. Allow deployments only from `dev`; require one or more reviewers; do not permit self-review where repository policy supports that control.
3. Add the following non-secret environment variables to `staging`:

| Variable | Example/format | Purpose |
|---|---|---|
| `AWS_REGION` | `ap-southeast-1` | Single deployment region |
| `AWS_ACCOUNT_ID` | 12 digits | Constrains assumed account |
| `AWS_GITHUB_ACTIONS_ROLE_ARN` | `arn:aws:iam::<account>:role/<dedicated-role>` | OIDC role to assume |
| `ECR_REGISTRY` | `<account>.dkr.ecr.<region>.amazonaws.com` | Private registry hostname |
| `STAGING_SSM_INSTANCE_ID` | `i-...` | Exact staging host target |
| `STAGING_RELEASE_BUCKET` | Private bucket name | Source release bundle destination |

These are identifiers, not credentials. Do not add AWS access keys or application `.env` values to GitHub.

## AWS identity and resource setup

### GitHub OIDC role

Configure the AWS IAM OIDC provider for `https://token.actions.githubusercontent.com` with audience `sts.amazonaws.com`. The role trust policy must constrain `aud` to `sts.amazonaws.com` and `sub` to exactly `repo:jeweal-pm/faro-ai:environment:staging`; do not trust every branch or repository.

Grant only:

- `ecr:GetAuthorizationToken` on `*`, and `ecr:BatchCheckLayerAvailability`, `ecr:BatchGetImage`, `ecr:CompleteLayerUpload`, `ecr:InitiateLayerUpload`, `ecr:PutImage`, and `ecr:UploadLayerPart` only on the five named FaroAI repositories. `BatchGetImage` lets deployment retries detect and reuse the existing commit-SHA image tag. Keep ECR tag immutability enabled and scan-on-push enabled; prefer ECR enhanced scanning for continuous rechecks.
- `s3:PutObject` to `arn:aws:s3:::<bucket>/faroai/releases/*`; no list/read/delete of unrelated objects. Enable Block Public Access, versioning, default encryption, TLS-only access and lifecycle expiration.
- `ssm:SendCommand` for the approved `AWS-RunShellScript` document and the exact staging instance; `ssm:GetCommandInvocation` for the command results. Do not grant interactive shell/session access unless separately justified.
- Required narrowly scoped KMS permissions only if customer-managed keys are selected. The workflow currently uses SSE-S3 for release objects.

AWS APIs may require `Resource: "*"` for selected list/token/status actions. Keep wildcard permissions only for those APIs that do not support resource scoping and document each exception in the IAM policy review.

### EC2 instance profile

- Attach an instance role limited to SSM managed-node connectivity, pull access to the five ECR repositories, and `s3:GetObject` for `faroai/releases/*`. Do not put AWS credentials on disk.
- Require SSM online status, supported Docker Engine/Compose plugin and AWS CLI v2, encrypted EBS volumes, security-group ingress restricted to the intended application access path, and no public database/vector-store ports. AWS-RunShellScript invokes the release bootstrap through `/bin/sh`; that bootstrap must stay POSIX-compatible. The checked-in `ec2-compose-deploy.sh` is invoked explicitly with Bash.
- `/opt/faroai/.env` is optional and is only for non-secret deployment overrides such as feature flags. The deployment script creates an empty root-owned `0600` file when it is absent. Never put credentials there; the runtime secret bundle is fetched from Secrets Manager and stored separately with root-only permissions.
- Before first deployment, confirm free disk space and staging-only DB/Qdrant/Redis volumes. Do not reuse production data.
- CI/CD uses SSM Run Command and does not require inbound SSH or application ports. The hosted Compose overlay runs Caddy as the public TLS ingress for `faroai.gis247.net`, obtains and renews its public certificate automatically, and proxies to the private `backoffice:3000` service. DNS must resolve to the EC2 public/Elastic IP, and inbound TCP `80`/`443` plus UDP `443` are required. Keep host port `3001` bound to loopback and closed to the internet. Local development does not load the hosted overlay.
- Ensure the instance has outbound HTTPS through a NAT/internet route or the required VPC endpoints for SSM, ECR and S3. The current Compose deployment also pulls PostgreSQL, Redis and Qdrant from their upstream registries, so either provide outbound registry access or mirror those images into private ECR.

## Release and operator procedure

1. Merge reviewed code to `dev` and wait for CI success.
2. In GitHub Actions, run **FaroAI CI/CD** from `dev` and set `deploy_staging=true`.
3. A staging environment reviewer inspects the commit and approves the deployment.
4. The workflow reuses any already-published immutable commit-SHA images, builds and publishes missing images, uploads the minimal checksummed source bundle, then invokes SSM on the configured staging instance.
5. Confirm the workflow's readiness result and inspect service health through the approved staging operations path. If it fails, inspect host/service status without copying `.env` or secrets into logs.
6. For a failed release after migrations, stop and assess migration compatibility. Do not restore/reset the database or perform an automatic code rollback without the separately reviewed recovery plan.

### First-time EC2 prerequisite: AWS CLI v2

The instance profile provides AWS permissions, but it does not install the AWS CLI executable. Before the first deployment, install AWS CLI v2 on the Ubuntu EC2 instance using Systems Manager Run Command (`AWS-RunShellScript`, targeting only the staging instance). Run as root:

```sh
set -eu
apt-get update
apt-get install -y curl
curl -fsSL https://awscli.amazonaws.com/v2/install.sh | bash -s -- --system
/usr/local/bin/aws --version
```

AWS documents this signed install script as its recommended Linux installation method. Do not add static AWS access keys to the instance; the installed CLI uses the EC2 instance profile. After the output shows `aws-cli/2...`, rerun **FaroAI CI/CD** from `dev` with `deploy_staging=true`. The workflow now checks for the CLI and reports this prerequisite explicitly if it is missing.

## Security and production gates

- The CI job has `contents: read` only. The deployment job has `contents: read` and `id-token: write`; deployment is isolated behind a protected environment.
- Actions are pinned to full commit SHAs. Checkout disables persisted credentials.
- Do not use untrusted pull-request content in a privileged `pull_request_target` job. This workflow does not use `pull_request_target`.
- Do not echo resolved Compose configuration or SSM stdout/stderr, because they can contain runtime-sensitive material.
- Review ECR scan findings and block deployment on critical/high findings through registry/release policy before production use. The current workflow does not itself parse ECR findings and is therefore not a vulnerability-free release gate.
- Production deployment remains disabled until database roles/least privilege, tenant isolation, Qdrant access, TLS/network boundaries, encrypted backups and restore drills, retention/deletion, image scan policy, monitoring and incident response in the current security review have passed and been approved.

## Validation performed for this change

Static workflow/shell/Compose configuration validation only. No AWS role, ECR repository, S3 bucket, GitHub environment, EC2 instance or runtime deployment was created or tested. The repository has no CI test suite wired into this workflow; add one as a separately reviewed pipeline enhancement.
