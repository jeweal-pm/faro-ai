# FARO Test floating launcher and standalone route

- Date: 2026-11-09
- Project: `jw-gis-frontend`
- Show the FARO Test launcher as a fixed bottom-right icon on `/app/*` pages when the current URL has `?farotest=true`.
- Open the FARO Test page through an app-level route so users do not need to enter the POS module or its layout first.
- Remove the test page's redirect to `/app/pos/`; retain the previous test URL as a standalone compatibility route.
- Give the standalone page its own viewport sizing instead of relying on the POS page shell.
- Preserve the originating app URL and navigation state so closing the test page returns to the page that opened it.
- Remove the test launcher from shared headers to avoid duplicate placement.
- Give the standalone page a separate session bucket so it opens as its own FARO page instead of restoring a prior POS search session.
- Keep existing FARO shortcuts on their current POS search flow; the floating test launcher is the separate entry to the new page.
- Temporarily render the standalone route as a blank page, with no FARO Search component or API requests, to isolate and stop the remaining redirect.
- Reconnect the isolated test screen to the GIS FaroAI chat proxy using the tenant's server-stored credentials; keep the client secret and access token out of the browser.
- Keep the generated prompt and selected facets in the chat request state. When FaroAI already returns an empty-match answer without products, do not render a second generic empty-catalog message beneath it.
