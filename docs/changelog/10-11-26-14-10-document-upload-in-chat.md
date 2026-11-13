# Document upload in chat composer

- Integrated PDF/PNG/JPEG selection and upload with the existing chat composer send action.
- Shows retention/scope notice before send and OCR status/text inline; redirects the old standalone import route back to the chat.
- Updated the business-document intake spec and FaroAI change log. No database/API contract changes.
- Verification: `docker compose build backoffice` passed, including Next.js TypeScript validation. Updated container is running; `/` returned HTTP 200 and `/document-import` returned HTTP 307 to `/`. Superseded Backoffice image removed after activation.
- Host pnpm verification could not run because its existing pnpm store lacked `lucide-react`; offline install downloaded zero packages and stopped. Docker reused its existing dependency layer.
- Requirement: [business-document-intake.md](../../documents/spec/business-document-intake.md).
