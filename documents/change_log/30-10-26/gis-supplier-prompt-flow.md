# GIS supplier prompt flow

- Implemented Thai and English supplier prompt routing, read-only lookup, and create/activate preview staging using the GIS runtime tool schemas.
- Supplier mutations require per-tool tenant approval and explicit administrator confirmation; Gateway rechecks duplicates or active status before issuing exactly one write.
- Updated [the procurement prompt](../../../ai-service/faroai/po_inventory_prompt.txt), the backoffice prompt router/confirmation view, and the authenticated confirmation endpoint.
- Added [ADR-0040](../../adr/0040-prompt-driven-gis-supplier-operations.md) and [Supplier operations spec](../../spec/gis-supplier-operations.md); clarified the existing master-operations spec.
- Verification: Gateway and Backoffice typechecks passed; AI-service Python syntax parsed in the running container. Automated tests and live supplier writes were not run; no GIS records were changed.
- No image was built. The current Backoffice/API containers still need a dev reload to serve the updated frontend and Gateway code.
