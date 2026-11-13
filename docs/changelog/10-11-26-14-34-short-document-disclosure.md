# Shorten document upload disclosure

- Replaced the long multi-clause attachment warning with one line for local OCR scope and configured retention.
- Only show the AI-analysis limitation before send when the user typed a message; state OCR-only/no GIS changes in the result card.
- Updated FaroAI change log. Requirement: [business-document-intake.md](../../documents/spec/business-document-intake.md).
- Verification: Docker Backoffice build and TypeScript validation passed; container reloaded and `/` returned HTTP 200. The legacy route redirects to `/`; replaced image removed, 138 GB host space free.
