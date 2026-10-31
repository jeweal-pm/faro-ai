# GIS Product Master seed task — 30-10-2026

## User task

Using the tenant's configured GIS MCP, inspect the current Product Master data and create 10 values for each requested type that is missing. Do not duplicate existing values. Respect GIS dependencies. Do not create catalog products, purchase orders, or inventory. Prepare a new Location only after its required values and GIS tools are available.

## MCP requests used

1. Read current Product Masters for `item`, `collection`, `style`, `category`, `metal`, `color`, `size`, `stone`, `stone_group`, `shape`, `cut`, `clarity`, `stone_color`, `stone_size`, and `setting_type` with `get_product_master_data`.
2. Read `location` and `tax` with `get_product_master_data`.
3. Inspect live `tools/list` schemas for `create_product_master`, `create_product_masters_bulk`, and `get_mcp_bulk_job_status` through FaroAI's tenant GIS connection.
4. Submit only missing Product Master values to `create_product_masters_bulk`; every test value uses `(AI)` in its name and an `AI-` code prefix. Poll each returned `job_id` with `get_mcp_bulk_job_status` until completion.
5. Read all requested masters again and verify counts. Read the `Ring` item and colors before creating dependent sizes and metals; pass GIS-returned IDs for `item_id` and `color_id`.

## Seed plan and values

The MCP read found 14 requested types empty. `setting_type` already had 10 entries and was left untouched. Product Master writes use `name (AI)` and a unique code in the form `AI-{TYPE}-{NN}-{SLUG}`; GIS may normalize letter case.

| Type | Values submitted |
|---|---|
| `item` | Ring; Necklace; Pendant; Earring; Bracelet; Bangle; Brooch; Anklet; Chain; Cufflink |
| `collection` | Aurora; Celestial; Botanical; Heritage; Lumiere; Tidal; Solstice; Modern Muse; Eternal; Prism |
| `style` | Classic; Minimalist; Vintage; Art Deco; Contemporary; Nature Inspired; Geometric; Romantic; Sculptural; Statement |
| `category` | Fine Jewelry; Bridal; Fashion Jewelry; Everyday Jewelry; Engagement; Wedding Bands; Gemstone Jewelry; Diamond Jewelry; Men’s Jewelry; Gifts |
| `color` | Yellow; White; Rose; Black; Blue; Green; Red; Purple; Brown; Multicolor |
| `stone` | Diamond; Ruby; Sapphire; Emerald; Pearl; Amethyst; Aquamarine; Topaz; Garnet; Peridot |
| `stone_group` | Precious Gemstones; Colored Gemstones; Organic Gemstones; Birthstones; Classic Gems; Rare Gems; Blue Gemstones; Green Gemstones; Red Gemstones; White Gemstones |
| `shape` | Round; Oval; Princess; Emerald; Pear; Marquise; Cushion; Radiant; Asscher; Heart |
| `cut` | Brilliant; Step; Mixed; Rose; Old European; Old Mine; Cabochon; Briolette; Portuguese; Checkerboard |
| `clarity` | FL; IF; VVS1; VVS2; VS1; VS2; SI1; SI2; I1; I2 |
| `stone_color` | D; E; F; G; H; I; J; K; L; M |
| `stone_size` | 0.25 ct; 0.50 ct; 0.75 ct; 1.00 ct; 1.25 ct; 1.50 ct; 2.00 ct; 2.50 ct; 3.00 ct; 5.00 ct |
| `size` | US Ring Size 4 through US Ring Size 13; each references the GIS `Ring (AI)` item ID |
| `metal` | Yellow Gold; White Gold; Rose Gold; Sterling Silver; Platinum; Palladium; Black Rhodium; Titanium; Copper; Brass; each references the selected GIS color ID |

## MCP results

- Tenant: `KT`.
- Bulk job `6ae44a68176b5da84aae08fd`: 60 values completed; 60 succeeded; 0 failed.
- Bulk job `6ae44a79176b5da84aae0acc`: 60 values completed; 60 succeeded; 0 failed.
- Bulk job `6ae44a8d176b5da84aae0ca0`: 20 values completed; 20 succeeded; 0 failed.
- Read-back verified 10 entries in each of the 14 seeded types and 10 pre-existing `setting_type` entries. All seeded names/codes carry the `(AI)` / `AI-` marker. All 10 sizes reference the seeded Ring item.
- No catalog product, PO, or inventory record was created.

## Location setup remains incomplete

The MCP read found no locations and one Tax master named `Tax`. `search_locations`, `create_location`, and `create_voucher_type` were not approved on this tenant connection. No Location or Voucher was created. Required values still needed: Location name, code, type (`Store` or `Warehouse`), currency, selected GIS Tax, thousand separator, date format, timezone, and voucher numbering format. GIS says creating the Location also creates its default Vault zone and cash register; do not create either again.

## Reusable task prompt

> In tenant KT, use the configured GIS MCP to read the requested Product Master types first. Create exactly 10 values for each missing type, skip every existing value, and respect GIS-returned dependencies. Mark every test value with `(AI)` in the name and `AI-` in the code. Create the parent `Ring` item and colors before sizes and metals; use only IDs returned by GIS for `item_id` and `color_id`. Use bulk creation and poll every job to completion. Do not create catalog products, POs, inventory, Location, Tax, or Voucher records. Report per-type counts, created values, failures, and any permission or configuration gaps.
