# Discovery evaluation run — 17-10-26

- Submitted 220 unique synthetic jewelry prompts through the local Discovery UI for tenant KT and exported the final rendered prompt/product pairs to `user-check/2026-10-17-discovery-eval-220.jsonl`.
- Added the run summary, counts, retries, and relevance observations in `user-check/2026-10-17-discovery-eval-220.md`.
- 194 prompts returned GIS MCP results, 26 had no products, and 3 rate-limited prompts succeeded when retried. The final set contains 1,495 product cards across 98 distinct SKU/name keys.
- Left customer local/shared training consent and knowledge-improvement consent off. No learning candidates were created; KT remained at 199 FaroAI credits.
- The evaluation set is not a fine-tuning dataset. No expected/gold product list was supplied, and result text alone shows relevance failures for sapphire and no-diamond constraints.
