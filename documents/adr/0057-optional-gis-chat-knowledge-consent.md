# ADR-0057: Optional consent for tenant-scoped GIS chat knowledge review

- **Status:** Accepted
- **Date:** 2026-11-11
- **Decision owners:** FaroAI platform
- **Related:** [ADR-0012](0012-consented-model-improvement-and-training.md), [ADR-0053](0053-gis-integrated-faroai-credentials.md), [consented model improvement spec](../spec/consented-model-improvement.md), [GIS FaroAI integration spec](../spec/gis-integrated-faroai-credentials.md)

## Context

FaroAI Backoffice separates required consent to process a search from an optional purpose-specific consent to review a scrubbed question and answer as knowledge for that same tenant. GIS `/app/faro-test` currently collects only the required chat-processing consent, and its backend always sends `ai_improve=false`. GIS users therefore cannot make the optional choice available in FaroAI Backoffice.

## Decision

1. Keep the required per-request consent to process a submitted prompt/image and return a response.
2. Add a separate, optional, unchecked-by-default GIS checkbox for reviewing the scrubbed text question and FaroAI answer as knowledge for the same tenant's search.
3. Send the optional boolean from GIS frontend to the authenticated GIS backend. Missing or invalid values do not grant consent; the backend sends `x-faroai-ai-improve-consent: true` only when the validated value is exactly `true`.
4. This consent permits creation of the existing tenant-scoped review candidate only. It does not authorize local or shared model training, automatic Qdrant indexing, sharing with other tenants, or storage of image bytes. Knowledge promotion still requires the existing human review and explicit approval flow.
5. The optional consent affects data retention/review only. It is not required to search and cannot substitute for the required chat-processing consent or `chat:write` permission.
6. Consent is collected for each request and is not persisted as a standing tenant setting.

## Consequences

- GIS and FaroAI Backoffice expose the same two distinct choices for text/image search: required processing and optional tenant knowledge review.
- Existing GIS clients that omit the new field continue to work with improvement consent off.
- A denied chat-processing consent or permission remains a request failure; the optional knowledge checkbox does not change it.
- GIS must preserve safe, distinct reporting for allowlisted upstream `consent_required`, `forbidden`, and `tenant_disabled` errors so deployment issues are diagnosable without exposing arbitrary upstream details.
