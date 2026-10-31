# GIS Store and Voucher setup — 30-10-26

- Added a platform-admin-only Gateway → AI service → GIS MCP path for Location and Voucher Type setup; prompt tenant keys cannot invoke it.
- Added read-before-create checks, GIS Tax/ID validation, separate confirmation flags, per-write audit events, and sequential Location-then-Voucher behavior.
- Added the Backoffice GIS Store setup panel with Central World test defaults and duplicate blocking.
- Configured the local Backoffice dev script to use Next.js Webpack after Turbopack failed to resolve the existing pnpm symlinks on Windows; no packages or images were added.
- Added [ADR-0038](../../adr/0038-gis-store-and-voucher-setup.md) and [spec](../../spec/gis-store-voucher-setup.md).
- Verified the new setup route with Gateway/Backoffice TypeScript checks and Python syntax validation; the user approved the exact test configuration before any write.
- GIS MCP created Location `Central World` / `CTW` (`6ae45335176b5da84aae1eb4`) and POS Voucher `Central World POS Receipt` / `CTW-POS` (`6ae45337176b5da84aae1ec0`); read-back confirmed one of each and the existing Tax record.
- Reloaded Backoffice source in local dev mode using Webpack; no container image was rebuilt, and no product, PO, inventory, Tax, extra zone, or cash register was created by FaroAI.
- Read-back panel shows the Location, Voucher Type, and Tax IDs; duplicate notice uses a neutral status message after records exist.

## Removal — 2026-10-30

- Removed the GIS Store setup panel from Admin and removed the dedicated Gateway `/location-setup/tool` and AI-service `/internal/v1/location-setup/*` adapters at the user's request.
- Restored the existing Product Master MCP schema allow-list; retained general GIS MCP connection management and Product Master workflows.
- Marked [ADR-0038](../../adr/0038-gis-store-and-voucher-setup.md) withdrawn and the [spec](../../spec/gis-store-voucher-setup.md) as historical. The previously created Central World GIS records and MCP permissions were left intact.
