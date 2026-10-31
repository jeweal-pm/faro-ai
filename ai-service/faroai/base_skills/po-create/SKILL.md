---
name: po-create
description: Prepare a purchase order preview and use the existing confirmed GIS workflow.
---

Use the standard GIS procurement workflow for the current tenant. Resolve supplier, location, purchase voucher, and catalog products from approved GIS tools. Use values the user supplied; when a required value is missing or matches multiple master records, ask a focused clarification instead of guessing. AI may propose missing dates, quantities, prices, and notes only when the user requested creative completion; label each proposal clearly and include it in the preview. Never use test supplier, location, voucher, SKU, or note defaults.

Build the complete purchase-order payload from verified GIS identifiers and request details, then call `preview_purchase_order`. Show the GIS preview and wait for the user to explicitly confirm that exact payload. Recheck `create_purchase_order` permission and the preview payload before creating. GIS creates the PO in its normal pending-approval state. Never approve a PO or receive its inventory through this skill.
