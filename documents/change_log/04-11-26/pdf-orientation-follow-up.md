# Prompt-controlled PDF orientation

Date: 2026-11-04

- Added constrained portrait/landscape extraction for PDF export follow-ups, including the user's `portarit` spelling.
- Excluded PDF layout wording from PO search-scope detection so a layout-only request is handled as a document follow-up or a local scope clarification, not as an unrelated Jev procurement prompt.
- Passed orientation through the artifact API and applied it in the PDF renderer while preserving the automatic default.
- Recorded the decision in [ADR-0046](../../adr/0046-prompt-controlled-pdf-orientation.md) and behavior in [SPEC](../../spec/pdf-export-layout.md).
- Verification: Backoffice/API/worker images built; services restarted. The exact prompt `I need portarit pdf design` resolves to `portrait` and is not misclassified as a PO scope. A 9-column A3 sample PDF reports portrait dimensions while retaining its row text; a landscape sample reports landscape dimensions.
