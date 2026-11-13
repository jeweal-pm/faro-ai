# Make host `.env` optional for staging deployment

**Date:** 2026-11-13 (Asia/Bangkok)

## Changes

- The EC2 deployment script creates an empty root-owned `/opt/faroai/.env` with mode `0600` when no overrides file exists.
- Compose defaults apply when the file is empty; runtime credentials continue to be read from AWS Secrets Manager into a separate protected file.
- Updated the CI/CD spec to distinguish optional non-secret overrides from required runtime secrets.

## Reason

The deployment previously stopped with `Host environment file is unavailable` even when the required runtime secrets were configured in Secrets Manager. A separate host file should only be necessary when an operator needs non-secret deployment overrides.
