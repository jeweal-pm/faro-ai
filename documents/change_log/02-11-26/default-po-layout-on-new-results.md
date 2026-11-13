# Default PO layout on new results — 02-11-26

- Kept product cards as the default PO line-item presentation.
- Reset the view to product cards whenever GIS returns a fresh PO result, so a prior table selection does not carry over to the next search.
- The view toggle still lets the user switch the displayed result to a table.
- Updated `backoffice/app/ProcurementAssistant.tsx`; fresh PO results reset to cards. Set the backoffice build script to use Webpack because Turbopack cannot resolve this checkout's Windows pnpm-linked packages (`@swc/helpers`, `scheduler`; unsupported reparse point).
- `pnpm --filter backoffice typecheck` passed, and the production build completed with Webpack.
- Related decision: [ADR-0034](../../adr/0034-configurable-procurement-conversation-context.md).
