# Supplier flow runtime rebuild

- Scope: rebuild the FAROAI Gateway, AI service, and Backoffice so the Supplier prompt flow added in `gis-supplier-prompt-flow.md` is loaded by the local app.
- Cleanup authorized by the user: FAROAI's old images after service replacement, host pnpm/npm caches, and Python bytecode caches under this project.
- Preserve all database, Qdrant, Redis, artifact, and other project data volumes; leave other project images and worker images untouched.
- Initial disk check (2026-10-30 Asia/Bangkok): 0.24 GB free. Final check: about 1.01 GB free.
- Cache cleanup:
  - `pnpm store prune` removed 5,487 files and 70 packages; a forced second prune removed no further packages. The store still contains about 1.017 GB of package content referenced by installations.
  - `npm cache clean --force` and `npm cache verify` emptied npm's content cache. A separate `_npx` cache remains (~0.338 GB); it is outside npm's content cache and was not removed.
  - No host pip cache or project Python bytecode was found. The AI image has pip caching disabled and no `/app` bytecode cache.
- Replaced only the old FAROAI API (`26610ad9bca2`), AI service (`99a2df4985b8`), and Backoffice (`b67cce083e9c`) images. New image IDs: API `f2ebd02703fa`, AI service `a89f70613e19`, Backoffice `118039eda038`.
- `docker compose build api ai-service backoffice` completed successfully, then those three services were restarted. Existing Postgres, Qdrant, Redis, and worker services/data were preserved; no volumes or unrelated images were removed.
- Runtime checks passed: API `/health/ready` returned HTTP 200, AI `/health/ready` returned HTTP 200 from inside its container, and Backoffice `http://127.0.0.1:3001/` returned HTTP 200. The served frontend bundle contains the Supplier MCP flow strings.
- No Supplier records were created or modified during this rebuild.
- Verification status: complete (build and runtime readiness checks passed).
