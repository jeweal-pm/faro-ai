# Provider model discovery and pricing

Date: 14-10-26

- Added ADR-0015 and a SPEC for syncing provider model IDs and managing platform access plus verified token/image pricing on the Providers page.
- Removed the need to type model IDs during connection setup; providers expose catalog data only after an authenticated server-side sync.
- Kept tenant model assignment on the Jev routing page. Catalog sync does not grant tenant access or send unapproved models to Jev.
- Added migration 007 for provider-scoped discovered model catalog state and a backfill of existing configured models.
- Provider discovery uses provider-specific model-list APIs, saved encrypted credentials, endpoint validation, bounded requests, and no redirects. Rates remain manually verified per ADR-0013/0014.
- Added server-side discovery routes for OpenRouter, Ollama, and LM Studio, a provider-scoped catalog migration, model-access controls, and provider-page token/image pricing rows.
- Prices remain manually verified; discovery does not grant tenant access. Legacy configured models remain usable until their first successful provider sync.
- Gateway and Backoffice TypeScript checks passed; Backoffice build completed.
- Applied migration 007 to PostgreSQL and verified the migration stamp.
- Rebuilt and deployed API and Backoffice containers. `/admin/providers` and `/api/admin/auth/config` both return HTTP 200; API container is healthy on `127.0.0.1:3000`.
- Investigated the reported discovery failure: Docker's `host_api` bridge had IP masquerading disabled, so the API container timed out connecting to remote provider HTTPS endpoints even though the host could reach them. Updated Compose and recreated that network with NAT enabled, then force-recreated API and Backoffice to attach them to the new network. No image rebuild or volume change was needed.
- Verified the saved OpenRouter credential from inside the API container: the model-list endpoint returned HTTP 200 and 462 parseable model records. Backoffice `/admin/providers` also returns HTTP 200 and all service containers are running; the browser-triggered persistence flow was not exercised in this check.
- Provider endpoint allow-listing, deployment-mode checks, redirect rejection, and bounded timeouts remain enabled.

## 14-10-26 — Provider-specific price caps and automatic model selection

- Added [ADR-0016](../../adr/0016-provider-specific-price-caps-and-automatic-model-selection.md): each provider connection owns its maximum input/output USD per 1M tokens; FaroAI enforces those limits before Jev and before inference. Jev chooses automatically from the eligible pool.
- Replaced the provider model table and model checkboxes with connection-level input/output limits, automatic model/price sync, eligible/discovered counts, last sync, and a refresh action. New connections attempt a sync immediately after save.
- Simplified Jev routing to show an eligible-model count and tenant request budgets. The browser no longer receives model IDs for this page or from the provider connection test endpoint. Removed legacy APIs that manually enabled models or edited model prices; tenant candidate writes now reject submitted model lists.
- Gateway candidate materialization and inference selection now require an available catalog model, current non-free rates, and both rates within that provider connection's caps. Provider sync replaces provider-reported rates and clears older synced rates absent/incomplete in the new feed. Free-model exclusion has no opt-out.
- OpenRouter prompt/completion prices are converted from USD/token to USD/1M tokens, and image prices retain the USD/image unit. Migration 009 widens stored image price precision to `numeric(20,12)`. Migration 010 sets provider caps to zero by default and resets existing connections until an operator enters actual limits.
- Updated ADR-0010/0011/0013/0014/0015 notes, the Backoffice/provider/price-limit specs, and the ADR implementation audit to identify superseded decisions and the new contract.
- Verification: Gateway and Backoffice typechecks and production builds passed. Migrations 008–010 are applied; database confirms image-price precision `numeric(20,12)` and fail-closed provider caps. Rebuilt and restarted API and Backoffice containers; API is healthy and `http://127.0.0.1:3001/admin/providers` returns HTTP 200.
- Limit: local Ollama/LM Studio catalogs do not report model prices, so unpriced local models remain excluded until a separate local-cost pricing design is defined. Browser interaction with provider creation was not manually exercised.
- Follow-up validation: found the existing OpenRouter connection had an initial `$1,000,000 / 1M token` limit, effectively admitting nearly all paid models. Applied migration 010 fail-closed; existing connection now has both caps at `$0` and no eligible models until adjusted in `/admin/providers`.

## 14-10-26 — Maximum provider token price and local admin login

- Limited each provider connection's input and output price caps to `$10 / 1M tokens` in the add-provider form and existing connection editor. The gateway rejects values above `$10` on both create and update; migration 011 adds matching PostgreSQL constraints.
- Updated ADR-0016 and the provider catalog and price-limit specs with the cap and all three enforcement layers.
- Investigated the local Backoffice login failure. The saved `.local-admin-password` credentials were valid, but its email (`admin@localhost`) did not match the configured email (`admin@localhost.test`). Updated the email in `.local-admin-password` to `admin@localhost.test`; the password and encryption key are unchanged. Updated `gateway/setup-local-admin.mjs` so future generated credentials use the same valid email format.
- Made migration 011 safe to rerun because Compose executes the migration set during API startup as well as explicit migration runs.
- Rebuilt and restarted API and Backoffice; migration 011 completed, both database maximum-cap constraints are present, `/admin/providers` returns HTTP 200, and a login through the Backoffice proxy succeeds and can fetch `/api/admin/providers` with its session (HTTP 200).

## 14-10-26 — Backoffice login form submission

- Updated the local login form to read submitted credentials from the form fields, including browser-autofilled values, instead of relying only on React state. Added explicit `name` attributes and trims the email before sending.
- Gateway login validation now trims email before format validation, so leading/trailing spaces do not cause a misleading “Email and password are required” response.

## 14-10-26 — Provider image price cap

- Added a separate provider-connection maximum image price from `$0` to `$10/image`, alongside the existing input/output token caps. The cap defaults to `$0` and is independently editable for each connection.
- Gateway filters image requests by the synced per-image model rate and this connection cap. Unknown or over-cap image rates cannot be selected when the tenant permits image use; text-only requests may still use the model.
- Added migration 012 and updated ADR-0014/0016 plus the provider catalog and model price limit specs.
- Applied migration 012 and verified the image-cap column and PostgreSQL range constraint ($0�$10/image). Recreated API and Backoffice; API health is healthy, Backoffice is running, and `/admin/providers` returns HTTP 200.
- Follow-up: the running Backoffice container still referenced an older image after the first build, so the existing provider cards did not include the image field. Rebuilt from the current source, recreated the Backoffice container with the new image, confirmed the compiled page contains �Maximum image price (USD / image),� and verified `/admin/providers` returns HTTP 200.
- Added a host-based Backoffice dev mode using Next.js Fast Refresh, loopback-only binding, and the host-published API URL. Added setup/return instructions to README; this mode does not build a Docker image.
- Started the new host dev server on `127.0.0.1:3001`; `/admin/providers` and the Docker API readiness route both return HTTP 200. Stopped the containerized Backoffice and removed the two unused older Backoffice image IDs; left the current production image and all service data volumes intact.
- Investigated the dev hydration warning: the app renders only `lang="en"` on `<html>`; `data-kantu="1"` is injected by the Ui.Vision/Kantu browser extension before React hydrates. Added React `suppressHydrationWarning` only on the root `<html>` element for that external attribute. Dev server recompiles and `/admin/providers` returns HTTP 200.
