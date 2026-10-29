# AI live MCP search repair

Date: 14-10-26 (Asia/Bangkok)

## Changes

- Restored `ai-service/faroai/routing.py` to the current app contract after recovery had brought back an older image copy. The current module supports typed OpenRouter TypeSafe Jev Decisions, approved MCP source/tool routing, Bearer and `X-API-Key` authentication, and bounded MCP product parsing.
- Kept product discovery on the approved GIS `search_products` tool when there is one eligible source, including a deterministic fallback if Jev is unavailable or does not select that sole route. The original user prompt remains in the GIS query; validated Jev facets can add server-defined context such as recipient and clothing color.
- Added a dedicated `provider_egress` bridge to the local AI service Compose overlay. Internal `app` and `data` networks stay in place; only AI service receives external routing.
- Added ADR-0020 and the restricted-egress SPEC. The bridge is outbound routing, not an FQDN firewall; endpoint validation and deployment perimeter controls remain required.

## Verification

- Date checked before updates: 14-10-26 Asia/Bangkok.
- Compose configuration validates; local AI service is healthy and has outbound DNS/TLS to the configured GIS host. No Docker image was built, and named volumes were preserved.
- Fixed a Python MCP SDK integration mismatch: the installed Streamable HTTP client requires a caller-supplied `httpx.AsyncClient`; it does not accept the legacy `headers`/factory keyword arguments. MCP requests now pass the auth header through that client with redirects and proxy environment variables disabled.
- Sent both `ring` and `I need ring for my sexy girlfriend she dress in black` through the signed internal chat API. Both reached the AI service but returned zero products because the configured GIS server currently returns HTTP 404 for POST initialization at `/mcp`, `/`, and `/mcp/`.
- Direct HTTP check used the saved tenant endpoint and authentication without displaying the key. The current endpoint must expose the Streamable HTTP MCP route before the two searches can return GIS records.
- No image build or volume deletion is needed for these source and network updates.

## Live frontend verification — 14-10-26

- Checked the enabled `faro-local-test` OpenRouter connection in Backoffice storage and aligned its caps to the operator's stated values: `$0.05 / 1M input tokens` and `$0.20 / 1M output tokens`.
- Submitted `ring` and `I need ring for my sexy girlfriend she dress in black` through the real Discovery page at `http://127.0.0.1:3001/`. Both calls reached `https://openrouter.ai/api/alpha/decisions` and returned HTTP 200; each matching gateway model-credit reservation settled, confirming a successful Jev decision.
- Both searches showed `Showing (0)`. The following GIS MCP initialization request returned HTTP 404, so this is a source endpoint failure after Jev routing, not a failure to invoke Jev.
- OpenRouter's key-usage endpoint could not be queried from the gateway container because its egress is restricted. The successful Decisions responses and settled reservations provide request evidence; OpenRouter may still display `$0.00` because the tiny per-call cost rounds below one cent.
