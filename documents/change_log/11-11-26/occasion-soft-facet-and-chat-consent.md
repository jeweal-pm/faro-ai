# Occasion search and FARO chat consent

**Date:** 11-11-2026

- Fixed soft-only discovery searches in `ai-service/faroai/app.py`: Occasion, recipient, Theme, Size, and Wear/Lifestyle prompts now request a bounded general candidate set from GIS when no hard filter is active, allowing Jev to rank verified candidate IDs instead of searching phrases such as `birthday` as required product text.
- Preserved the existing hard-filter boundary: when GIS filters such as item, metal, gemstone, color, style, price, or exclusions are present, the original catalog query and verified filters remain in force. No broader unfiltered fallback was added for a hard constraint.
- Updated `documents/spec/structured-product-search-constraints.md` to document soft-only candidate browsing and its limits. Occasion is not stored as a GIS product attribute; no fabricated product/master record was added.
- Added focused unit coverage in `ai-service/tests/test_discovery_soft_facet_query.py`.
- Rebuilt only the `ai-service` image and recreated its container. The replacement is healthy (`/health/ready` returned `{"success":true}`); the prior image no longer appears in the local image list. Disk remained at 134 GB free.
- Retested all five previously empty Occasion values against the rebuilt live service. Each returned 8 GIS candidates with Jev decision and ranking enabled. No GIS products or master records were created.
- Updated the Markdown and HTML FARO tag-sweep reports with the focused retest and current consent behavior.
- GIS frontend consent behavior was updated by the GIS frontend agent in `jw-gis-frontend/src/pos/catalog/faroTest/FaroTestPage.js`: required chat-processing consent is saved for the current browser tab/session, can be withdrawn by unchecking, and no longer resets after each search. Optional knowledge-improvement consent and document OCR consent remain separate and non-persistent. GIS frontend changelog: `jw-gis-frontend/docs/changelog/11-11-26-faroai-session-chat-consent.md`.
