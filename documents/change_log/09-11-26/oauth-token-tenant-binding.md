# OAuth token tenant binding

- Add the authenticated credential's tenant ID to successful `POST /v1/oauth/token` responses so the GIS backend can compare it with the configured Tenant ID.
- Preserve existing token fields, authentication checks, and no-store headers.
- No secret values are logged or added to the response.
