# ADR-0020: Give the AI service restricted outbound connectivity

- **Status:** Accepted
- **Date:** 2026-10-14
- **Deciders:** FaroAI product owner and implementation team
- **Related:** [ADR-0009](0009-use-multiple-source-mcp.md), [ADR-0017](0017-live-mcp-product-search-results.md), [ADR-0019](0019-use-openrouter-typesafe-jev-decisions-api.md), [AI service egress SPEC](../spec/ai-service-restricted-egress.md)

## Context

The local Compose deployment places the AI service on internal-only `app` and `data` networks. The AI service owns live MCP calls and Jev Decisions API calls, so it must resolve and reach the configured external HTTPS endpoints. The hosted Compose overlay already attaches the AI service to an outbound bridge; the local development overlay did not. This prevented both live GIS search and configured Jev routing from reaching their providers.

## Decision

- Attach only `ai-service` to a dedicated Compose bridge named `provider_egress` in local and hosted deployments. Keep its existing `app` and `data` memberships; those networks remain internal. Do not publish an AI service port or attach databases, Qdrant, worker, gateway, or Backoffice to this egress bridge.
- Permit outbound MCP endpoints only when their HTTPS hostname exactly matches deployment `MCP_ALLOWED_HOSTS`. Keep redirects disabled, proxy environment variables ignored, endpoint credentials/query strings rejected, authentication headers server-side, and finite connect/read timeouts.
- Jev calls use only the fixed OpenRouter Decisions HTTPS URL and pinned model in service settings. The gateway supplies a decrypted API key only in its signed internal request after the provider is eligible under the configured policy.
- This bridge provides outbound routing, not a destination firewall. Application-level hostname validation is mandatory on every MCP operation. Host and perimeter egress controls remain responsible for stricter destination-level enforcement where required.
- Preserve Qdrant/Postgres/Redis volumes and the internal `data` network. Network changes must not trigger volume deletion or image rebuilds.

## Consequences

- Local product search and configured Jev decisions can resolve their external HTTPS services.
- The AI container retains access to internal databases only through the existing `data` network; the new bridge is attached only to the AI container.
- A compromised AI container could attempt other outbound destinations because Docker bridge networking alone cannot enforce an FQDN allow-list. The endpoint validation and deployment egress controls mitigate this; deployments requiring network-enforced FQDN policy must add an egress proxy/firewall before enabling untrusted endpoints.
- MCP credentials, user prompts, and tool outputs must not be logged. Live results remain request-scoped under ADR-0017.

## Review triggers

Revisit this ADR if the AI service no longer owns outbound MCP/Jev calls, if destination-level egress filtering is introduced, or if any additional service needs outbound access.
