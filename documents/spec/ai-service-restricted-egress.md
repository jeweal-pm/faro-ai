# SPEC: Restricted egress for the AI service

- **Status:** Implemented; live GIS verification is blocked by the configured MCP endpoint returning HTTP 404
- **Date:** 2026-10-14
- **Decision:** [ADR-0020](../adr/0020-ai-service-restricted-egress.md)
- **Related:** [Live MCP product search](live-mcp-product-search.md), [OpenRouter Jev discovery routing](openrouter-jev-discovery-routing.md)

## Compose topology

- The AI service joins internal `app`, internal `data`, and the dedicated outbound `provider_egress` bridge.
- Only the AI service joins `provider_egress`; no port is published for the AI service.
- API and Backoffice retain their existing `host_api` network membership. Worker, Postgres, Redis, and Qdrant stay on their current networks.
- Local development and hosted overlays both provide this network. Recreating the AI container to apply a network change must preserve named volumes and does not require an image build.

## Outbound request controls

- MCP endpoint hostnames must exactly match deployment `MCP_ALLOWED_HOSTS`, except loopback HTTP used for development.
- Remote MCP endpoints require HTTPS. Redirects and implicit proxy environment variables are disabled. URLs with userinfo, query parameters, or fragments are rejected.
- Supported MCP auth methods are Bearer and `X-API-Key`; credentials are never included in Jev state, user-facing responses, or logs.
- Tool names and source IDs must match the current tenant connection's approved allow-list. Tool input remains server-generated as `{query, language}`.
- Jev uses only the fixed `settings.decision_api_url` and `settings.decision_model`; its API key is passed in the signed gateway-to-AI request and never persisted by the AI service.
- All external calls have finite timeouts and do not follow redirects.

## Search routing and result handling

- With an eligible Jev credential, send typed intent, approved MCP route, paid generation candidate, and bounded product-preference choices to the Decisions API. Resolve every returned choice against the submitted criteria and source/model allow-lists.
- Without an eligible Jev credential, a product-discovery query uses `search_products` only when exactly one tenant source approved that tool. Keep the original prompt in the GIS query; validated Jev choices may append server-defined preference phrases.
- Normalize MCP product records using `mcp_products.py`; invalid or unrecognized envelopes yield no cards. Live products are not cached or written to Qdrant, catalog tables, or training data.

## Acceptance criteria

- [x] Local Compose grants outbound routing only to `ai-service` while retaining the internal app/data networks.
- [x] MCP tool execution and connection tests use the configured authentication method and current tool allow-list.
- [x] Jev uses the typed Decisions API contract, not chat completions.
- [x] The AI service resolves the configured GIS hostname and can make outbound HTTPS requests.
- [ ] The configured GIS endpoint accepts Streamable HTTP. Current `/mcp`, `/`, and `/mcp/` initialization requests all return HTTP 404; therefore live product records cannot yet be verified through chat.
