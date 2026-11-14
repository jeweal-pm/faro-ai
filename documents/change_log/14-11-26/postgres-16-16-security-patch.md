# PostgreSQL 16.16 security patch

- Pinned the PostgreSQL database, migration, and document-import volume-init images in `docker-compose.yml` from the floating `postgres:16-alpine` tag to `postgres:16.16-alpine`.
- This is a same-major PostgreSQL minor update from the locally running 16.15 image; application source, schema migrations, and volume mappings are unchanged.
- Verified the `postgres:16.16-alpine` tag resolves in the container registry. PostgreSQL 16.16 release notes say 16.x users do not need dump/restore, but call out specific index families that may need `REINDEX`; review the live database indexes and backup policy as part of rollout.
- The staging release must run on `dev` and complete API/DB readiness before calling the patch deployed. Preserve the existing PostgreSQL volume.
