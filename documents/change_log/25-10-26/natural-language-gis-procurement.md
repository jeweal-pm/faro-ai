# Natural-language GIS procurement — 25-10-26

- Added the bilingual PO/receipt assistant and Discovery intent routing, using the requested procurement prompt.
- Gateway stores one-time, actor- and tenant-bound previews; only confirmed, revalidated operations can reach GIS mutation tools.
- Added ADR 0026 and the procurement workflow/security specification.
- Rechecked the live GIS MCP connection after the user reopened ngrok. `tools/list` exposed 17 tools; the PO and receipt tools required by the workflow are approved and callable.
- Rebuilt and restarted the AI service with the hosted provider-egress overlay. Its DNS/network connection to the API service was restored and verified after the rebuild.
- Jev selected the paid OpenRouter model `mistralai/ministral-8b-2512` for both live prompt tests. GIS product search returned zero matches for `ABC`; master data returned 3 suppliers, 4 locations, and 35 purchase vouchers.
- Thai and English prompts both received follow-up questions in the same language, listing only unresolved values and offering names/codes for ambiguous suppliers and locations. The tests left `pending_confirmation` empty; no product, PO, or receipt was created.
- Product search strips quantity/unit wording before querying GIS. PO prompts prefetch live supplier, location, and purchase-voucher masters so the model does not guess or omit required master checks.
- Fixed an ambiguity where the ordinary word `PO` could be mistaken for the active voucher named `PO`; it remains purchase-order intent, while the assistant selects a real voucher from live GIS data and discloses it for review.
- Updated the AI data policy: user-entered values override AI proposals; the assistant proposes omitted PO prices, quantities, and Bangkok-local dates, selects only from live GIS master records, and pauses at a clear confirmation preview. Receipt quantities still come from an approved GIS PO.
- Updated product drafts to show `(AI)` on Matatag and Description and reject duplicate generated SKU/Product ID values before GIS preview. Procurement preview UI now explains that generated values are proposals and can be corrected before confirmation.
- Updated ADR 0026, the procurement specification, the active AI system prompt, and its example prompt to match this policy.
- Backoffice `pnpm typecheck` passed. The image rebuild reached the Backoffice production TypeScript step but stopped responding; Docker Desktop Service then showed `Stopped`, and starting it was denied by Windows permissions. Runtime was not reloaded and no GIS product, PO, or receipt was written.
- Retried the deployment after Docker recovered: recreated AI service, API, and Backoffice containers using the completed images; AI service and API are healthy and Backoffice returns HTTP 200. Verified the deployed AI prompt and Python syntax inside the container. Removed three dangling FaroAI images (two AI service images and one Backoffice image); C: has about 6.57 GB free. Admin is still at sign-in, so no GIS records were written.
- Read-only GIS checks found multiple product SKUs (including variants), 3 suppliers, 4 locations, and 2 active purchase-order vouchers (`Shopify Purchase order`, `PO`). A 100-line PO is the GIS maximum; 100 products at 100 units each means 10,000 units.
- Defined the `(AI)` cleanup marker for deliberate test writes: product `Matatag` and `Description`, PO `note`, and receipt `note`. No test record has been written.
- AI service Python syntax check passed. Backoffice UI login could not be verified with the local credential file, so this live check used the actual gateway-to-AI assistant pipeline directly.
