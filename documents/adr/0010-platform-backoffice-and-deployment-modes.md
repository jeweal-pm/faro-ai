# ADR-0010: FaroAI AI Experience, Platform Backoffice, Identity, Credits, and Deployment Modes

- **Status:** Accepted
- **Date:** 2026-10-13
- **Deciders:** FaroAI product owner (user) and implementation team
- **Superseded:** Manual tenant model grants and administrator-managed model allow-lists are superseded by [ADR-0016](0016-provider-specific-price-caps-and-automatic-model-selection.md). Provider connections still remain platform-managed and each tenant's runtime candidate rows remain tenant-scoped.
- **Scope:** Platform operations UI and APIs, deployment tenancy, identity, provider credentials, and tenant credit controls.

## Context

The accepted migration and technology-stack decisions call for a Next.js administration experience, platform-managed tenants, model/provider configuration, local LLM support, and tenant-scoped retrieval. The current implementation contains only a Hono API and Python service. It has no platform administrator identity, Backoffice, provider management UI, tenant credit ledger, or deployment tenancy switch. Its model settings are process-wide environment variables, and the provider adapters currently support OpenRouter and OpenAI-compatible Ollama/LM Studio endpoints only.

The deployment must serve both FaroAI-hosted multi-tenant installations and customer-local installations where tenant selection and external provider egress may be disabled. Tenant identity remains an internal authorization boundary in every mode.

The product also needs an AI discovery screen for asking questions and finding jewelry, separate from the operator Backoffice. The user supplied a visual reference showing a centered search/sparkle mark, an “Ask faro anything” heading, short helper text, and one rounded search bar with image, voice, and Discovery actions.

## Decisions

### Platform Backoffice boundary

- Add a Next.js App Router application for FaroAI platform operators. It manages tenants, request credits, provider connections, tenant model policies, MCP sources, embedding jobs, approved knowledge metadata, and a tenant-scoped retrieval playground.
- Hono remains the only authorization and data API boundary. The browser must not access PostgreSQL, Redis, Qdrant, Python, or provider endpoints directly. Next.js calls Hono server-side and never receives provider secrets or tenant server API keys.
- Backoffice APIs use a separate platform-admin session and authorization middleware. Tenant API keys do not authenticate platform administrators.
- The initial role is `platform_admin`; tenant users and self-service organization administration are out of scope. Every action that changes tenant state, credits, provider policy, or knowledge lifecycle is audited.

### AI discovery experience

- The Next.js application also provides a customer-facing AI discovery experience matching the supplied visual reference: a pale, spacious surface; centered gradient search/sparkle icon; “Ask faro anything” headline and helper copy; and a wide rounded search control with text, image, voice, and Discovery affordances.
- The AI discovery screen is deployment-configured and tenant-bound. It never accepts a tenant ID or API credential from the browser. In single-tenant mode it uses the deployment's configured tenant through server-side Hono calls. In multi-tenant mode the public page is disabled unless an operator explicitly configures one demo tenant; tenant switching remains restricted to authenticated Backoffice tools.
- Text search is the initial working input and uses the existing `/v1/chat` contract. The Discovery action opens supported product filters. Voice input uses browser speech recognition only when supported and permitted. Image search is visibly disabled until a server-side image-search contract and model are implemented; it must not pretend to process images.
- AI-improvement consent is off by default on this page. The page displays the required AI chat notice/consent before submission; its BFF is the trusted caller that sets the consent header. End-user browser requests cannot set tenant identity or consent headers directly.

### Deployment modes and tenant identity

- `FAROAI_TENANT_MODE=multi|single` is set at deployment. `multi` enables platform management and selection of multiple tenants. `single` restricts all APIs, jobs, and Backoffice views to the configured tenant and hides cross-tenant operations.
- `FAROAI_SINGLE_TENANT_ID` is required in `single` mode and must identify the sole active tenant. Startup fails closed if it is missing, invalid, or inconsistent. It is never accepted from a browser request.
- In `single` mode the API validates at startup that PostgreSQL contains exactly one active tenant and that it is the configured tenant.
- `tenant_id` remains mandatory in PostgreSQL, Redis, Qdrant, internal requests, and audit context in both modes. Single-tenant mode is not permission to remove tenant filters.
- `FAROAI_DEPLOYMENT_MODE=hosted|self_hosted` controls provider eligibility. `self_hosted` denies external provider connections by default; an explicit environment override is required to permit external egress.
- `FAROAI_LOCAL_LLM_ENABLED=true|false` controls whether Ollama/LM Studio connections and tenant policies can be enabled. It defaults to false. A customer-local deployment can enable it and configure the local endpoint/model through Backoffice.

### Platform administrator authentication

- Use generic OpenID Connect (OIDC) Authorization Code Flow with PKCE for SSO. Provider discovery, issuer, client ID/secret, exact callback URI, and an email allow-list are supplied by environment. Only verified identities in `BACKOFFICE_ADMIN_EMAILS` can enter the platform Backoffice; there is no self-registration or tenant-controlled identity mapping.
- `BACKOFFICE_OIDC_ENABLED=true|false` controls OIDC at deployment. With OIDC disabled, an environment-provisioned local break-glass administrator may authenticate using a pre-hashed password. Local login requires explicit `BACKOFFICE_LOCAL_AUTH_ENABLED=true`, an administrator email, an Argon2id password hash, and rate limiting. No default or source-controlled credentials are permitted.
- When Backoffice is enabled, startup must reject a configuration with no valid authentication mode. Turning off all login modes requires `BACKOFFICE_ENABLED=false`, which disables all Backoffice pages and admin APIs.
- Sessions are opaque, random, short-lived, server-side records. Persist only a hash of each session token. Cookies are `HttpOnly`, `Secure` in HTTPS deployments, `SameSite=Lax`, path `/`, and rotated on login. Mutations require CSRF/origin checks. OIDC state, nonce, issuer, signature, audience, expiry and PKCE verifier are validated.
- OIDC tokens are used only to establish FaroAI's local administrator session. Provider tokens are discarded after identity verification.

### Provider and secret configuration

- Platform operators register global provider connections and set their provider-specific price limits. FaroAI derives tenant-scoped eligible candidates automatically from current catalog prices. Per-request model selection follows [ADR-0016](0016-provider-specific-price-caps-and-automatic-model-selection.md): Jev selects only from the current eligible candidates, while the API enforces the price policy. Provider credentials are encrypted at rest using AES-256-GCM with a deployment-injected `FAROAI_CONFIG_ENCRYPTION_KEY`; database rows retain ciphertext, nonce, authentication tag, and key version. The key is never stored in PostgreSQL or returned to the browser.
- The UI never reads a stored secret back. It returns only configured status and a masked hint; updating a secret replaces it. Secret decryption is restricted to trusted server-side provider calls.
- Support OpenRouter and OpenAI-compatible local endpoints (Ollama and LM Studio) in this delivery. AWS Bedrock remains a tracked integration gap until a dedicated adapter and credential/region policy are accepted and implemented; provider configuration must not imply an unsupported provider works.
- External providers are blocked in `self_hosted` mode unless `FAROAI_ALLOW_EXTERNAL_PROVIDERS=true`. Local provider endpoints must pass scheme, host, DNS/IP and deployment allow-list checks to prevent SSRF and egress from becoming a tenant-controlled tunnel.
- Runtime candidate IDs and request policies are tenant-scoped. Configured global provider connections are available to tenants through automatically derived eligible candidates; administrators do not grant individual models. Jev selects per request from those candidates, while the gateway enforces connection-specific price limits.

### Credits and usage

- Credits are request units, not currency or a claim of provider token cost. A successful model-backed chat response consumes one credit regardless of provider/model. Deterministic fallback responses that do not use a model consume zero credits.
- The API atomically reserves a credit before model-backed work, preventing concurrent requests from overspending. It refunds the reservation on provider failure or a response that did not use a model. A tenant with no available credits may still receive deterministic fallback answers; model-backed work is not sent to a provider.
- Platform administrators grant or adjust credits through an append-only ledger with actor, reason, amount, correlation ID, and resulting balance. No payment processing, automatic billing, token-based pricing, or automatic credit expiry is included.
- Tenants created through either Backoffice or the provisioning CLI receive an initial zero-balance credit account.

### Knowledge, RAG, and learning boundary

- Backoffice knowledge management covers approved retrieval content, source health, indexing job state, collection/model metadata and retrieval inspection. All actions remain tenant-scoped and consent-aware.
- Embeddings and retrieval are not model training. Raw prompts, provider responses, and customer-derived content are not collected for shared training by default. Consent-gated RAG promotion and supervised fine-tuning follow [ADR-0012](0012-consented-model-improvement-and-training.md); shared training remains disabled unless the deployment and tenant/user consents allow it.

## Security and compatibility requirements

- Follow [RFC 9700](https://www.rfc-editor.org/rfc/rfc9700.html), [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0-errata2.html), and the [Next.js authentication guidance](https://nextjs.org/docs/app/guides/authentication). Do not use the OAuth Resource Owner Password Credentials grant, implicit flow, wildcard redirect URIs, or client-side provider secrets.
- Keep the admin API separate from tenant API-key scopes and enforce platform authorization on every endpoint, not only in the UI.
- Preserve the current Hono + PostgreSQL + Python + Redis + Qdrant boundaries. No ORM or new identity service is introduced.
- At the time of implementation, verify the supported OIDC library and Next.js version against official maintained documentation. Record versions and review triggers in the SPEC.

## Consequences

- FaroAI gains a deployable operations console for its hosted service and a constrained single-tenant console for local customer installations.
- Local deployments can use local inference without granting the UI a route to external providers or raw infrastructure secrets.
- Request-unit credits are easy to enforce consistently but do not reflect model-token cost; usage reporting must state this limitation.
- OIDC configuration is deployment-specific. Operators must configure the exact callback URI and verified administrator allow-list before enabling it.
- Bedrock integration, automated MCP synchronization, and fine-tuning execution remain visible gaps until their runners and deployment prerequisites are implemented.

## Alternatives considered

- **Use tenant API keys for the Backoffice:** rejected because those credentials identify client websites, not platform operators.
- **Store provider credentials in plaintext environment columns:** rejected because Backoffice-managed values must survive deployments without being exposed to browser code or database readers.
- **Treat one tenant as no tenant:** rejected because it weakens the common authorization contract and risks cross-customer leakage if deployment mode changes.
- **Use model tokens as credits:** deferred because providers differ in token accounting and the current adapters do not expose a consistent billing contract.
- **Claim embeddings are training:** rejected because retrieval and fine-tuning are distinct data processes with different consent and retention requirements.

## Implementation and review

The acceptance criteria and API/UI contract are in `documents/spec/platform-backoffice.md`. The existing ADR implementation audit is in `documents/spec/adr-implementation-audit.md`. Re-review this ADR when adding another provider, changing the credit unit, adding administrator roles, changing tenant mode, enabling image search, or introducing any training dataset.
