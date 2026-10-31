# Specification: Natural-language GIS purchasing and inventory

Voucher master setup is governed by [Prompt-driven GIS master operations](gis-procurement-master-operations.md). Supplier lookup and confirmed supplier writes are governed by [GIS Supplier operations](gis-supplier-operations.md).

## Goal

Let an authenticated FaroAI platform administrator manage GIS purchase orders and
receive approved inventory using short Thai or English instructions. The user does
not need to know GIS MCP tool names or record IDs.

## Entry point and access

- Requests are recognized from the main Discovery prompt when the text contains a PO,
  purchase-order, inventory, or receipt subject together with an action.
- Route singular or plural PO references (`PO`, `POs`, `purchase order(s)`) with
  read or write actions such as show, list, find, view, create, or receive to the
  procurement assistant. These requests must not fall through to jewelry product
  discovery.
- Treat those singular/plural forms as read-only PO lookup intent when paired
  with read verbs, so the assistant returns structured GIS PO details in the same
  turn instead of ending with an empty generic response.
- The procurement assistant uses the platform administrator session and selected
  active tenant. It does not use the public jewelry-search API for ERP writes.
- Each procurement request is routed through the FaroAI gateway and AI service. Provider
  credentials and the GIS API key remain server-side.
- Admins can enable or disable procurement conversation history in Admin → Deployment.
  It defaults to enabled for existing behavior. When disabled, the gateway discards
  client-supplied history before calling the AI service and returns no history for the
  next request; each prompt then starts without earlier turns.

## Runtime tool contract

The AI service fetches MCP `tools/list` for each assistant request and includes a tool
schema only when its name is both in FaroAI's fixed procurement allow-list and in the
tenant connection's `allowed_tools`. The gateway also requires a connected GIS MCP
connection and the tools required by this workflow. MCP calls independently recheck
the current advertised tool list and tenant approval.

Required tools:

- `get_product_master_data`
- `search_po_products`
- `preview_purchase_order`
- `create_purchase_order`
- `search_purchase_orders`
- `get_purchase_order`
- `preview_inventory_receipt`
- `receive_inventory`

Supplier prompt requests use a separate minimum capability set:

- Read-only supplier lookup: `search_suppliers`
- Create supplier: `search_suppliers`, `create_supplier`
- Activate supplier: `search_suppliers`, `activate_supplier`

Supplier search does not require either mutation permission. An explicit supplier-create prompt writes through the authenticated Gateway after live duplicate checks; supplier activation retains the existing one-time confirmation endpoint.

`get_mcp_bulk_job_status` is optional and is used only if GIS advertises it and the
tenant enables it.

## Conversation behavior

- Load system instructions from `example-prompt/po-inventory-prompt`.
- Support Thai and English; reply in the user's language where practical.
- Structured PO results provide an icon toggle between product-card and table views.
  Product-card view is the default. The selected view applies to every PO result in
  the open conversation and changing it only changes presentation; it must not send
  another prompt or call GIS again.
- Product-card view shows each line's product name, SKU, quantity, unit price, and
  line amount. Both views retain PO number, supplier, dates, status, filters, and
  the aggregate totals.
- A separate Filter icon opens local filters for unit price, quantity, or line amount
  with numeric comparison operators. Applying or clearing a filter only transforms
  the structured PO results already on screen; it must not call the model, gateway, or GIS.
- Resolve named records with GIS. When several live GIS records match, select the best
  contextual option and show the selected record in the preview.
- The word `PO` means purchase order and must not be treated as choosing a GIS
  purchase voucher also named `PO`; when no voucher is named, select a live active
  purchase voucher contextually and show it in the preview.
- User-provided values always take precedence. AI may propose missing PO quantity,
  unit purchase price, and dates, and must mark them as AI proposals in the preview.
  Default transaction date is today's Asia/Bangkok date, default proposed delivery is
  14 days later, and a missing quantity defaults to 1 per product. Currency comes from
  user input, then GIS configuration, then THB. Resolve all supplier, location, voucher,
  and product records from live GIS data; choose the most contextual valid match and
  disclose it for confirmation. Never invent GIS records or IDs. If a required GIS
  master is absent, stop and explain the missing setup. Receipt quantities always come
  from the approved PO returned by GIS.
- Never create a catalog product as a hidden side effect of making a PO. If the user
  requests new products, route through product creation first, then use GIS-returned
  product IDs for the PO.
- Keep PO line count within GIS limits. Ask before splitting a request over the limit.

## Create PO workflow

1. Classify the request as PO creation.
   An explicit request to create a PO remains PO creation when it also names the
   voucher to use. Classify as voucher setup only when the voucher itself is the
   explicit create/configure target.
   Recognize the GIS `Purchase order` group consistently across space, hyphen, and
   underscore spellings when checking whether a usable PO voucher exists.
2. Gateway resolves live supplier, location, and purchase-voucher masters and searches
   the requested product family before the model prepares the PO preview.
3. AI-propose missing commercial values; ask a follow-up only if required live GIS
   records are unavailable or no product can be matched or created through FaroAI.
4. Call `preview_purchase_order` and show supplier, location, voucher,
   transaction and delivery dates, products, quantities, unit prices, and total.
5. Wait for explicit administrator confirmation in the UI.
   PO creation must require a tool call, expose the preview tool, and keep the
   direct create mutation unavailable to the model until Gateway confirmation.
   Once GIS masters and products are loaded, require the model to call only the
   preview tool for this step.
6. Gateway claims the one-time Redis preview draft for the same actor and tenant, then
   re-runs preview. If invalid or changed, stop and require review of a fresh preview.
7. On an unchanged valid preview, gateway calls `create_purchase_order` exactly once.
   Report that the PO is pending GIS approval. Never approve or claim it is approved.

### Paginated bulk selection from a FAROAI catalog prefix

- When the administrator requests an exact batch of FAROAI-created products and gives
  a selector such as SKU prefix `FAROAI-`, the server searches the saved tenant GIS
  MCP connection with `search_po_products` in 50-row pages. The model does not invent
  IDs and the user does not need to type names or IDs.
- Apply any exact product-name exclusions stated by the administrator, keep only
  verified GIS products with matching `FAROAI-` SKUs, deduplicate by GIS ID, and
  require the final count to equal the requested count. More than 100 lines, missing
  pages, duplicate IDs, or a count mismatch stops with no PO preview or write.
- Supply the verified, paginated product results and live supplier/location/voucher
  masters to the selected paid model. Require it to call `preview_purchase_order` for
  the full set and label model-proposed prices/dates as proposals. The normal preview
  confirmation control remains the only path to PO creation.
- Keep each prompt round and its result in `final_prompt/po/` for operator audit.

## PO search and receipt workflow

- A read-only PO search/check is completed from one user prompt. FaroAI performs
  supplier resolution, order search, and detail retrieval as internal MCP calls in
  that request; it must not ask the user to submit another prompt just to obtain the
  matching PO's details or line items.
- For a human-readable supplier filter, resolve the exact supplier name to a live GIS
  supplier ID before calling `search_purchase_orders`. Never send the display name as
  `supplier_id`. If a filtered query returns no rows, retry with verified identifiers
  and relax optional filters one at a time. Do not label records outside an explicit
  supplier/status constraint as matches; explain any broader diagnostic results.
- For each matching PO needed to answer the request, call `get_purchase_order` during
  the same assistant request. Return PO number, supplier display name, status, date,
  and—when requested or needed for the summary—line item name/SKU, ordered quantity,
  unit price and line total, plus the GIS total. Never return internal supplier,
  location, product or database IDs. Detail at most 10 POs per request and state when
  more matching POs exist.
- A no-results answer is valid only after the requested supplier has been resolved and
  the requested filters were actually applied to GIS data. MCP errors and invalid
  filters must be reported as lookup failures, not as proof that no PO exists.
- For receipt, fetch the PO and verify status code `3`. If it is not approved, tell the
  user to approve it in GIS and stop.
- Construct receipt lines only from that PO's GIS-returned `main_po_product_id` and
  `remaining_quantity`; obtain any required voucher details from GIS.
- Call `preview_inventory_receipt`, display the PO, location, item/quantity and total,
  then wait for a separate explicit administrator confirmation.
- Re-preview at confirmation and call `receive_inventory` only on an unchanged valid
  preview. Tell the user the receipt itself remains pending GIS approval.
- If GIS returns a bulk job, do not retry the batch automatically. When the optional
  bulk-status tool is enabled, report its progress and outcomes without repeating
  successful rows.

### Purchase order result presentation

- The assistant service returns display-safe structured PO details from the live
  `get_purchase_order` MCP result alongside its conversational answer. The gateway
  forwards this data to the backoffice without exposing GIS database IDs.
- When structured PO details are present, render them in the existing assistant
  response as a readable table with product name, SKU, quantity, unit price, and
  line amount, plus PO number, supplier, status, date, and totals when returned.
- Use GIS values only. Do not infer currency when GIS does not provide it. Keep
  the conversational send box available for follow-up questions, but do not require
  another user message to display the table or duplicate the same lines as prose.
- On narrow screens, keep the table readable with horizontal scrolling; do not
  collapse line items into a second nested conversation card.
- Preserve the latest structured PO result in the active conversation. A follow-up
  filter or question that refers to those lines remains a PO-table response even if
  the new prompt omits “PO”.
- Apply unambiguous numeric line filters (for example, unit price below 300) to the
  already retrieved GIS rows without another model or MCP request. Recompute the
  displayed matching-line count and subtotal, label them as filtered values, and
  show an empty state when no rows match. Do not label a filtered subtotal as the
  original PO total.
  - Parse the longest comparison phrase first so negation is not lost: “not more
    than”, “no greater than”, “not greater than”, “at most”, “no more than”, “not
    over”, and “up to” mean `<=`; “not less than”, “at least”, and “no less than”
    mean `>=`. For example, “Unit price not more than 300” means `unit_price <= 300`.
    “Lower than” and “less than” mean strict `<`; “higher than” and “greater than”
    mean strict `>`. For example, “Unit price lower than 100” means `unit_price < 100`.
    When a user sends a new numeric filter, replace the prior filter turn and apply
    it to the original structured GIS rows for the active PO result, not to the
    previous filtered subset. This prevents stale rows or compounded filters from
    appearing as the current answer.
  - Infer a quantity filter only from explicit quantity terms (`qty`, `quantity`,
    plural `units`, “number of units”, or Thai “จำนวน”). Singular “unit” in “unit
    price” must not select the quantity field. Show the parsed field and operator in
    the table filter label.
- For follow-ups that need model/GIS interpretation, keep the active PO table in the
  same answer when the response does not return a replacement structured result.
  New create/receive/approve requests start their own flow and must not inherit a
  read-only table as their result.
- Let the user edit and resend the latest prompt from its transcript bubble. Load
  the original text into the composer; provide cancel and save/resend actions.
  Resubmission replaces that prompt and all later transcript output, keeps the
  structured PO data and model history from before that prompt, and uses only that
  preceding context. An edited numeric filter is reapplied locally to the retained
  GIS rows. Existing explicit confirmation remains required for writes.

## Security and audit

- The model only receives read/search/preview tools. Mutation tools are server-only.
- The gateway stores the exact preview arguments, tenant, actor and preview in Redis
  with a 15-minute TTL. A Lua claim prevents replay. The UI receives only a random draft
  token and a preview with record-ID fields removed.
- Every request requires the platform admin session and CSRF validation. Each write
  includes a second live GIS preview immediately before the write.
- If the write response is ambiguous, report an unknown outcome and require the admin
  to check GIS before retrying.
- Audit events capture actor, tenant, tool/action, model and outcome metadata; they do
  not include prompts or provider/GIS secrets.

## Reversible test-data marking

Any deliberately created test record must end its available descriptive field with
`(AI)` so GIS administrators can find it and remove it after the experiment:

- Product/catalog item: append `(AI)` to both `Matatag` and `Description`.
- Purchase order: append `(AI)` to `note`.
- Inventory receipt: append `(AI)` to `note`.
- If another test record type is added to this flow, use its supported note,
  description, or metadata field and append the same exact suffix.

This marker does not authorize a write by itself. Product, PO, and receipt writes
still follow their normal preview and explicit-confirmation flow. Search-only tests
must not create records.

## Acceptance checks

- Thai: `ช่วยสร้าง PO แหวน ABC 5 วง`
- English: `Create a PO for 5 rings, model ABC.`
- Unmatched-product prompts ask for the intended catalog item or route the user to the
  product-creation flow; neither creates a PO or receipt before confirmation.
- A complete request previews first and pauses for admin confirmation.
- A request with omitted PO price or dates generates AI proposals in the correct
  currency and Bangkok date context, then pauses at the same confirmation gate.
- A request for exactly 100 products under a known SKU prefix pages through GIS search,
  excludes the administrator's exact named test item, and either previews exactly 100
  distinct GIS product IDs or stops without a preview. The UI never asks the operator
  to copy those GIS IDs.
- Explicit user values override generated proposals. No model-generated proposal is
  written to GIS until the administrator confirms that exact preview.
- Pending/unapproved PO cannot enter receipt preview. Approved PO requires receipt
  preview and separate confirmation.
- Missing/unapproved/live-undiscovered MCP tool blocks the flow without guessing.
- No AI action can approve or cancel a PO or receipt.
- A request with an unmatched catalog item or a missing required GIS master leaves
  `pending_confirmation` empty. Missing price/date/quantity alone must not trigger a
  follow-up question.
- `ช่วยสร้าง PO แหวน ABC 5 วง` searches GIS for `ABC` without including `5 วง` in
  the catalog term, then asks only about the unmatched catalog item. Supplier,
  location, voucher, price, and dates are resolved or proposed and shown in preview.

### Verified bulk PO implementation

- For a prefix-selected bulk PO, Jev returns ordered proposed prices only. The
  gateway constructs all PO line IDs and quantities from the exact verified GIS MCP
  product page results, so model-generated or missing IDs cannot reach preview.
- Ignore surplus model price values; if the model returns too few, request prices for
  only the missing trailing lines. Do not call preview unless the exact requested
  number of products and usable prices are available.
- Resolve master labels only from live GIS results. An abbreviated label may match a
  unique GIS name prefix; ambiguous or missing records stop before preview.
- A valid GIS preview is saved to Redis before it is displayed. If draft storage
  fails, do not present a confirmation control or create a PO.
- Runtime confirmation: GIS validated 100 distinct lines, quantity 100 each, and
  returned a valid read-only preview (`writes_database: false`). No PO create call
  occurred; the pending preview waits for administrator review and confirmation.
