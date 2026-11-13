# Customer birthday lookup specification

## Goal and boundary

Let an authenticated tenant user find customer birthday records in that tenant's GIS from the existing prompt box. This is an operational, read-only lookup. It is not product discovery, CRM messaging, customer export, model training, or a GIS write workflow.

## Prompt examples

Initial supported English examples:

- `Give me [customer name]'s birthday.`
- `When is [customer name]'s birthday?`
- `How old is [customer name]?`
- `Who has a birthday on June 12?`
- `Show customers born in June.`
- `Who has a birthday today?`
- `Who has a birthday this month?`
- `Show customers born in 1990.`

Initial supported Thai forms include `วันเกิดของ [ชื่อลูกค้า]`, `ลูกค้าคนไหนเกิดวันที่ 12 มิถุนายน`, `วันนี้มีลูกค้าคนไหนวันเกิดบ้าง`, `ลูกค้าที่เกิดเดือนมิถุนายน`, and `อายุของ [ชื่อลูกค้า] เท่าไหร่`.

Explicit references to customers, people, customer records, date of birth, birthdays, or age are required for intent routing. Jewelry/product terms or gift recommendations take precedence and remain in product discovery unless the prompt explicitly requests customer records.

## Supported filters

| Filter | Initial behavior |
|---|---|
| Customer name | Exact/partial name query handled by GIS; show a bounded set of matches |
| Specific month and day | Match recurring birthday by month/day, across birth years; accept full/abbreviated English and Thai month names |
| Numeric date | Accept day-first `DD/MM` and `DD/MM/YYYY`; accept ISO `YYYY-MM-DD` |
| Month | Match birthdays in any of the 12 months |
| Relative single day | Match today, yesterday, or tomorrow using Asia/Bangkok date |
| Current/next month | Match recurring birthdays for that calendar month |
| Birth year | Match any supported Gregorian birth year (1800 through current year); month plus year is also valid |
| Count phrasing | Keep the same date filter and use GIS's total count |
| Age | Compute only when full year/month/day are recorded |

Filters requiring unsupported GIS fields (VIP/customer group, assigned salesperson, store or customer activity) are not simulated. Multi-day ranges, month ranges, and year ranges are not silently converted to a single date. Slash dates use day-first order; use ISO when the year is included and the order should be explicit.

## Lookup and response

1. A tenant user submits a prompt from either FaroAI's authenticated prompt page or GIS `/app/faro-test`. The GIS page uses a dedicated authenticated GIS proxy; it must not send customer birthday prompts through the product-discovery chat endpoint.
2. A deterministic intent/date parser recognizes an explicitly customer-related birthday/age lookup. No Jev/provider model is called for this structured query.
3. FaroAI binds the request to the authenticated tenant and retrieves that tenant's enabled, tested GIS MCP connection. `search_customers` must both appear in the live GIS `tools/list` and be included in that connection's approved `allowed_tools`.
4. FaroAI invokes the fixed read-only tool with only the parsed query/date filters, bounded limit and offset. The caller cannot choose arbitrary MCP tools or GIS projection fields.
5. FaroAI validates the response and returns at most 100 records, containing only customer display name, date of birth, calculated age when complete, email, phone, and primary address. If the result has more records, indicate truncation and ask the user to narrow the search.
6. A valid lookup returning zero GIS rows is a successful response with `customers: []` and `total: 0`; the UI says no matching recorded birthday was found. It is not an error. The UI displays a readable table on wide screens and cards on narrow screens. Do not show fabricated fallback customers.

## Permission and privacy

- Browser access requires a valid tenant session. Tenant identity comes from that session only.
- Server-to-server tenant credentials require `gis:customers:read`.
- GIS connection must be enabled, successfully connected, and tenant-bound. The `search_customers` tool must be tenant-approved and advertised by GIS at runtime.
- For the GIS frontend proxy, the stored FaroAI application credential must also have the narrow `gis:customers:read` scope. GIS derives the target tenant from its authenticated session and never accepts a tenant ID from the browser.
- GIS's configured organization/database remains the only GIS tenant selector. Never accept a tenant/database ID from a prompt.
- No raw prompt or returned PII is sent to Jev, an external model provider, Qdrant, or training pipelines.
- Audit only tenant ID, actor identifier, correlation ID, lookup category, and result count. Never log raw query or returned customer fields.
- Exclude soft-deleted customers by default. Return the minimum contact fields required for this feature; do not expose full arbitrary customer profiles, notes, loyalty, purchases, or payment records.
- Results are not automatically emailed, exported, or used to send birthday promotions. The caller's request does not establish the customer's consent or lawful basis for marketing.

## Error behavior

- Missing customer-read scope: explain which tenant credential permission is required.
- GIS connection unavailable: ask the tenant administrator to enable/test the GIS connection.
- Tool absent or unapproved: identify `search_customers` as the required read-only permission.
- Unsupported filter: explain which filter cannot be applied; never return unfiltered records as if filtered.
- Empty result: state that no matching recorded birthday was found; do not imply that the customer does not exist when the customer lookup itself was not successful.
- Incomplete DOB: show the recorded DOB components and omit calculated age.
- Week, rolling-day, or unsupported CRM filters: explain that they are not supported yet instead of dropping the filter.
- Invalid calendar date: explain that the requested date does not exist (for example, 31 April). A valid date with no matches is an empty result, not an error.

## Out of scope for the first release

- Birthday campaigns, reminders, email/SMS, customer updates, exports, purchase-history targeting, VIP/group/location/salesperson filters, and data sharing across tenants.
- Generic free-form customer search or unrestricted customer-directory access.
- Qdrant indexing, RAG, and any training use of customer PII.
