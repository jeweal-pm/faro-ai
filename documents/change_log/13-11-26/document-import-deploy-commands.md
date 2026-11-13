# Change log — 13-11-26

- Expanded `documents/product/discovery/2026-11-12-document-po-import-implementation-plan.html` with exact Docker Compose files and copyable Linux commands for first deployment, migration/readiness checks, worker credential provisioning, enabling the document-import worker, normal reboot/startup, local development, logs, and safe stop/rollback.
- Clarified that EC2 uses `docker-compose.yml` only; `docker-compose.local.yml` is a development override and must not be used for EC2 deployment.
- Documented that Compose applies migrations through the configured service dependencies, and that `document-import` is an opt-in profile; the worker has no published port. Included a reminder that Docker restart policies recover previously started containers after host reboot, while `compose up` is needed after a manual stop or `compose down`.
- No application code, Compose configuration, secrets, database, container, or cloud infrastructure was changed.
