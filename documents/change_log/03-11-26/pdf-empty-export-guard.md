# Reject empty PO exports — 03-11-26

- The artifact pipeline accepted an empty `rows` array and marked the resulting title/header-only PDF complete.
- Backoffice now refuses to create a document when no PO line items are loaded, and the Gateway and renderer reject empty row sets as a second guard.
- Updated the Thai and English Base Skills specs to require at least one data row in exports.
