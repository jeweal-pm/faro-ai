# Staging secret preflight and CI cost control

- The manual staging workflow now checks EC2 AWS CLI, Python, Docker daemon, Compose, ECR pull authorization, and Secrets Manager access/schema before building or publishing images.
- Manual staging runs skip the duplicate local image build in the validation job. Pull requests and pushes to `dev` keep their build validation.
- The EC2 deploy script reports a safe failure code for Secrets Manager access, missing or malformed `SecretString`, unsupported key names, missing required keys, and invalid value types. Secret values are not printed.
- The required secret set now includes `QDRANT_READ_ONLY_API_KEY`, which the Qdrant Compose service requires.

Verification: workflow YAML parsed, generated SSM Python compiled, deployment Python compiled, `bash -n` and `git diff --check` passed. Live AWS access and staging deployment remain to be verified by a manual workflow run.

The first live preflight stopped before image publish with `DOCKER_MISSING` on the staging EC2 host. Added an explicit one-time `bootstrap_staging_host` workflow input and an Ubuntu-only Docker Engine/Compose bootstrap script based on Docker's official APT repository. It refuses conflicting container packages rather than replacing them automatically.

The next live preflight passed Docker and reached the secret schema check, which reported `SECRET_UNSUPPORTED_KEYS`. Preflight now lists only validated environment key names that are not accepted; it never logs their values. Invalid key names are replaced with a placeholder in diagnostics.

The live diagnosis showed the staging Secret contains application settings as well as credentials. Expanded the accepted key list to the known Compose settings, excluded obsolete `DECISION_*` and demo tenant keys from the generated runtime file, and made optional Compose profiles honor flags stored in the Secret. The Secret values remain confined to EC2 and are not logged.

After the secret preflight passed, the deployment SSM command failed without a stage name. Added a safe deployment stage marker in the EC2 script and a GitHub Actions failure summary that prints only that marker and exit code, never raw SSM stderr.

The marker was absent from the next SSM failure. Added a diagnostic-only workflow input that queries an existing SSM command and prints only its status, response code, allowlisted failure categories, and a validated stage marker. It skips Compose build and does not start a new deployment.

The first diagnostic classified the existing failure as unknown. Expanded its safe categories and added bounded, allowlisted stderr terms plus non-sensitive stage breadcrumbs; raw SSM output is still never printed.

The SSM output reached its 24 KB capture limit during verbose image pull progress, hiding the final error and stage marker. Compose pull and startup now use quiet progress options, and API readiness failure prints a safe stage marker explicitly.

The next SSM run reached service startup and failed due to an unhealthy dependency. The diagnostic job now extracts only FaroAI container names and health states from that output so the failing service can be identified without raw logs.

The quiet startup diagnosis identified `faroai-ai-service-1` as unhealthy. Added a diagnostic-only SSM health inspection that reports container state, healthcheck classification, startup log categories, and host capacity without exposing raw logs or environment variables.

The AI health probe isolated PostgreSQL: the service was healthy and DNS resolved, but libpq parsed the configured database URI host as something other than `postgres`. Staging now derives the application `DATABASE_URL` from its local Compose PostgreSQL endpoint and the existing `FAROAI_DB_PASSWORD`, percent-encoding reserved password characters. The runtime Secret remains the password source; no value is logged.

After the database fix, the AI service became healthy; the API container then failed Zod startup validation because its internal secret and API-key pepper were shorter than 32 characters. Added explicit length checks to both the preflight and EC2 deploy secret loader so future failures stop before image publishing. The owner updated both values in the existing staging Secret; a fresh deployment verifies them without logging values.

After the owner corrected both 32-character secrets, preflight passed and the AI service became healthy. The API still restarted because Backoffice is enabled without a complete OIDC or local admin login. Preflight and deploy now validate Backoffice login and the 32-byte config encryption key before publishing images, and accept the full OIDC setting names in the runtime Secret.

With Backoffice credentials set, staging API and AI service both passed health checks. Deployment stopped at the existing artifact-worker database-role verification because the restricted PostgreSQL login did not match the Secret. Added a staging-only role provisioner: it reads the worker URLs from the root-owned runtime Secret file, validates local PostgreSQL targets, creates or updates only the dedicated restricted worker logins, grants their migration-created NOLOGIN access groups, and pipes SQL directly to psql without logging credentials. The deploy script provisions before verifying the artifact role. Preflight validates enabled worker URLs before image build.

After the artifact worker URL was corrected, staging preflight and image publish passed, but database role provisioning failed. The generated SQL passed a local PostgreSQL transaction test. The EC2 deploy script now classifies PostgreSQL provisioning errors into fixed, secret-free codes while suppressing raw SQL and credentials. This enables the next deployment run to identify the exact cause safely.

The first classified provisioning run still failed, but GitHub Actions filtered out the new safe cause marker. Updated both deployment failure and diagnostic-only output filters to show only allowlisted, fixed worker-role cause codes. The diagnostic-only workflow can inspect the already-failed SSM command without publishing or deploying another image.

Safe diagnosis identified the actual EC2 failure: the release archive omitted `infra/deploy/provision-staging-worker-roles.py`, so Python could not open the script. Added the tracked provisioner to the explicit `git archive` path list and verified the path is present in an archive generated locally. No staging Secret changes are required for this failure.
