# Procurement search: surface GIS MCP outages

Date: 2026-11-02

## Change

- Procurement requests now report a temporary GIS MCP connection failure when the live MCP tool catalog cannot be read.
- Safe error logging unwraps MCP async exception groups to retain the HTTP or connection error class without logging endpoint credentials or response bodies.
- The Backoffice response explains that PO data was not checked and asks the operator to restore the MCP server/tunnel before retrying.

## Evidence

- The failed request reached `/internal/v1/procurement/assistant` but failed before intent routing or PO search.
- AI service logs show `POST https://eatery-overpass-scaling.ngrok-free.dev/mcp` returned HTTP 502 while `list_approved_mcp_tool_specs` requested the MCP tool catalog.

## Scope and safety

- No GIS records were created, updated, approved, or received.
- PO status filtering and approved PO data were not reached because GIS MCP was unavailable.
