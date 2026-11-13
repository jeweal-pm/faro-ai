# Customer import sample data — 12-11-26

- Added 200 synthetic customer rows to `example-prompt/Customer_Import_Sample_1794457585671.csv` for a total of 201 data rows, including the original walk-in example.
- Kept the existing 40-column header and Excel-compatible date formula format. Sample email addresses use the reserved `.invalid` domain; contact details and customer profiles are fictional.
- Verified the CSV parses as 201 rows with 40 columns each and normalized line endings to CRLF.
- Added 40 more synthetic customer rows with Indian nationality, India country fields, calling code 91, Indian state/city samples, and non-routable placeholder phone values. The CSV now contains 241 data rows; all rows retain the same 40-column schema and `.invalid` email domain.
- Added 20 more synthetic customer rows with Chinese nationality, China country fields, calling code 86, sample province/city values, and non-routable placeholder phone values. The CSV now contains 261 data rows with the same schema and `.invalid` email domain.
