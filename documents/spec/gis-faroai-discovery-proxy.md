# SPEC: FAROAI discovery from GIS

- **Status:** In implementation
- **Date:** 2026-11-09
- **Decision:** [ADR-0054](../adr/0054-gis-faroai-discovery-proxy.md)
- **Related:** [GIS FaroAI credentials](gis-integrated-faroai-credentials.md), [Tenant application credentials](tenant-app-credentials-and-discovery-auth.md), [Live MCP product search](live-mcp-product-search.md)

## User flow

1. A signed-in GIS user opens the isolated FARO test route. It does not render inside the POS route and does not call the existing GIS SMART SEARCH endpoint.
2. The page shows the FaroAI discovery layout with the established GIS FARO accent treatment. Prompt categories can populate or refine the prompt; they do not authorize a request on their own.
3. Before sending, the user checks an explicit notice that FaroAI will process the prompt to provide a response. The notice is required for each request and is not saved as training consent.
4. The user may optionally attach one JPEG, PNG, or WebP reference image up to 1.5 MB, or dictate the prompt using browser speech recognition. The selected image is held only in page memory for that search and is cleared after navigation/reload.
5. The page sends the prompt, selected preferences, and optional image to the authenticated GIS backend proxy. The browser sends no FaroAI credential, bearer token, tenant ID, or external URL.
6. The proxy uses the GIS organization attached to the authenticated GIS session, loads its enabled and verified FaroAI connection, obtains a short-lived `chat:write` token on the server, verifies its tenant ID, and requests FaroAI discovery.
7. The page renders the returned answer and normalized product cards. Product facts, links, image URLs, and attribution are limited to validated response fields. Search results are request-scoped.

## GIS proxy contract

The dedicated authenticated GIS endpoint is:

```http
POST /api/v1/App/applicationkey/faroai-chat
Authorization: <GIS user token>
Content-Type: application/json
```

Request:

```json
{
  "message": "Find a yellow-gold necklace with a small emerald.",
  "state": {
    "discovery_query": "Find a necklace for an anniversary",
    "selected_facets": { "Jewelry Type": "Necklace", "Metal": "Yellow gold" }
  },
  "image_base64": "<optional base64 image data>",
  "image_media_type": "image/jpeg",
  "ai_chat_consent": true
}
```

- `message` is required, trimmed, and limited to 500 characters.
- `state` is optional and strictly bounded by the GIS proxy. It contains the original catalog query and selected display/search preferences only; tenant identity and connection configuration never come from it. Keeping `discovery_query` separate prevents generated chip text from becoming literal product-search terms.
- `image_base64` and `image_media_type` are optional and must be supplied together. Supported media types are JPEG, PNG, and WebP; decoded size is at most 1.5 MB and the complete request body is at most 2.1 MB.
- `ai_chat_consent` must be exactly `true`. Missing or false consent is rejected before FaroAI is called.
- The initial GIS experience sends no conversation history. Voice input is transcribed in the browser and is sent as ordinary prompt text.

Success uses the existing GIS response envelope and includes only the bounded FaroAI discovery result:

```json
{
  "code": 200,
  "data": {
    "answer": "...",
    "products": [],
    "sources": [],
    "search": {}
  }
}
```

The proxy must not return tokens, client credentials, encrypted fields, upstream headers, or raw upstream error bodies. Safe failures distinguish a disabled/unconfigured GIS connection, expired GIS authentication, missing `chat:write` scope, FaroAI unavailability, and an invalid upstream response without exposing secrets.

## Server-side authorization and token handling

- Authenticate using the normal GIS user token and resolve the organization using existing GIS request context.
- Load only that organization's `tbl_faroai_integration` record. Require enabled state, a verified tenant ID, a client ID, an encrypted secret, and valid deployment encryption/API URL configuration.
- Request the `chat:write` scope from FaroAI `/v1/oauth/token` using `client_credentials`. Verify the returned `tenant_id` exactly matches the linked tenant ID.
- Keep access tokens only in server memory for reuse until near expiry; never store them in MongoDB, Redis, browser storage, logs, or responses. Discard cached tokens when the integration is changed, and invalidate/retry once on an upstream unauthorized response if within token-issuance limits.
- Use only the deployment-configured FAROAI origin, HTTPS except explicitly configured loopback development, no redirects, finite timeouts, and bounded request/response sizes. Validate image base64, MIME type, pairing, and decoded length before forwarding.
- Call FaroAI `/v1/chat` with the bearer token and `x-faroai-ai-chat-consent: true`. Explicitly send knowledge-improvement and both training consent headers as `false`.
- The proxy never accepts `tenant_id`, base URL, client ID, client secret, or bearer token from the browser.

## Consent and learning boundary

- User chat consent authorizes processing of the prompt for the requested answer only.
- Knowledge improvement, local training, and shared training remain off for this integration, regardless of client-supplied fields.
- Product search results and model answers are not automatically embedded into Qdrant, saved as tenant knowledge, added to a learning candidate, or included in a fine-tuning export.
- Future consent persistence, conversation history, ordering, and learning require a separate design and authorization contract.

## UI scope

- Keep the route component and stylesheet within `jw-gis-frontend/src/pos/catalog/faroTest/`.
- Preserve the copied layout as a separate component and scope CSS to the FARO test page. Do not modify `SmartCatalogSearch.js` or `SmartCatalogSearch.scss`.
- Support prompt entry, browser voice transcription, optional reference-image selection, consent, loading, safe error, answer, and validated product cards. Keep prompt suggestions and facets separate from GIS product records.
- Do not add POS/cart writes or make the FARO test route redirect to `/app/pos`.

## Acceptance criteria

- [ ] A GIS user can submit a prompt only after checking the AI-processing consent notice.
- [ ] The GIS browser never receives FaroAI client secrets, OAuth tokens, or tenant identifiers from request input.
- [ ] The backend rejects disabled/unverified connections, missing consent, missing scope, and tenant mismatches without calling or rendering unverified product data.
- [ ] FaroAI receives `chat:write` authorization and explicit AI-chat consent; improvement/training headers remain false.
- [ ] The isolated FARO page renders the answer and bounded validated product cards and stays out of POS routes.
- [ ] Existing GIS SMART SEARCH component and styles remain unchanged.
