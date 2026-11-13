# FaroAI search from GIS FARO test page

- Date: 2026-11-09
- Projects: `jw-gis-frontend`, `jw-gis-backend`, FaroAI
- Connect the isolated GIS FARO test page to the existing FaroAI tenant integration, keeping API credentials and short-lived bearer tokens server-side.
- Support text prompts, selected jewelry preferences, optional JPEG/PNG/WebP reference images, and browser speech transcription through the tenant-scoped server proxy.
- Use explicit end-user AI chat consent and tenant-scoped authorization for each search request.
- Follow the FaroAI discovery layout while retaining the copied GIS FARO accent colors in the FARO test page's own stylesheet; keep SMART SEARCH components and styles unchanged.
- Fix generic preference searches such as “Find jewelry for my wife”: GIS removes instruction/recipient-only words and returns a bounded catalog browse when no concrete product term remains. FaroAI can route a Jev-classified product request to the sole approved `search_products` source if Jev omits a usable route; it still does not guess among multiple sources.
- Avoid showing a duplicate generic empty-results line when FaroAI already returned a specific no-match answer.
- No end-to-end UI search was run for this fix. Backend syntax check passed; the generic browse acceptance criterion remains pending live verification.
