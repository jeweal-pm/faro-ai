# Hide prose when catalog products are shown

- Updated `backoffice/app/discovery-page.tsx` so product cards are shown without the redundant prose answer above them.
- Text-only answers remain visible when no products are returned.
- `docker compose build backoffice` passed, including Next.js TypeScript compilation; the recreated `backoffice` container serves HTTP 200 on port 3001.
- Related request: FaroAI catalog result presentation; no API or GIS frontend changes.
