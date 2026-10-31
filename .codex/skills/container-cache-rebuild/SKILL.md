---
name: container-cache-rebuild
description: Diagnose FaroAI behavior that may come from stale containers or caches, then safely clean authorized caches and rebuild only affected services. Use for stale UI/API changes or retry-only startup failures when cache cleanup or rebuild is requested.
---

# FaroAI cache cleanup and targeted rebuild

Use this workflow when a FaroAI service appears to run stale code or a startup request fails once and succeeds on retry. Treat cache as a possible contributor, not the presumed root cause: inspect the relevant source path, container health, service logs and Redis/database readiness first.

## Before cleanup

- Check the current date and record work in `documents/change_log/dd-mm-yy/` before editing project files.
- Inspect Docker disk usage, free host space, Compose project/service names, current containers and the exact package-cache paths. Keep output free of environment secrets.
- Identify the smallest affected service and whether local development uses bind mounts or an image. Prefer rebuilding/restarting only that service.
- Remove Python `__pycache__` / `.pyc` only inside this repository. `npm cache clean` and `pnpm store prune` are the normal package-cache cleanup. Delete a complete pnpm store only when the user explicitly asks for a full store reset and its resolved path has been checked.

## Cleanup and rebuild

- Run cache deletion only when the user explicitly requested it for this task. A prior cleanup request does not authorize future cleanup.
- Prune Docker build cache only when requested or required to make space for the authorized build. Use dangling-image cleanup after the replacement image is active; remove only identified obsolete FaroAI images.
- Never run `docker system prune`, delete Docker volumes, reset databases, or remove images used by unrelated projects. Preserve PostgreSQL, Redis, Qdrant and artifact volumes.
- Build the affected Compose service, then recreate it with the same Compose files/profiles the project currently uses. Avoid `--no-cache` unless the user requests it or evidence shows the normal build reused stale build layers.
- If available disk is too low to finish safely, first clean only authorized rebuildable caches and recheck space; stop before risking data volumes or unrelated project images.

## Verify and report

- Confirm the new container is running and healthy, inspect recent service logs for startup errors, and call its existing readiness endpoint. Verify the replaced image is no longer retained when cleanup was requested.
- For login issues, never use or print credentials. Verify Redis readiness and auth route behavior from logs/code; ask the user to perform the credentialed login if no safe test account is available.
- Report the root cause evidence separately from cache effects, exactly what was removed, free-space change, build/reload result, readiness result and any check that could not be performed.
