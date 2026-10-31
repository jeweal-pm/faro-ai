# Login first-attempt Redis readiness

- Checked date before editing: 31-10-2026 (Asia/Bangkok).
- Local Backoffice login could return `Login is temporarily unavailable.` because its Redis client is a separate lazy connection from the API health-check client. The first rate-limit command could run before the Backoffice Redis client reached `ready`.
- Added a concurrency-safe initial Redis connection before the login rate-limit `INCR`. Login remains fail-closed if Redis is unavailable; rate limiting and credential checks are unchanged.
- Verification: `pnpm --dir gateway typecheck` passed. Runtime login was not attempted because it requires credentials. The running API container has not been rebuilt/reloaded; only 1.08 GB remains free, so avoided a Docker build that could consume the remaining space.
