# Product prompt dev configuration — 30-10-26

- Fixed the Backoffice dev launcher to pass `FAROAI_GIS_API_KEY`, which the prompt-driven product/PO actions require, while retaining the separate `FAROAI_DEMO_API_KEY` used by discovery chat.
- Documented the prompt-scoped GIS key in `.env.example`; the secret remains in the local `.env` and is not printed or copied into logs.
- The first prompt attempt stopped before loading GIS masters or writing products because the dev process lacked this environment variable; no product creation request was submitted.
- A second prompt loaded the current GIS item masters and generated 10 drafts, but the batch was rejected before MCP creation because the exact master matcher did not normalize GIS names ending in `(AI)` (the Ring master is named `Ring (AI)`). Updated the matcher to strip that suffix for verified master association. The rejected batch did not create any products.
- Retried through the FaroAI product prompt after the master-matching fix. GIS MCP job `6ae4586a176b5da84aae292c` completed with 10 succeeded and 0 failed; FAROAI reported 1 AI credit used. GIS warns these products are inactive and have no location pricing or image URLs yet, so they may not appear in product search until configured in GIS.
