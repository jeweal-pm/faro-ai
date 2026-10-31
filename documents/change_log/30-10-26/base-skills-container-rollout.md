# Base Skills container rollout — 30-10-26

- Started the requested container update and readiness checks. Existing business data is to be reused; no product, PO or inventory records will be created for testing.
- Artifact-worker infrastructure has separate credential, volume ownership and Redis ACL prerequisites; verify these before enabling it. The current live containers are the previous release.
- Built and deployed Backoffice, verified `/` and `/admin/skills` in the existing browser, and removed the superseded Backoffice image after confirming no container referenced it. Updated API, AI service and embedding worker using the local Compose source/dist mounts to avoid rebuilding or downloading the embedding model. API and AI health checks passed.
- The live catalog shows release `2026.10.29.1`: three read workflows available and eight planned. Verified their instruction bodies load in the running AI container. No live model or GIS business write was made, and migrations 016/017 were not run.
- Built the artifact-worker image and tested four file formats plus input/path/authorization constraints in a temporary, network-isolated container. The private volume was found writable by worker UID 10002 and traversable by the API group. These checks do not prove job, database, Redis ACL, Thai visual layout or download behavior end to end; artifacts remain disabled.
- Last measured host free disk was approximately 1.9 GB. No Docker volume or shared build cache was pruned. Runtime image `faroai-artifact-worker:latest` is new, so it has no superseded worker image to remove.
