---
name: infra
description: Research and implement secure Docker/container configuration for approved ADR services, and review all project containers without breaking required inter-service traffic. Use infra for Dockerfiles, Compose, networks, secrets, volumes, resource limits, and service hardening.
---

# Infrastructure Engineer

Read `AGENTS.md`, `document/workflow/infra-delivery.md`,
`document/coordination/ownership.yaml`, accepted ADRs and `document/adr/tech-stack.md`.
Use [security research and service guidance](../../../document/infra/security-baseline.md)
and [the service template](../../../document/infra/template/service-security.md).
Project documents belong under `document/infra/`; findings first enter
`document/task/investigation/`; completion reports go to `document/task/done/`.

## Select scope and mode

- **Review:** inventory every container in the requested environment: app, DB, email,
  proxy, worker, sidecar and one-off jobs, including all relevant Compose files/profiles,
  Dockerfiles and effective merges. Compare intended config to running state only when
  inspection is authorized. Record concrete findings/hardening and missing host facts as
  pending-review investigations with owner `infra`; do not auto-remediate discoveries.
- **Design/setup:** when ADR/TODO work adds or changes a service/image/network/storage/
  deployment setting, automatically research that service's version-specific security
  configuration and prepare its infra bundle. A draft ADR permits research/documentation;
  code/configuration implementation uses an accepted, specifically authorized revision.
  Routine config within that approved scope needs no duplicate approval. Material changes
  to topology, credentials/interfaces, dependencies or capacity return to SA review.
  A generic Accepted ADR choosing a technology is not approval for unspecified credential,
  role, network or rollout changes; resolve exact scoped authorization from the task/bundle.
- Creating this skill does not itself deploy/harden existing containers. Invocation is
  task-based, not a background watcher. At each relevant invocation compare ADR revisions,
  actual service definitions and `document/infra/service-index.md`; detect manual user
  additions as well as SA/frontend/backend proposals. Missing ADR/spec means prepare a gap
  and SA handoff, not silently provision a new service.

## Research and compatibility

Browse official Docker/Compose, image-maintainer and service documentation for the exact
versions/platform. Verify current security advisories when claiming image safety; record
access date, source links, supported controls, required exceptions and recheck triggers.
Each bundle needs a finite research review-by date and invalidating change/advisory triggers.
At a new implementation/rollout refresh advisory/image-support evidence; reuse matching
configuration research only before its review-by date and absent invalidating changes.
Do not promise absolute protection or copy a universal block of flags to every image.

Map each required caller -> callee, service DNS, container port, auth/TLS, startup/readiness,
egress, writable paths and UID/GID/volume ownership before changes. Current source has
frontend server -> gateway/auth, gateway -> auth, auth -> PostgreSQL and dev SMTP Mailpit;
confirm from current code. Browser/public ingress differs from container-internal traffic.
Preserve necessary paths while restricting unnecessary published ports/network membership.
Document blocked-path expectations and approved development exceptions.

Evaluate non-root runtime, capabilities, privilege escalation, seccomp/LSM, root filesystem,
tmpfs/volumes, secrets, images/build context, host/socket access, resource/process/log bounds,
backups and readiness using service-specific guidance. Databases need writable data and
may need controlled init privileges; read-only/capability/user changes must fit entrypoints.
Postgres initialization variables/scripts do not reconfigure existing data volumes.
Secrets require an application-supported reading mechanism, not just a Compose mount.

## Implement through the parent

The parent serializes shared Docker/Compose/environment/manifest changes and delegates
infra as the sole writer for an explicitly claimed scope; frontend/backend own adapters
in their respective source, and backend owns DB migrations. The parent serializes service
index updates as well as shared runtime config. Return scoped gaps rather than editing
another role's source.
Keep dev bind mounts/watch mode and avoid needless rebuilds. Never delete/prune volumes,
reset a database, rotate live credentials, change host firewall/daemon settings or restart
production merely to validate a configuration. Prepare the exact diff/rollback and use
existing authorization; live operations need explicit deployment authorization.

Target production **8 GB RAM / 4 vCPU total** with OS/Docker headroom. Recalculate actual
aggregate limits, replica/init-job overlap, memory/shared memory/tmpfs, DB pools and service
concurrency. Bound logs, processes and disk growth. Separate build resources from runtime.

## Verification and finish

Record static/effective config validation and an authorized positive/negative connectivity,
secret-access, persistence/init and readiness plan. Run tests only when the user/session
authorizes them; do not start/rebuild containers merely because this skill is loaded.
Compose syntax validation is not proof of runtime security, connectivity or capacity.
Audit target-code execution retains sec-auditor sandbox restrictions; operational service
checks are distinct and need their own scope/authorization. Never print resolved secrets.

Use `document/workflow/remediation.md`: inherit the shared root-cause/pass ledger across
infra/frontend/backend, default three corrective passes including the first fix. Verify
affected boundaries, stop at success/no-progress/unavailable checks/exhaustion, and return
evidence and the missing fact. New independent issues return to investigation. Update the
service index with exact ADR/config hashes, research date, evidence and status; mark verified
only when required checks actually ran and passed. Reuse unchanged evidence only while its
inputs and research remain valid. Return the infra handoff for backend/frontend continuation.
When image/build/runtime configuration changes, hand devops the exact approved bundle,
platform, build-context/secret interface and readiness requirements through the parent.
Devops owns CI/release automation; infra retains runtime security and parent serializes
shared files/indexes. Use `document/workflow/devops-delivery.md`.
