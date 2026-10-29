# SPEC: Discovery shopping journey

- **Status:** Implemented
- **Date:** 2026-10-14
- **Decision:** [ADR-0018](../adr/0018-discovery-shopping-journey.md)
- **Related:** [Live MCP product search](live-mcp-product-search.md)

## Search entry

- Show a wide prompt bar with the placeholder “I'm shopping for...”, clear, voice, and gradient submit controls.
- Keep optional preference categories below the prompt: recipient, occasion, jewelry type, metal, gemstone, style, budget, theme, color, size, wear/lifestyle, and avoid.
- The shopper can submit a natural-language prompt without choosing any category. Selecting preferences refines the request; clearing a selected chip returns it to an unselected state.
- Preserve chat-processing consent and optional improvement/training consent controls.

## Product results

- Render verified search results in a white, responsive card grid with product image where supplied, product name, SKU, price/currency where valid, availability, a plus button, and MCP source attribution.
- On desktop, use four columns. Reduce to three columns on medium screens and two on mobile.
- Show a “Showing (N)” count and an “In stock only” checkbox. Filtering to zero in-stock products shows a clear empty state.
- Use the CI gradient from indigo blue to aqua teal on the search border and selected controls, with a pale lavender/mint page background.

## Product options drawer

- Clicking the plus button opens a right-side drawer with close control, product thumbnail, name, SKU, and metal, gemstone, and size selectors.
- The selector state is temporary and client-only until GIS exposes verified variants.
- `Add to Order` remains a no-op: it does not navigate, mutate data, reserve stock, or imply an order was placed.

## Acceptance criteria

- [x] Prompt-only search remains available; preference categories are optional.
- [x] Search/results use the supplied reference layout and blue-to-teal gradient.
- [x] Product cards render the verified MCP result fields in a responsive grid.
- [x] Plus opens a product options drawer; close and local selectors work.
- [x] Add to Order performs no action.
