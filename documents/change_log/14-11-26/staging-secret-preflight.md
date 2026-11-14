# Staging secret preflight and CI cost control

- The manual staging workflow now checks EC2 AWS CLI, Python, Docker daemon, Compose, ECR pull authorization, and Secrets Manager access/schema before building or publishing images.
- Manual staging runs skip the duplicate local image build in the validation job. Pull requests and pushes to `dev` keep their build validation.
- The EC2 deploy script reports a safe failure code for Secrets Manager access, missing or malformed `SecretString`, unsupported key names, missing required keys, and invalid value types. Secret values are not printed.
- The required secret set now includes `QDRANT_READ_ONLY_API_KEY`, which the Qdrant Compose service requires.

Verification: workflow YAML parsed, generated SSM Python compiled, deployment Python compiled, `bash -n` and `git diff --check` passed. Live AWS access and staging deployment remain to be verified by a manual workflow run.

The first live preflight stopped before image publish with `DOCKER_MISSING` on the staging EC2 host. Added an explicit one-time `bootstrap_staging_host` workflow input and an Ubuntu-only Docker Engine/Compose bootstrap script based on Docker's official APT repository. It refuses conflicting container packages rather than replacing them automatically.
