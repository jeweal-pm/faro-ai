# ADR-0044: Use explicit export intent instead of a repeated consent checkbox

- **Status:** Accepted
- **Date:** 2026-11-02
- **Decision owners:** FaroAI platform
- **Supersedes:** [ADR-0042](0042-explicit-document-generation-consent.md)
- **Related:** [ADR-0036](0036-platform-base-skills.md), [ADR-0045](0045-natural-language-intent-routing.md), [Platform Base Skills spec](../spec/platform-base-skills.md)

## Context

The PO assistant required a separate unchecked checkbox before each conversation could create a file. This duplicated interaction after the user had explicitly asked FaroAI to export a named PO result set in a named file format, and made a product-level action look like a legal consent mechanism.

Application user intent and a data subject's legal basis for processing are distinct. A prompt to export is an affirmative instruction from the authenticated application user; it is not automatically consent from every data subject whose personal data may appear in the PO rows, and it does not establish a lawful basis under GDPR or Thailand's PDPA.

## Decision

- Remove the repeated document-generation consent checkbox and its session cookie.
- Permit artifact creation only when the user request explicitly names a supported output format and an export action (for example, export/download/create/generate a PDF or Excel file). The server-side Backoffice validates the request before it sends `x-faroai-export-requested: true` to the API.
- Require this one-request intent header at `POST /v1/artifacts`. It is not stored as persistent consent. The API continues enforcing deployment enablement, tenant, API-key scope, actor ownership, format binding, size/row limits and private artifact retention.
- Status and download access remain restricted to the same tenant, API key and opaque actor that created the artifact. Keep the 24-hour artifact expiry.
- The export is chat-only and must work from a single self-contained prompt, including the first message when conversation continuity is disabled. A combined prompt may run the requested bounded PO lookup and export only the PO rows returned by that same lookup; an export-only follow-up may use rows already loaded in the current chat. Never infer a missing supplier/status/PO scope from hidden history, fetch extra pages beyond the approved lookup, or export other tenant data.
- Treat the export prompt as operational authorization by the app user only. Do not label it, record it, or rely on it as GDPR/PDPA consent or another lawful basis. The tenant data controller remains responsible for identifying and documenting the applicable basis, purpose, transparency notice, retention and data-subject rights. If processing relies on consent, the controller must obtain and retain valid consent from the relevant data subject for that purpose before processing; an employee/admin export command cannot substitute for it.
- Keep AI chat, knowledge-improvement, RAG-learning and model-training consent paths independent and unchanged.

## Consequences

- Users can export a displayed PO result set with one explicit natural-language request and no extra checkbox. Common variations such as “give me a PDF”, “I need a PDF”, or “PDF please” are recognized as document requests inside the chat.
- A combined first-turn request may search for a supplier/status or PO and export the returned rows in one turn, without relying on conversation history. If the request names a format but no PO scope, ask for the supplier, status, or PO number in chat before calling GIS or creating an artifact. A vague follow-up such as “export these results” without PO rows loaded is handled locally with instructions to include the search target and format, rather than sent to an LLM.
- The system records artifact job metadata and actor ownership, but does not claim this is legal-consent evidence.
- Export request validation is narrow and server-side; callers without a supported format and explicit export action cannot create an artifact.
- Compliance still depends on tenant controller configuration and notices. FaroAI's export action alone does not establish that every personal-data processing activity is lawful.

## References

- [GDPR, Article 6 — lawfulness of processing](https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng)
- [EDPB — process personal data lawfully](https://www.edpb.europa.eu/sme/be-compliant/process-personal-data-lawfully_en)
- [Thailand PDPA B.E. 2562, English translation — Sections 19, 21, 23 and 24](https://www.mdes.go.th/law/detail/1905-Personal-Data-Protection-Act--B-E--2562--2019-)
