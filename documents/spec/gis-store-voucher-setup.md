# SPEC: GIS Store Location and Voucher Type setup

- **Status:** Removed from FaroAI; historical live GIS records retained
- **Date:** 2026-10-30
- **Decision:** [ADR-0038](../adr/0038-gis-store-and-voucher-setup.md)

## Removal status

On 2026-10-30 the user requested that GIS Store setup be removed from FaroAI. The Backoffice setup panel and dedicated Gateway → AI service adapter have been removed. This spec is retained as an audit record of the earlier implementation and its GIS side effects. It does not describe an available FaroAI workflow.

The Location and Voucher Type listed below remain in the GIS test database. They were not deleted. Existing GIS MCP connection configuration and tool permissions remain unchanged.

## Historical purpose

Provision one standard GIS Store Location, then create one Voucher Type linked to the Location ID returned by GIS. All reads and writes use the tenant's configured GIS MCP connection.

## Contract and safety

- Backoffice uses the platform-admin session and CSRF protection. Prompt-scoped tenant API keys cannot call this workflow.
- Gateway actions are fixed: `tool_schemas`, `lookup`, `search_locations`, `create_location`, and `create_voucher_type`.
- Gateway and AI service require the relevant tools to be both discovered live and approved in the selected tenant's `allowed_tools`.
- `create_location` requires `confirm: true`, a GIS-existing Tax ID/name pair, Store type, and no exact match on Location name/code from GIS lookup.
- GIS creates the default Vault zone and cash register with a Location. FaroAI never creates duplicates of them.
- `create_voucher_type` requires `confirm: true`, a single 24-hex GIS Location ID, a supported GIS document group, and an unused code/name according to GIS master lookup.
- Creation is sequential: Location first, Voucher Type second. The second write must use the exact Location ID returned by GIS. A partial outcome is surfaced and never retried automatically.
- Audit events record the operation, actor, names/codes, group, and Location ID. Credentials and full MCP payloads are not logged.

## Central World test values

| Field | Value |
|---|---|
| Location name / code | Central World / CTW |
| Type | Store |
| City / country | Bangkok / Thailand |
| Currency | THB |
| Tax | First explicit Tax selected from GIS; default to GIS `Tax` in the current test database |
| Thousand separator | `,` |
| Date format | `dd/MM/yyyy` |
| Time zone | `Asia/Bangkok` |
| Voucher name / code / group | Central World POS Receipt / CTW-POS / POS |
| Numbering | Prefix `CTW-`, start `1`, width `6`, zero padded, automatic; first number `CTW-000001` |

Values are shown for review in Backoffice. Existing matching records block creation. After creation, read the GIS records back and report each returned ID. Do not create products, POs, inventory, Tax, extra zones, or cash registers.

## Live test result (2026-10-30, tenant KT)

- Created Store Location `Central World` / `CTW`; GIS ID: `6ae45335176b5da84aae1eb4`.
- Created Voucher Type `Central World POS Receipt` / `CTW-POS`, group `POS`; GIS ID: `6ae45337176b5da84aae1ec0`.
- Read-back returned one Location, one Purchase Voucher, and the existing GIS Tax `Tax` / `634f694d17ae947408110e41`.
- No product, PO, inventory, Tax, extra zone, or cash register was created by FaroAI. GIS creates the default zone and cash register as part of Location creation.
