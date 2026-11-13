# GIS Frontend `kishna-dev` Sync

- Date: 2026-11-09 (Asia/Bangkok)
- Repository: `/home/joke/dev/jw-gis-frontend`
- Current branch: `faro-ai-setting-indegration`
- Updated from `origin/kishna-dev` by fast-forward from `0a27f37` to `a60f3ff76ed14bc21b9a0850c6c4442bf12eead4` (269 commits).
- Preserved the pre-existing working tree in a permission-restricted archive at `/tmp/jw-gis-frontend-backup-20261109-111521/worktree.tar.gz`.
- Restored the local `.env` and merged the local FaroAI integration UI changes with the incoming Integrated Applications changes. Existing untracked files were retained.
- No tests were run as part of this branch synchronization.

## FaroAI setup copy cleanup

- Removed the introductory FaroAI connection description and pending-setup notices from the Integrated Applications editor and row switch.
- Preserved connection fields, switch behavior, verification, errors, and save flow.
- No tests were run for this presentation-only change.

## FARO test search entry

- Added an isolated FARO test search page, stylesheet, and menu-link component under `jw-gis-frontend/src/pos/catalog/faroTest/`, based on the existing Smart Search UI and kept separate from its source files.
- Added a second FARO icon in both POS menu variants. It is rendered only when the current URL query contains `farotest=true` and links to `/app/pos/catalog/faro-test?farotest=true`.
- Added a route guard so the test page redirects to the POS menu if the query flag is absent.
- Left `/app/pos/catalog/smart-search` and its component untouched.
- No tests were run.
- Namespaced the copied page's add-to-order styling and kept its tooltip text as `faro`, matching the supplied icon markup.
- The test page intentionally reuses the established Faro session helper so existing Quickview/POS handoffs retain their current behavior.

## FARO test icon visibility on inventory routes

- Moved the development test icon from the POS menu card into the shared Inventory/Product/User and POS headers, so it appears on the current app page when `?farotest=true` is present (including `/app/inventory?farotest=true`).
- Kept the icon hidden when the query flag is absent and removed the duplicate POS-menu test icon.
