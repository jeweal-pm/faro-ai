# Document upload from the main chat

- Moved the business-document attachment entry point into the main chat composer; selecting a PDF, PNG, or JPEG and pressing Send now starts the existing tenant-scoped OCR job.
- Replaced the separate `/document-import` screen with a redirect to the main chat. OCR status and recognized text are shown inline; deleting the inline result uses the existing tenant-authorized delete API.
- The composer discloses per-upload local OCR scope and configured retention before Send. The current OCR slice does not interpret attached prompt text with an AI model, call external providers, write GIS, or add training/RAG data.
- Shortened the pre-send disclosure to a single line with OCR scope and retention; the note about unsupported AI interpretation appears only when the user adds message text.
- Updated `documents/spec/business-document-intake.md` to document the single chat entry point and explicit Send authorization.
- Verification: the follow-up Docker build passed, including TypeScript validation. Updated Backoffice is running; `/` returned HTTP 200 and `/document-import` returned HTTP 307 to `/`. The replaced image is no longer retained; host free space remained 138 GB.
- Host pnpm verification was unavailable because the existing pnpm virtual store lacked `lucide-react`; an offline install attempt downloaded zero packages and stopped. The Docker build reused its dependency layer and completed successfully.
