# Staging Secrets Manager deployment wiring

- Updated the staging GitHub Actions deploy path to pass a validated, non-secret Secrets Manager ARN to the EC2 deployment script.
- Updated the EC2 deployment script to retrieve one JSON `SecretString` with its instance role, validate an explicit environment-key allow-list, and write a root-owned mode-0600 Compose env overlay without printing secret values.
- Compose now reads the secret overlay after the non-secret/runtime `.env`, so the secret values take precedence without storing them in GitHub Actions or the release archive.
- When the artifact profile is enabled, deployment performs a DB login preflight and verifies the worker identity, expected restricted-role membership, and absence of elevated PostgreSQL role attributes.
- Documented the staging secret format, required GitHub environment variable, EC2 IAM scope, and manual workflow-dispatch steps in `README.md`.
- Deployment remains blocked until the GitHub `staging` environment variable `STAGING_RUNTIME_SECRET_ARN` is configured and the EC2 role can read that exact secret. No secret values are recorded here.
- Verification/deployment status: pending configuration and an authorized staging workflow run.
