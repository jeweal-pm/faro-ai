# SSM deployment shell and AWS CLI prerequisite

**Date:** 2026-11-13 (Asia/Bangkok)

## Changes

- Made the SSM `AWS-RunShellScript` bootstrap POSIX `/bin/sh` compatible: replaced Bash-only `[[ ... ]]`, `pipefail`, and `EXIT` trap syntax.
- Added a clear AWS CLI missing prerequisite check before the EC2 host downloads its private S3 release bundle.
- Documented one-time AWS CLI v2 installation through Systems Manager Run Command, using the EC2 instance profile rather than static access keys.

## Cause

SSM submitted the bootstrap to `/bin/sh`, where `[[` is not a supported test expression. After that, the host reported `aws: not found` because AWS CLI was not installed. The deployment job's GitHub OIDC credentials are not available on the EC2 host; the host needs its own AWS CLI binary to use its instance profile for S3 and ECR operations.

## Operator action

Install AWS CLI v2 on the staging EC2 instance through SSM Run Command as documented in [the CI/CD deployment spec](../../spec/github-actions-cicd.md#first-time-ec2-prerequisite-aws-cli-v2), verify `/usr/local/bin/aws --version`, then rerun the staging workflow from `dev`.
