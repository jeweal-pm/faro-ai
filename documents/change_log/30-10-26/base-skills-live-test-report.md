# Base Skills live test report — 30-10-26

- Tested existing KT data via the FaroAI frontend without creating products, POs or inventory; discovery and model tests may create normal platform credit/accounting events.
- The `ring` frontend query displayed eight GIS MCP products and service logs confirmed Jev and MCP calls. A separate equivalent gateway request returned `decision_used=true` but `base_skill=null`; this does not prove the frontend query activated the jewelry Base Skill.
- A read-only pending-PO query was blocked because `create_purchase_order` is not approved; read access should not depend on enabling a write tool. No permission was changed.
- A knowledge query produced a zero-product UI with a four-source note but did not display an answer. A separate gateway request activated `base.knowledge-answer` and returned four sources and product-description text, not verified return-policy evidence.
- PDF report in `output/pdf/` records the test evidence, limits and recommended fixes. The PDF is produced by Codex tooling, not by FaroAI's disabled artifact feature.
- Follow-up on 30-10-2026: read-only PO search is now independent of `create_purchase_order` and `receive_inventory`. The live UI returned PO-32 for Ham, pending approval, with 100 lines and no write action.
- Follow-up tests: all 21 AI-service unit tests passed, covering PO read/write separation, catalog draft skill loading and inventory receive skill loading. Jev selected `base.jewelry-search` in a live API request. The policy query displays a no-verified-match answer instead of presenting a raw retrieved document as fact.
- `base.catalog-create` and `base.inventory-receive` now load their registered instruction packages in the existing draft and confirmation-gated procurement flows. The release catalog has five ready skills out of eleven; the other six remain planned and disabled.
- Follow-up `ring` check: the connected GIS MCP advertised `search_products` with `query` required and `language` optional, and returned a schema-valid empty product list. This remains a GIS catalog/result issue; no parser or permission error was found.
- The historical PDF above was preserved. The updated follow-up PDF contains these observations and the current five-of-eleven skill readiness.
