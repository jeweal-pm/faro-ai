# Product result presentation — 12-11-26

- Request: when a catalog search returns product cards, show the product list without the redundant AI prose block above it.
- Changed `backoffice/app/discovery-page.tsx` to hide `answer.answer` only when product results are present; text-only answers remain visible when no products are returned.
- Scope: FaroAI Backoffice discovery UI only. No GIS frontend, API, search behavior, or product data changes.
- Verification: `docker compose build backoffice` passed (including Next.js TypeScript compilation); recreated only the Backoffice container; `http://127.0.0.1:3001/` returned HTTP 200. The superseded image was already absent after the build.
