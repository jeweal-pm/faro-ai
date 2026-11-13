# Product image fallback

Date: 2026-11-04

- Added a FaroAI-styled placeholder illustration for products without a usable image.
- Product cards and the options drawer now show the same placeholder when an image URL is missing or fails to load.
- Added the optimized WebP asset at `backoffice/public/images/product-image-placeholder.webp` (768×768, about 11 KB).
- Updated the Backoffice runtime image to include `public/`; verified the first rebuilt container exposed the page but omitted the asset until this packaging fix.
