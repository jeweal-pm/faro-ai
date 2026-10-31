# Login readiness fix and cache rebuild

- Checked date before edits: 31-10-2026 (Asia/Bangkok).
- Root cause found in the local login path: Backoffice owns a separate lazy Redis client from the API health-check client. Its first rate-limit command could run before that client was connected.
- Added a concurrency-safe explicit Redis connection before the login rate-limit `INCR` in `gateway/src/admin.ts`. Login still fails closed if Redis is unavailable; rate limiting and credential validation are unchanged.
- Cleanup: Docker builder cache prune reclaimed 3.022 GB; dangling image cleanup reclaimed 62.28 MB, including the previous FAROAI API image. `npm cache clean` completed (npm cache measured at 0.34 GB before cleanup). `pnpm store prune` removed cached metadata and 0 packages; 1.02 GB of package content remains referenced. The execution policy blocked deleting the complete pnpm store directly. No Python `__pycache__` or `.pyc` files were found in the repository.
- Rebuilt and recreated only the `api` service. Docker image build and TypeScript compilation passed. New API container is healthy; `/health/ready` returned success and `/admin/v1/auth/config` returned successfully. Redis, PostgreSQL and Qdrant volumes were preserved.
- Host C: free space still reports about 1.07 GB after Docker cleanup; Docker Desktop may retain reclaimed blocks inside its virtual disk. A credentialed login was not attempted.
- Added reusable skill `.codex/skills/container-cache-rebuild/SKILL.md` for future stale-container/retry-only investigations and authorized targeted cache cleanup/rebuilds.
