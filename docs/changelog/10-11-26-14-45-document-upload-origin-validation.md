# Allow the browser's actual same-origin upload host

- Fixed the document mutation origin guard for Docker and reverse-proxy requests where Next.js sees an internal request URL.
- It now accepts only configured/internal same origins or the incoming host with matching protocol, and still requires tenant CSRF validation.
- Updated [business-document-intake.md](../../documents/spec/business-document-intake.md).
- Verification: Docker Backoffice build and TypeScript validation passed; container restarted and `/` returned HTTP 200. Replaced image was removed. Authenticated browser upload was not available for end-to-end verification.
