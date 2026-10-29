# ADR-0019: Use OpenRouter's TypeSafe Jev 1.13 Decisions API

- **Status:** Accepted
- **Date:** 2026-10-14
- **Deciders:** FaroAI product owner and implementation team
- **Related:** [ADR-0011](0011-jev-selects-tenant-approved-models.md), [ADR-0016](0016-provider-specific-price-caps-and-automatic-model-selection.md), [ADR-0017](0017-live-mcp-product-search-results.md), [ADR-0021](0021-structured-product-search-constraints.md), [Discovery shopping journey](0018-discovery-shopping-journey.md)

## Context

FaroAI previously treated Jev as an optional OpenAI-compatible chat-completions model configured by `DECISION_BASE_URL`, `DECISION_API_KEY` and `DECISION_MODEL`. TypeSafe Jev 1.13 on OpenRouter is a typed decision service. It returns structured choices through OpenRouter's Decisions API and does not generate conversational prose. Calling `/chat/completions` with this model cannot provide the intended routing and preference extraction.

FaroAI already stores an encrypted OpenRouter provider credential and applies a separate input/output price ceiling to each provider connection. Requiring a duplicate Jev secret in deployment environment variables would bypass Backoffice credential management and make the price policy unclear.

## Decision

- Pin Jev to `typesafe/jev-1.13` and call `POST https://openrouter.ai/api/alpha/decisions` with the typed `questions` and `state` contract. The URL and model ID are fixed in the AI service; the request cannot choose an endpoint or model.
- Use an enabled OpenRouter connection's encrypted API key, decrypted only in the gateway and passed only over the signed internal gateway-to-AI request. Do not require or read `DECISION_BASE_URL`, `DECISION_API_KEY` or `DECISION_MODEL` environment variables.
- Call Jev only when deployment policy permits OpenRouter, the provider connection is enabled and has a complete saved key, and its input cap is at least Jev's current listed rate of **$0.042 per 1M input tokens**. Jev's current output rate is $0 per 1M tokens. The cap is an eligibility threshold, not the usage price or a guarantee of total request cost. If no connection qualifies, use the existing bounded deterministic route and do not call OpenRouter.
- Ask Jev typed choice questions for intent, eligible MCP source, eligible paid generation candidate, jewelry type, style, recipient, and outfit context. Provide only current tenant-approved source/tool metadata and current gateway-eligible candidate IDs. Resolve every returned choice against the request's allow-lists; ignore unknown IDs and never accept an endpoint, tool argument, model name, or credential from Jev.
- For recommendation prompts that contain meaningful preferences or exclusions, ask Jev to select the lowest-priced suitable candidate from the already eligible paid-model set; allow `none` for a plain category lookup fully served by verified product cards. Include eligible input/output rates as safe decision metadata so Jev can prefer the lower-cost suitable option.
- For live product discovery, include the original user prompt and append only mapped, server-defined preference phrases from Jev's validated choices to the `search_products.query`. Preserve the distinction between jewelry attributes and outfit context (for example, black clothing does not imply black jewelry). GIS remains the authority for product matches and product facts.
- Jev makes decisions only. A selected generation candidate, if any, uses its own provider/model call for prose. A Jev decision alone must be reported separately from generated prose so model-request credit settlement accounts for the paid routing call.
- Never cache Jev decisions or prompts. Do not write prompts, Jev outputs, or live MCP responses to Qdrant or learning/training data through this integration.
- Expose a non-secret Jev readiness explanation on each OpenRouter provider connection in Backoffice. A zero input cap disables Jev and ordinary paid models; an operator must explicitly set a suitable cap.

## Consequences

- FAROAI requests can use the actual TypeSafe Jev model listed in OpenRouter and receive typed choices rather than expecting prose.
- Provider credentials remain managed in Backoffice and encrypted at rest. A connection's price ceiling applies before Jev can be called.
- Jev incurs provider input-token cost even when it selects no generation model. Existing FAROAI credit settlement treats a successful Jev-backed request as a model-backed request; credits remain an internal unit, not USD.
- Jev's fixed choice criteria are intentionally bounded. Preferences outside the supported categories remain in the original query for GIS, without being turned into invented product filters.
- If OpenRouter changes the Decisions API contract, Jev model ID, listed price, or API-key permission behavior, the adapter and this ADR must be reviewed.

## Alternatives considered

- **Call Jev through `/chat/completions`:** rejected because Jev returns typed decision values through a separate endpoint and is not a prose model.
- **Use Auto Router, Jev Router, or a local Jev service:** rejected because the requested decision model is TypeSafe Jev 1.13 on OpenRouter.
- **Add a separate Jev key and endpoint to `.env`:** rejected because that duplicates the encrypted provider connection and could evade its configured price limit.
- **Let Jev return free-form GIS query parameters or MCP arguments:** rejected because the search source and tools must remain server-approved and outputs must map to bounded choices.

## Implementation

See [SPEC: OpenRouter Jev discovery routing](../spec/openrouter-jev-discovery-routing.md). OpenRouter documents the typed Decisions API at [Submit a Decisions request](https://openrouter.ai/docs/api/api-reference/alphadecisions/submit-a-decisions-request), and lists Jev 1.13 pricing at [TypeSafe: Jev 1.13](https://openrouter.ai/typesafe/jev-1.13).
