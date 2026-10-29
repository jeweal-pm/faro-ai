# Disk space cleanup

Date: 14-10-2026 (Asia/Bangkok)

- Cleared the reclaimable Docker build cache (1.718 GB) and removed the unused dangling FaroAI API image. Kept all containers and data volumes; images for other projects were left in place.
- Cleared Docker Scout's temporary layer files and cached SBOMs (about 469 MB).
- Removed unused Playwright Chromium browser downloads (about 697 MB). The Playwright package cache remains; the repo has no Playwright dependency. Microsoft Edge remains available for browser checks.
- C: had about 9 MB free before cleanup and about 1.15 GB free after clearing Windows-side caches; the final check showed about 338 MB free. Docker WSL virtual disk remains allocated; Docker internal cache was cleared without compacting or stopping the running stack.
- FaroAI discovery was tried in Edge using `I need a necklace`; it returned no verified match because the GIS MCP currently exposes backend status only and the local product catalog is empty. See `user-check/2026-10-14-discovery-necklace.md`.

