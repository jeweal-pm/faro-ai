# ADR-0045: Keep natural-language intent routing model-led with deterministic hints

- **Status:** Accepted
- **Date:** 2026-11-03
- **Decision owners:** FaroAI platform
- **Related:** [ADR-0036](0036-platform-base-skills.md), [ADR-0044](0044-explicit-export-intent.md), [Platform Base Skills spec](../spec/platform-base-skills.md)

## Context

Users can express the same task in many ways and may start a chat with an export request while conversation continuity is disabled. Growing frontend regular expressions into an exhaustive phrase catalog would make routing brittle and move language understanding away from the AI workflow. Sending every message through a second intent-classifier model would add latency and model cost.

The current procurement orchestration already asks Jev once to choose an eligible paid task model and the applicable published Base Skill. The selected task model receives the user's original prompt and interprets the GIS request. The Backoffice still needs reliable hints to open the correct chat and to identify a requested artifact format.

## Decision

- Keep Jev's existing single decision request for task-model and skill selection. Do not add a second unconditional LLM classifier call.
- Treat the Jev-selected task model as the semantic interpreter of the complete, unmodified user prompt, including Thai/English paraphrases, filters, supplier names, PO status and task details.
- Maintain one small, shared Backoffice intent-hint module for supported artifact formats and common explicit export wording. These hints route into the in-chat procurement flow and bind the output format; they are not an exhaustive command grammar and do not choose GIS tools or grant permissions.
- Keep server-side policy checks deterministic: tenant scope, approved MCP tools, read/write permissions, explicit export intent, supported format, row limits and non-empty output remain enforced independently of model interpretation.
- Recognize first-turn requests without relying on conversation history. A self-contained prompt may search and export in one turn. If the request does not identify the PO scope, ask for supplier/status/PO details in chat and do not create an artifact. When continuity is disabled, prompts must carry the needed scope themselves.
- Do not store phrase hints in Qdrant. Qdrant is for tenant-scoped semantic knowledge and retrieval, not platform command behavior.
- Extend the hint module only for routing gaps observed in use. Use anonymized intent outcomes and hand-authored examples for evaluation; do not log full prompt content to build the dictionary.

## Consequences

- Common phrasing variations work without requiring users to learn exact commands.
- Unrecognized natural-language details can still be interpreted by the selected task model when the message is routed to the chat.
- Format detection remains constrained to supported output formats, and an explicit export request is still required before file creation.
- A missed routing hint can still send a request to the wrong experience. Improve the small hint set from observed cases without turning it into the semantic decision-maker.
- Current prompt-history policy remains independent: disabling continuity suppresses prior messages, while a self-contained current prompt can still complete its task.

## Acceptance criteria

- “Give me a PDF”, “I need a PDF”, “PDF please”, and Thai equivalents enter the in-chat procurement experience.
- A first-turn request that identifies supplier/status/PO and file format can search and create a document in the same turn, using only returned GIS rows.
- A format-only request asks for the missing PO scope and does not call GIS or create an empty file.
- The original prompt reaches the selected task model unchanged; the application does not require an exact phrase match for its business meaning.
- No extra LLM call is added solely to classify intent.
