# PO batch attempt — GIS preview blocker

- Request: create 10 separate test POs with random active GIS products, leave each pending approval, and do not receive inventory.
- Fixed PO intent routing so mentioning a PO voucher does not turn a PO create request into voucher setup. Normalized `Purchase order` group spellings and made the PO assistant load GIS product candidates and use only the preview tool before Gateway confirmation.
- Created the missing Central World voucher through the FaroAI procurement prompt: `Central World PO (AI)`, code `AI-CW-PO-2026`, group `Purchase order`, location Central World (`CTW`), prefix `PO-CW-2026-`, starting number 1, width 4, zero-padded.
- The GIS PO preview rejected the selected voucher with `voucher_id must be an active Purchase_order voucher`. No PO passed preview and no PO was created. No approval or inventory receipt was performed.
- Next dependency: GIS MCP must return the newly created voucher as an active `Purchase_order` voucher usable by `preview_purchase_order`; then retry the 10 PO requests sequentially.
