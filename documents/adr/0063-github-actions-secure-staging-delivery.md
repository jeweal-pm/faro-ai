# ADR-0063: GitHub Actions CI and secure staging delivery

- **Status:** Accepted
- **Date:** 2026-11-13
- **Scope:** FaroAI CI and staging release automation on AWS
- **Related:** [ADR-0010](0010-platform-backoffice-and-deployment-modes.md), [ADR-0056](0056-secure-business-document-intake.md), [ADR-0058](0058-natural-language-document-to-po.md), [ADR-0062](0062-faroai-authenticated-tenant-context-for-gis-mcp.md), [SPEC](../spec/github-actions-cicd.md)

## Context

FaroAI needs a repeatable GitHub Actions pipeline for reviewing changes and deploying a staging release to the AWS EC2 deployment described by the project deployment plan. The application has multiple images and optional Compose profiles. Runtime secrets are held on the host in its protected environment file, not in the repository.

The latest infrastructure review still lists production security blockers, especially around database theft and tenant isolation. A pipeline must not imply those controls are complete or enable unattended production deployment.

## Decision

1. Run Compose configuration validation and build all application images on pull requests and pushes to `dev`. CI receives no deployment credentials and does not start containers.
2. Permit staging release only through a manual `workflow_dispatch` on `dev`, with the `staging` GitHub Environment configured for branch restrictions and required human approval.
3. Use GitHub OIDC to assume a dedicated, short-lived AWS role. Do not store static AWS access keys in GitHub. Pin every GitHub Action to a full commit SHA.
4. Build and publish SHA-tagged images to private ECR repositories. Require ECR tag immutability and image scanning at the registry. Include SBOM and provenance attestations in Buildx output.
5. Transfer only the Compose files and required database initialization/migration/deploy scripts to a private S3 release prefix. The EC2 host downloads the archive with its instance role, verifies the SHA-256 checksum supplied by the workflow, and deploys via AWS Systems Manager Run Command. Do not expose SSH for deployments.
6. Keep all application secrets in `/opt/faroai/.env` on the host with root ownership and mode `0600`. The workflow never uploads or prints this file. No application secret is sent as an SSM parameter.
7. Deploy only to a dedicated staging environment and staging database. There is no production job. Production delivery remains prohibited until the production blockers in the current security review are resolved and separately approved.
8. Do not automatically roll back database migrations. Rollback requires a reviewed, migration-compatible application release or a separately approved database recovery procedure.

## Consequences

- Pull requests build application images without access to AWS credentials.
- A staging release requires repository/environment setup, a narrowly scoped IAM role, private ECR repositories, an S3 bucket, an SSM-managed EC2 instance, and explicit operator approval.
- Staging `docker compose up` follows the repository's migration dependency and can apply migrations to the configured staging database. The staging database must not contain production data.
- The workflow is not evidence that a release is secure or production-ready. ECR scan findings, staging verification, backup/restore tests and the outstanding DB-theft controls remain release gates.

## Alternatives considered

- **Long-lived AWS keys in GitHub secrets:** rejected because they create persistent credentials and increase the impact of a leak.
- **SSH deployment:** rejected because it needs an externally reachable SSH path and key lifecycle.
- **Automatic production deploy from `dev`:** rejected because production security review has open blockers and database migration rollback is not automatic.
- **Copy the entire working tree to EC2:** rejected because the runtime only needs Compose, migration, initialization and deploy files; a smaller bundle reduces accidental data exposure.

## Review triggers

Revisit when the AWS account, deployment topology, GitHub repository, image set, database migration model, or production security-gate status changes. Review the pinned action commits and image base versions for maintenance and advisories before broad rollout.
