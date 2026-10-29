# ADR-0034: Make procurement conversation context configurable

- **Status:** Accepted
- **Date:** 2026-10-26
- **Deciders:** Platform administrator

## Context

Procurement follow-up turns currently include previous conversation messages in each
model request. This helps the model resolve references such as “those items,” but it
increases input tokens and can preserve context the administrator no longer wants to
send. Numeric line-item filtering can be performed against structured GIS results
already loaded by the page and does not need a model request.

## Decision

- Add a platform-wide Admin → Deployment setting to include procurement conversation
  history in model requests. It is enabled by default to preserve current behavior.
- Store the value durably in PostgreSQL and audit every administrator change.
- Enforce the setting in the gateway: when disabled, discard submitted history before
  calling the AI service and return an empty history to the client. The UI cannot
  override this server-side policy.
- Provide an independent Filter icon for numeric PO line filters. Filtering operates
  only on structured results already received and does not call the AI model or GIS.
- Default PO results to product-card layout while retaining the table toggle.

## Consequences

- Administrators can reduce input-token usage without redeploying the application.
- With history disabled, follow-up prompts cannot rely on earlier turns; users must
  repeat relevant context in the new prompt.
- PO line filters remain available without consuming model tokens or repeating GIS calls.

## References

- [Natural-language GIS procurement SPEC](../spec/natural-language-gis-procurement.md)
