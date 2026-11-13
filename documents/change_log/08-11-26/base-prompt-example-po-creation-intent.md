# Base prompt example: PO creation intent

- Fixed procurement intent detection so English `prepare`, `draft`, `place`, `submit`, and `generate`, plus Thai `เตรียม` and `สั่ง`, route PO preparation to `base.po-create` rather than read-only PO search. Voucher setup keeps its own higher-priority route.
- Added a regression test using the guide's English and Thai PO-preparation prompts. The test confirms they select the creation path and do not match read-only lookup.
- Rebuilt/reloaded `ai-service`; the targeted regression test passes.
- Replayed the English example with real GIS-backed supplier/location/voucher/product resolution. FaroAI returned a valid GIS preview and set `pending_confirmation=true` for `create_purchase_order`. The only GIS tool call was `preview_purchase_order` (`valid=true`); no PO was created or confirmed.

## Backoffice stale Server Action after rebuild

- Diagnosed `The configured GIS tenant could not be loaded.` from Backoffice logs. The actual exception was Next.js `Failed to find Server Action` for an action ID from a previous build; tenant/MCP configuration was not the cause.
- Added a unique Next.js `deploymentId` at build time (overridable with `NEXT_DEPLOYMENT_ID`) so the browser can detect deployment version skew and reload current assets.
- Official Next.js guidance describes `deploymentId` as the version-skew guard for stale assets and Server Functions: https://nextjs.org/docs/app/api-reference/config/next-config-js/deploymentId
