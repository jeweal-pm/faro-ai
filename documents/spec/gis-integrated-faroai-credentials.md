# GIS Integrated Applications: FaroAI connection

## Operator flow

1. A tenant administrator creates application credentials under FaroAI `/tenant`, choosing the scopes needed for the eventual GIS feature.
2. In GIS Settings → Integrated Applications, open the FaroAI entry and enter API Key (Client ID) and Secret Key (Client Secret). Tenant ID is not an input.
3. Save and enable. GIS backend exchanges the credentials with FaroAI and uses the returned authenticated `tenant_id` as the linked Tenant ID. A failed exchange leaves the connection disabled and shows a safe error.
4. Subsequent reads show the discovered Tenant ID as read-only, Client ID, enabled state, verification time, and whether a secret is configured. They never return the secret. Replacing a secret requires entering a new value.

## GIS API and storage

- `POST /api/v1/App/applicationkey/faroai-config/view` with an empty body returns `{code:200,data:{tenant_id,client_id,enabled,has_secret,verified_at}}` for the authenticated GIS organization.
- `POST /api/v1/App/applicationkey/faroai-config/save` accepts `{client_id,client_secret?,enabled}`. A legacy `tenant_id` field may be ignored for compatibility; it is never trusted as tenant identity. The server validates bounds and formats, authorizes the GIS user, and writes only to that user's organization database.
- `client_secret` is write-only. Omitting it may reuse an existing secret only when the Client ID is unchanged. Changing Client ID requires the replacement secret; a new Tenant ID is recorded only after successful FaroAI verification. Never return encrypted fields or plaintext through generic application credential endpoints.
- The GIS deployment sets `GIS_FAROAI_API_BASE_URL` and a dedicated `GIS_FAROAI_CREDENTIAL_KEY`; the browser cannot choose an outbound host. Use an authenticated-encryption mode and fail closed if required deployment configuration is absent.
- The verification request is form encoded `grant_type=client_credentials`, `client_id`, and `client_secret` to `POST /v1/oauth/token`. FaroAI returns an expiring bearer token plus `tenant_id` derived from the credential. GIS compares `tenant_id` exactly, does not persist the verification token, and does not expose provider error bodies or credentials.
- Protect both GIS endpoints with existing GIS `verifyToken` authentication. The current Integrated Applications routes have no dedicated server-side permission category; a role-specific guard needs a permission-category rollout and backfill before it can be enforced without locking out existing users. Avoid logging secret fields or full request/response objects.

## FaroAI contract

- Successful `POST /v1/oauth/token` response adds `data.tenant_id` without changing existing token fields or no-store headers.
- Tenant identity comes from FaroAI's authenticated credential, never from GIS request data.
- GIS chat uses a short-lived bearer token server-side and requires the `chat:write` scope plus the end user's per-request chat-processing consent.
- GIS chat may optionally accept `ai_improve_consent` as a boolean. It defaults to false when omitted and is forwarded only as `x-faroai-ai-improve-consent` after GIS validates it. It authorizes tenant-scoped review-candidate creation only; it does not authorize training or automatic Qdrant indexing. See [ADR-0057](../adr/0057-optional-gis-chat-knowledge-consent.md).
- Keep all optional local/shared training consent headers false unless separate end-user controls and the applicable tenant/deployment authorization are implemented.
- For upstream HTTP 403 responses, GIS maps only known FaroAI error codes to safe, distinct messages; arbitrary upstream response bodies are not shown or logged.

## Acceptance checks

1. FaroAI entry appears in Integrated Applications for an authorized GIS user.
2. Valid credentials for the configured tenant can be saved and enabled.
3. Wrong secret, missing encryption configuration, or unreachable FaroAI leaves the connection unverified and reports a safe error. A successful verification records the Tenant ID returned by FaroAI.
4. Read and list responses never contain the Secret Key or an access token.
5. An unchanged Client ID can retain its secret on edit; changing Client ID requires a new secret.
