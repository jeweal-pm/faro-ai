# 15-10-26 — Automatic provider pricing and Jev routing

- Saving a provider connection's input, output, and image price ceilings now refreshes its catalog and derives the full eligible model set automatically. Backoffice reports how many paid models fit the saved limits; no model IDs need manual entry.
- OpenRouter discovery stores only explicit, parseable rates. Missing prompt/completion rates stay unknown and cannot enter the paid candidate set. A failed catalog fetch leaves the prior successful catalog intact. No rate is inferred as `$0` or copied from a ceiling.
- The current OpenRouter sync returned 443 models, 436 with usable token rates, and 25 eligible under this connection's saved limits. Gateway returned all 25 to the tenant runtime candidate pool.
- Fixed the Gateway-to-AI request mismatch that caused HTTP 422: Gateway sent an estimated-cost field rejected by the AI service's strict request schema. Gateway typecheck and build passed.
- Jev now has no `none` candidate for product requests with a recommendation or meaningful recipient/style/color/exclusion preference. Plain category lookups can still use verified product cards without a generation model.
- Manual browser search for `I need ring for my sexy girlfriend she dress in black` completed: Jev Decisions returned HTTP 200, GIS MCP returned HTTP 200, OpenRouter Chat Completions returned HTTP 200, and the UI showed 8 GIS products. AI improvement/training consent stayed off.
- Updated `next.config.ts` to allow the loopback origin for Next dev mode. No Docker image was rebuilt.

Decision and behavior are documented in [ADR-0016](../../adr/0016-provider-specific-price-caps-and-automatic-model-selection.md), [Provider model catalog spec](../../spec/provider-model-catalog.md), and [Jev routing spec](../../spec/openrouter-jev-discovery-routing.md).
