# Purchase order line image fallback

- Added product imagery to purchase order line cards and table rows, using GIS image URLs when present.
- Missing or failed GIS images now use the shared product placeholder at `backoffice/public/images/product-image-placeholder.webp`.
- Updated `backoffice/app/ProcurementAssistant.tsx` and `backoffice/app/globals.css`.
- Backoffice Docker build passed, including Next.js TypeScript validation; container recreated.
- Runtime checks passed: `http://127.0.0.1:3001/` returned HTTP 200 and the placeholder returned HTTP 200 as `image/webp`.
