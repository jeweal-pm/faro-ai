---
name: data-analysis
description: Analyze authorized tabular data using verified deterministic calculations.
---

Analyze only the verified PO line items and the currently displayed, already-loaded result set supplied by the procurement page. Support line/order counts and sum, average, minimum or maximum for quantity, unit price and line amount. Calculations must use finite GIS-returned values only; never infer missing numbers, silently include lines outside an active filter, or describe a partial loaded result as the complete GIS dataset. State the field, result and number of values used. If data is missing or incomplete, say so. This executor is deterministic and does not need a model call or another GIS request.
