# Tenant Application Credentials and Discovery Authentication

## Goals

- Make `/` require authentication before any tenant operation and bind all work to the signed-in tenant.
- Let a tenant's backend call FaroAI using tenant-scoped application credentials.
- Keep application secrets out of browsers, database plaintext, logs, and list APIs.

## Interactive discovery session

- `/` first requests the tenant session. Without one, it presents the existing tenant administrator sign-in flow.
- Sign-in uses the tenant email/password provisioned by the platform root. The gateway sets its existing HttpOnly session cookie and CSRF cookie.
- The tenant ID comes from that session. The UI may show tenant name and a sign-out action, but it cannot select or override tenant ID.
- Search and all actions launched from `/` require the tenant session on the server. Invalid/expired sessions return an authentication error and the UI returns to sign-in.
- Root `/admin` authentication and root-only debug context remain separate.

## Customer application credentials

- `/tenant` has a `FaroAI API access` section for creating and revoking client credentials.
- Create request: tenant session + CSRF, an operator-provided credential label, and a fixed least-privilege scope selection. The tenant ID is taken from the session.
- Create response returns `client_id` and `client_secret` exactly once. Read/list responses contain only ID, label, status, scopes, created time, and last-used time.
- Revoke marks the credential inactive and invalidates all access tokens minted from it.
- Token exchange uses `POST /v1/oauth/token` with `grant_type=client_credentials`, `client_id`, and `client_secret`; success returns a short-lived bearer token, token type, expiry, and granted scopes.
- The secret is stored as a keyed hash using `API_KEY_PEPPER`. Access tokens are random opaque bearer values stored hashed. Neither is logged or returned after initial issuance.
- Inactive tenants, revoked credentials, invalid scope requests, invalid deployment mode, and rate limits prevent token issuance.

## API authorization

- Application tokens are tenant-scoped and carry only the approved scopes associated with their credential.
- Existing `/v1/*` middleware validates both existing tenant API keys and expiring application access tokens. Expired or revoked tokens fail with 401. All operations still enforce endpoint scopes, tenant activation, consent and single-tenant deployment rules.
- `/tenant/v1/discovery/chat` accepts only the authenticated tenant session, validates CSRF/origin, and uses session-derived tenant context. It never accepts a tenant ID from the browser.
- Server actions forward the tenant session to session-authorized FaroAI endpoints; they must not use `FAROAI_DEMO_API_KEY` as a fallback.

## Audit and privacy

- Audit credential create/revoke and successful token issue, recording tenant, actor, credential ID, and correlation ID only.
- Mark credential and token responses `Cache-Control: no-store` and `Pragma: no-cache`.
- Customer applications must keep the secret in server-side configuration. If a secret is exposed, revoke it and create a replacement.

## Acceptance criteria

1. Anonymous access to `/` cannot invoke chat or any tenant operation; it displays sign-in.
2. Signing in as a tenant admin displays the matching tenant, and tenant ID is never accepted from client input for those actions.
3. Tenant A's session cannot read or mutate tenant B's MCP configuration or data.
4. A tenant admin can create credentials and see the secret once; subsequent list calls never return it.
5. A valid client credential can obtain an expiring bearer token; wrong, expired, revoked, inactive-tenant, and cross-tenant attempts fail.
6. Revoking a credential invalidates already issued bearer tokens.
7. Root admin and public homepage behavior remain separate; root admin has no implicit tenant impersonation.

## Rollout

Apply the additive PostgreSQL migration before deploying gateway code. Existing tenant administrator accounts continue to work. Existing static API keys remain valid for integrations that already use them. The homepage no longer uses the demo API key; configure an active tenant admin account to use it.
