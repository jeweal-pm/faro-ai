# Functional Discovery preference tags — 02-11-26

- Selected chips now remain visible/removable and the preference panel stays available after results; the prompt is resubmitted explicitly to refresh results.
- Added typed filters for metal separately from metal color, mapped jewelry types, and complete USD budget ranges with currency isolation; selected facets also reach Jev/live GIS in query text.
- Live MCP receives only filter keys allowed by its advertised schema. Updated [ADR-0043](../../adr/0043-functional-discovery-preference-tags.md) and [search spec](../../spec/structured-product-search-constraints.md).
- Clicking preference chips now writes one editable, ready-to-submit natural-language prompt directly into the search field. Adding/removing chips regenerates the prompt, and clearing the final chip restores the text that was present before chip selection.
