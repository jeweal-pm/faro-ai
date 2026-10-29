# Discovery shopping experience

Date: 14-10-2026 (Asia/Bangkok)

## Delivered

- Reworked Discovery search to match the supplied reference: blue-to-teal gradient prompt, optional shopping preference tabs, and the product results grid with an in-stock filter.
- Added responsive product cards with verified MCP images, names, SKUs, prices, and availability where supplied.
- Added the plus-button side drawer with product details and local metal, gemstone, and size selectors.
- Kept `Add to Order` intentionally inert. No order or inventory change is sent.
- Added ADR-0018 and the Discovery shopping journey SPEC.
- Freed local space before editing by pruning unused pnpm store entries and clearing npm cache. C: now has about 1.0 GiB free.

## Boundaries

- GIS currently provides product records rather than structured variant options. Drawer selectors are local presentation state and are not verified catalog availability.
- No Docker image was rebuilt.
