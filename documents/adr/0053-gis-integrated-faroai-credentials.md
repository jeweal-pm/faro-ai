# ADR-0053: GIS Integrated Applications entry for FaroAI

- **Status:** Accepted
- **Date:** 2026-11-09
- **Related:** [ADR-0052](0052-tenant-application-credentials-and-authenticated-discovery.md), [SPEC](../spec/gis-integrated-faroai-credentials.md)

## Context

GIS Settings → Integrated Applications lists shared application templates and edits tenant copies through a generic credentials form. That form returns `credentials_Keys` to the browser, which is unsuitable for FaroAI's one-time application secret. FaroAI tenant administrators issue an API Key (Client ID) and Secret Key (Client Secret) from `/tenant`; the pair is exchanged server-side for a short-lived bearer token. The Client ID alone cannot authenticate an integration.

## Decision

1. Show FaroAI as a dedicated entry in GIS Integrated Applications, without routing its secret through the generic application-key list/view/edit contract.
2. Configure API Key (Client ID) and Secret Key (Client Secret) for each GIS organization. Do not require the operator to enter Tenant ID: FaroAI determines the tenant from the credential and returns the authenticated Tenant ID during token exchange. GIS stores and displays that returned ID as read-only verification metadata.
3. Store the secret only on the GIS backend, encrypted with a dedicated deployment key. Read responses disclose only configuration metadata and whether a secret exists. A blank secret on an unchanged identity may preserve the stored secret; identity changes require a new secret.
4. GIS verifies the credentials by exchanging them at FaroAI's token endpoint. GIS accepts the returned authenticated tenant ID as the linked tenant and enables the connection only after successful verification. The FaroAI API base URL is set by the GIS deployment, not by a browser request.
5. Do not embed the secret or access token in GIS frontend code, logs, generic credential responses, or the MCP tool catalog. Keep GIS user permissions and FaroAI credential scopes independent.
6. This step configures and verifies the connection. Any GIS feature that calls FaroAI later must use a server-side token exchange and define its own consent, scope, request, and error contract.

## Consequences

- GIS operators enter the API Key and the Secret Key shown once in FaroAI `/tenant`; GIS discovers and displays the Tenant ID after successful verification.
- A deployment without a FaroAI base URL or encryption key cannot enable this integration.
- Existing GIS application integrations and FaroAI tenant login remain unchanged.
