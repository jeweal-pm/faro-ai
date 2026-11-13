# ADR-0061: Tenant-scoped customer birthday lookup

- **Status:** Accepted
- **Date:** 2026-11-12
- **Owners:** FaroAI platform and GIS integration
- **Related:** [ADR-0003 tenant identity](0003-use-tenant-id-for-design.md), [Tenant MCP access specification](../spec/tenant-mcp-access.md)

## Context

Tenant staff need to find customer birthdays using ordinary English or Thai prompts. A useful result may contain a customer's name, date of birth and age, address, telephone number, and email address. These are personal data. The lookup must use the tenant's configured GIS connection, must not pass personal data through Jev or an external model, and must not become a general-purpose customer export or write operation.

## Decision

1. Route explicit customer-birthday and customer-age prompts from both FaroAI's authenticated prompt page and GIS `/app/faro-test` to a dedicated, read-only customer lookup workflow. The GIS UI calls a GIS-authenticated proxy rather than the product-discovery chat endpoint. Keep birthday gift/product prompts in product discovery.
2. Parse supported date/name intent with bounded application rules, then call only the fixed GIS MCP tool `search_customers`. Do not ask Jev to select a model or send the prompt, customer records, or contact details to an AI provider for this lookup.
3. Resolve the GIS connection from the authenticated FaroAI tenant. Require the narrow `gis:customers:read` scope for application credentials and require the tenant connection's approved tool list to include `search_customers`. The GIS proxy derives tenant identity from the authenticated GIS session and uses the verified FaroAI application credential with that scope. Never accept a tenant ID, endpoint, key, database name, or MCP tool name as user-controlled routing data.
4. The GIS tool is read-only, tenant-local, bounded, and returns only the fields needed for the requested lookup: customer display name, recorded date of birth, contact phone, email, and primary address. Exclude soft-deleted records by default. Do not expose arbitrary projections or unrelated customer/account fields.
5. Parse all English/Thai month names and abbreviations, named month/day, day-first numeric `DD/MM` and `DD/MM/YYYY`, ISO `YYYY-MM-DD`, supported Gregorian birth years, month plus year, and exact today/yesterday/tomorrow dates. Calculate age from the recorded full birth date using the current Asia/Bangkok calendar date. For records with incomplete birth dates, show the recorded portion and do not infer an age. Reject impossible calendar dates and unsupported multi-date ranges; never silently broaden them.
6. A valid GIS lookup with zero rows is successful and returns an empty list with total `0`. Present a capped, structured result list with a clear empty state and an indication when more results exist. No result may trigger a customer update, message, promotion, export, RAG ingestion, or training action.
7. Audit tenant, actor, correlation ID, operation category, and result count only. Do not put prompt text, names, birth dates, addresses, phone numbers, or email addresses in audit metadata or application logs.

## Consequences

- Simple structured lookups avoid model cost and reduce the exposure of customer PII to providers.
- GIS remains the source of truth for customer and contact data; tenant isolation is enforced by the configured GIS connection.
- Users need the customer-read application scope and the approved GIS MCP tool before application credentials can use the flow. Tenant-admin prompt access remains bound to the signed-in tenant and its configured connection.
- Date parsing uses explicit, documented formats. Slash dates are day-first; ISO is available when the year is included. Invalid calendar dates and unsupported ranges are distinguished from valid searches that have no matching records.
- Birthday search results are not proof of consent or lawful basis for marketing outreach.

## Acceptance criteria

- Prompts such as “Give me [customer name]'s birthday” and “Who has a birthday on June 12?” route to customer lookup, not product discovery or procurement.
- Supported today/month and named-customer age prompts use the same tenant-bound, read-only lookup.
- All valid month/day combinations, supported Gregorian years, English/Thai month variants, numeric day-first dates, and ISO dates parse to the expected GIS filters.
- A zero-match query returns success with an empty result and total `0`, rather than an error.
- Returned records contain only the approved display fields and are capped; no records from another tenant can be returned.
- Missing scope, disconnected GIS, or unapproved MCP tool fails closed with a clear message.
- Impossible dates and unsupported ranges do not produce guessed or broadened matches; incomplete birth dates do not produce guessed ages.
- No customer search sends its prompt/results to Jev/provider, writes to GIS, or adds data to Qdrant/training.
