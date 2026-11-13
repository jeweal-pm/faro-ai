# ADR-0054: Use the GIS backend as the FAROAI discovery proxy

- **Status:** Accepted
- **Date:** 2026-11-09
- **Related:** [ADR-0052](0052-tenant-application-credentials-and-authenticated-discovery.md), [ADR-0053](0053-gis-integrated-faroai-credentials.md), [ADR-0017](0017-live-mcp-product-search-results.md), [SPEC](../spec/gis-faroai-discovery-proxy.md)

## Context

GIS now stores an organization's FaroAI client ID and encrypted client secret and verifies them with FaroAI. That configuration alone does not provide a safe browser path for discovery. FaroAI application credentials are server-to-server credentials; the browser must not receive the secret or the short-lived bearer token. The FaroAI discovery endpoint also requires explicit end-user AI-processing consent and returns tenant-scoped, validated product results.

The GIS FARO test route is an isolated UI entry. It must use the configured FaroAI connection without entering the legacy POS search flow or changing the existing SMART SEARCH implementation.

## Decision

1. Route GIS FARO discovery requests through a dedicated authenticated GIS backend endpoint. The GIS backend resolves the organization from the GIS user's authenticated request and loads only that organization's enabled, verified FaroAI integration.
2. The GIS backend decrypts the client secret, obtains or reuses a short-lived OAuth token requesting only `chat:write`, verifies the token's returned tenant ID against the verified linked tenant, and calls the configured FaroAI deployment. The browser cannot provide a tenant ID, FaroAI URL, client secret, or bearer token.
3. Require the user to explicitly agree to FaroAI processing the submitted prompt before each discovery request. Send only the AI-chat consent signal. Knowledge-improvement, local-training, and shared-training consent remain false; this search feature does not opt a user into learning or training.
4. Bound and validate requests and response fields at both GIS and FaroAI boundaries. Render only the normalized answer, product fields, and safe source metadata FaroAI returns. Do not treat a model-generated statement as verified product data.
5. Keep request results in the current browser session only. Do not add a GIS catalog write, POS/cart action, Qdrant indexing, knowledge capture, or training capture to this flow.
6. Keep the FARO page component and styles isolated from GIS `SmartCatalogSearch`. Its search layout follows the FaroAI discovery experience while its accent treatment follows the established GIS FARO search palette.

## Consequences

- Existing GIS FaroAI credentials become usable for discovery without exposing credentials to the GIS browser.
- A failed, disabled, unverified, out-of-scope, or tenant-mismatched integration fails closed with a safe user-facing message.
- GIS users must consent to AI processing for each submitted prompt. This consent is distinct from optional knowledge and training consent.
- GIS frontend and backend need a matching, bounded request/response contract. The FARO page remains separate from SMART SEARCH and POS navigation.

## Alternatives considered

- **Call FaroAI directly from the browser with client credentials:** rejected because it exposes a long-lived secret and bearer tokens.
- **Embed the FaroAI homepage in an iframe:** rejected because the homepage uses FaroAI tenant-session authentication, while GIS integration uses server-to-server credentials and has a separate GIS user session.
- **Reuse GIS SMART SEARCH's catalog API:** rejected because it calls GIS catalog search directly and bypasses FaroAI orchestration, tenant routing, and AI consent.

## Review triggers

Revisit this decision if GIS gains SSO to FaroAI tenant sessions, an end-user consent record is introduced, or the integration adds product selection, ordering, or learning workflows.
