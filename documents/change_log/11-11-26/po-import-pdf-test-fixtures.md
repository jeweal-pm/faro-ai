# PO import test PDF fixtures — 11-11-26

- Added five one-page, text-layer PDF fixtures in `user-check/po-import-samples-standard/` with varied header, section, and table layouts.
- Each fixture uses an existing GIS supplier, product names/SKUs, Central World delivery location, and THB prices from the established test samples; document references and phone numbers are synthetic placeholders.
- Included supplier, buyer, and delivery country/phone fields. Tax is explicitly unspecified and instructs the importer to match an active GIS tax master instead of inventing one.
- Confirmed each PDF opens as a one-page A4 document and that `pdftotext` reads its key country, phone, location, line-item, and total fields. Visually reviewed variants 01 and 04.
- No PDF was uploaded, and no PO or other GIS record was created or modified.
