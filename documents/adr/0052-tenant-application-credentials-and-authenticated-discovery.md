# ADR-0052: Tenant Application Credentials and Authenticated Discovery

- **Status:** Accepted
- **Date:** 2026-11-08
- **Supersedes:** ADR-0050/ADR-0051 decisions that kept `/` public and independent of tenant login. Root debug tenant selection remains separate.

## Context

The discovery page at `/` currently calls FaroAI with a deployment-wide demo API key and tenant ID. Tenant administrators already authenticate at `/tenant` with a server-side session, while customer applications need a separate server-to-server credential. A browser must not contain a tenant API secret, and the caller must not choose a tenant ID in request data.

## Decision

1. Require an active tenant administrator session to use the standalone FaroAI discovery page. Resolve the tenant exclusively from the authenticated session. Keep platform-root authentication separate.
2. Use the same tenant session to authorize discovery, product creation, procurement, analysis, and document requests initiated from `/`. Server-side actions forward the session and CSRF context; they do not fall back to the deployment demo key.
3. Add tenant-managed application credentials to `/tenant`. Each credential has a public client ID and a one-time client secret. Store only a peppered secret hash. Exchange credentials through a client-credentials token endpoint for a short-lived FaroAI bearer token. Store only hashes of issued access tokens and bind their scopes and tenant to the credential.
4. Permit a tenant administrator to create, list metadata for, and revoke application credentials. Never return a secret from list/read operations. Apply least-privilege scopes, tenant status checks, deployment single-tenant restrictions, rate limiting, audit events, and no-store responses.
5. Customer applications keep their client secret on their backend and pass the short-lived bearer token to FaroAI. Browser clients must use their customer backend or an authenticated host-app integration; they must not contain the client secret.
6. Keep existing platform API keys and GIS/MCP credentials distinct. Do not use `FAROAI_DEMO_API_KEY` as the identity for the standalone discovery page after this change.

## Consequences

- `/` shows tenant sign-in when there is no valid tenant session and shows the authenticated tenant after sign-in.
- `/tenant` manages both MCP connections and application API credentials.
- Embedded integrations can use client credentials without sharing the tenant administrator's interactive password.
- Existing demo-key-only access to `/` is intentionally removed; tenants need a provisioned tenant administrator account.
- OAuth client credentials authenticate a customer application, not an end user. User-specific access and consent still need to be supplied by the customer's trusted backend when that use case is added.

## Security requirements

- Use cryptographically random client secrets and access tokens; compare secret hashes in constant time.
- Bound token lifetime, credential scopes, input sizes, and login/token issuance attempts.
- Revoke issued access tokens when their client credential is revoked.
- Audit create, revoke, token issuance, and tenant sign-in events without recording credentials.
- Enforce tenant isolation in server-side middleware for every tenant operation.
