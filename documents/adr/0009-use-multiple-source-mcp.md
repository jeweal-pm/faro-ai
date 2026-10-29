# ADR-0009: Manage tenant-scoped GIS, GMS, ERP and other MCP connections

- **Status:** Accepted
- **Date:** 2026-10-14
- **Deciders:** FaroAI product owner and implementation team
- **Related:** [ADR-0003](0003-use-tenant-id-for-design.md), [ADR-0005](0005-use-postgres-for-general-database.md), [ADR-0008](0008-use-phyton-for-service-worker.md), [ADR-0010](0010-platform-backoffice-and-deployment-modes.md), [Platform Backoffice SPEC](../spec/platform-backoffice.md), [AI FLOW](../diagram/flowchart/AI%20FLOW.drawio)
- **Live product result handling:** [ADR-0017](0017-live-mcp-product-search-results.md)

## Context

The AI FLOW identifies multiple business-system MCP servers. The initial integrations are GIS MCP, GMS MCP and ERP MCP; BOS and other MCP servers may also be needed. These endpoints and API keys belong to each tenant's business environment, so a single environment-level `MCP_CONNECTIONS_JSON` cannot safely or conveniently represent the hosted multi-tenant configuration. The current Backoffice only lists source metadata and cannot configure or test a tenant's MCP connection.

## Decision

- Backoffice provides a tenant-scoped connection card for GIS, GMS, ERP and a generic MCP integration. In single-tenant deployments the configured tenant is fixed. The generic option covers BOS and additional MCP servers without requiring a code release for each display name.
- Each connection stores an MCP Streamable HTTP endpoint URL, a Bearer API key, enabled state, discovered tools, and a separate administrator-approved tool allow-list. A connection is not available to chat until it passes a connection test and has at least one approved tool.
- The connection test performs the MCP initialization handshake and lists tools. Discovered tools are informational only; an administrator must explicitly select which tools Jev may route to. Tool execution remains subject to the stored allow-list.
- URL and API key are configured through the authenticated platform Backoffice. The API key is encrypted at rest with the existing AES-256-GCM configuration key, is never returned after saving, and can be rotated by entering a replacement. Responses expose only a masked hint and connection/test status.
- The gateway decrypts the credential only for trusted server-to-server MCP calls. Jev receives the integration label and approved tool names, never the endpoint URL, API key, or arbitrary tool arguments from the decision response.
- Connections are tenant-scoped in PostgreSQL. The API checks the tenant against deployment mode on every read and mutation; audit events record configuration changes and test results without URLs, credentials, or tool payloads.
- MCP endpoints require HTTPS and an exact hostname in deployment `MCP_ALLOWED_HOSTS`. HTTP is permitted for loopback development endpoints. The local Docker Compose overlay may additionally enable `MCP_ALLOW_DOCKER_HOST_HTTP` for the single fixed Docker host alias `host.docker.internal`; the default and hosted deployment value is false. Redirects are disabled. This is an explicit egress allow-list, not a user-editable control.
- Existing `MCP_CONNECTIONS_JSON` references remain supported for migration compatibility, but new Backoffice-managed connections use encrypted database records. Removal of the legacy environment path is a later migration.
- This decision covers live MCP connection setup and tool routing. Scheduled resource synchronization from GIS/GMS/ERP into Qdrant remains a separate workflow; an indexed source must not be shown as synced merely because its MCP connection test passed.

## Consequences

- Platform operators can manage each tenant's system endpoints and rotate credentials without editing deployment environment variables.
- Every tenant has isolated MCP endpoints and secrets; a global integration name does not grant access to another tenant's system.
- Connection health and tool discovery are visible in Backoffice, while execution is restricted to the administrator-approved tools.
- Deployment must configure the approved MCP hostname list. A remote host outside that list cannot be connected, even when a platform administrator enters it.
- GIS, GMS and ERP API-specific resource sync, custom authentication schemes, and non-Streamable-HTTP transports are not included until their contracts are documented.

## Security invariants

- No MCP API key is returned by list, detail, test, audit, or chat APIs.
- No tenant can read or mutate another tenant's connection, including in single-tenant deployment mode.
- Only explicitly approved discovered tools are presented to Jev and executable by the MCP client.
- Every outbound endpoint is HTTPS and hostname-allow-listed, except loopback development; redirects are rejected and requests have finite timeouts.
- Connection test and tool execution never log credentials, request headers, or tool arguments.

## Decision amendment (2026-10-14): API key header selection

An external GIS MCP endpoint used for local integration testing accepts the credential in `X-API-Key` and rejects `Authorization: Bearer`. MCP connection configuration therefore stores an `auth_method` alongside its encrypted key. Backoffice supports `Authorization: Bearer` and `X-API-Key`; new and existing connections default to Bearer for backward compatibility. The selected method applies to both the initialization/tool-list test and later tool calls. Header names and values remain server-side and are never returned or logged. Changing the endpoint or auth method clears discovered and approved tools and requires a fresh test and explicit tool approval.

The schema migration adds a non-secret `auth_method` column with a Bearer default. No credential rotation is required when changing header method.

## Review triggers

Revisit this ADR when GIS/GMS/ERP authentication or transport contracts are known to differ from Bearer-authenticated Streamable HTTP, when indexed resource sync is added, when the egress policy changes, or when a tenant-managed connector is introduced.

## Decision amendment (2026-10-25): outbound MCP access from the AI service

- The Python AI service performs approved MCP tool calls and external model inference. It must therefore join the deployment's non-internal `host_api` bridge in addition to the private `app` and `data` networks. The API and Backoffice already use this bridge for approved external requests.
- Keep PostgreSQL, Redis, and Qdrant on the private data network. Do not publish an AI-service port to the host. Preserve `read_only`, dropped capabilities, `no-new-privileges`, resource limits, and signed internal API requests.
- MCP egress remains restricted in application code to HTTPS endpoints whose exact hostname appears in `MCP_ALLOWED_HOSTS`; redirects, URL credentials, query strings, and fragments are rejected. The tenant connection must still be enabled, tested, and tool-approved before execution. This host allow-list is a FAROAI application control, not a Docker network-layer firewall.
- The deployment owner must include only intended MCP hosts in `MCP_ALLOWED_HOSTS`. Review this amendment if host-level egress enforcement is introduced or if the AI service is moved to a dedicated egress proxy.
