# 2026-11-10 — FaroAI AI business-document import plan

- Reviewed existing Base Skills, PDF export/revision, RAG learning and GIS PO workflow decisions.
- Created a Thai product discovery brief and reader-friendly HTML proposal for variable-layout business-document classification, extraction, review and GIS import.
- Recommended validate-first discovery and reusable staged-import architecture. Supplier quotation to GIS PO preview is only a technically convenient option; BD/PO did not select a first commercial pilot without evidence. Identified PU as undefined and listed decisions needed before implementation.
- Documented provenance per extracted field, deterministic validation, GIS authority, human review/confirmation, tenant safety, retention, no automatic RAG/training, phases, evaluation metrics and ownership.
- Existing system does not currently import arbitrary business files; current artifact export/revision uses FaroAI-generated/loaded PO data and knowledge upload accepts text. The proposal preserves those boundaries.
- No code, ADR, GIS data, container or deployment was changed.
- BD/PO product discovery contract was followed. Both recommend `validate_first`. An incoming supplier quotation to PO preview is only a technically convenient pilot candidate, not a commercially validated choice. The reviewed project records establish no demand, willingness-to-pay or commercial targets; PU meaning, document direction/type and sample documents remain sponsor decisions.

## เพิ่มเติมจากการคุยกับ Sponsor — 10-11-26

- ขยายแผน HTML/Markdown ให้ครอบคลุมการเลือกเส้นทาง PDF ที่มี text layer, PDF สแกน/ผสม และภาพแนบ; OCR เฉพาะหน้าที่จำเป็น และถามผู้ใช้เมื่อยังแยกภาพเอกสารกับภาพสินค้าไม่ชัด
- ระบุแนวทางคุมต้นทุน: text extraction ก่อน, OCR ตามจำเป็น, Jev เลือก model ตามราคา/ความยาก, escalate เฉพาะ field/page ที่ไม่แน่ใจ; อธิบายว่า OCR กับ embedding คนละหน้าที่และการ import ธุรกรรมไม่ต้อง embed อัตโนมัติ
- เพิ่มแนวคิด OCR เป็น container/service ที่จำกัด resource; sizing เริ่มต้นประมาณ 2 vCPU/4 GB และ concurrency 1 เป็นเพียงค่าทดลองรอ benchmark ไม่ใช่ production guarantee
- เพิ่มคิวแบบ fair scheduling แยก tenant และ bounded worker/concurrency เพื่อรองรับ bulk โดยไม่ให้ 1 tenant ผูก worker ทั้งหมด
- เพิ่มการจำ correction สองระดับ: alias/layout mapping ภายใน tenant และ shared pattern แบบ de-identified ที่ปิดโดย default และต้อง opt-in; ห้ามนำ transactional values หรือเอกสารต้นฉบับเข้าความรู้กลาง และ Qdrant ใช้เฉพาะเมื่อมี retrieval requirement ที่ได้รับอนุญาต ไม่ใช่การฝึก model
- ซิงก์รายละเอียดใน HTML และ Markdown discovery artifacts; ไม่มีการแก้ code, ADR, GIS data หรือ deploy
- Sponsor ยืนยันว่า PU หมายถึง Purchase; ปรับ HTML/Markdown และรายการคำถามให้คงเหลือการเลือกชนิดเอกสาร Purchase กับทิศทางนำเข้า โดยไม่ถือว่า PU เป็นคำที่ยังไม่ทราบแล้ว
- เพิ่ม threat controls สำหรับ PDF/image ที่อาจมี active content, parser exploit, resource-exhaustion payload หรือ prompt injection: signature/MIME validation, limits, patched sandboxed parser, no egress, PDF safe preview, image re-encoding, fail-closed review และ schema validation; ระบุว่า malware scan อย่างเดียวไม่เพียงพอ
- เพิ่ม requirement ว่าระบบต้องขยายและเรียนรู้ชนิดเอกสารได้หลากหลายผ่าน Document Type Registry พร้อม taxonomy ตัวอย่างในกลุ่ม Purchase, inventory movement, sales และ finance; ระบุ schema/version, alias, validation, evidence, evaluation, GIS mapping และระดับความสามารถที่ต้องเปิดแยกกัน
- นิยามการเรียนรู้เป็น tenant-scoped alias/layout hints จาก correction ที่ผู้ใช้ยืนยัน; registry/schema/support status ต้อง review และผ่าน evaluation ก่อนเลื่อนสถานะ ไม่ฝึกหรือเปิด GIS write จากไฟล์ดิบอัตโนมัติ

## Implementation — secure review-only intake foundation

- Added gateway routes for the versioned document-type registry, bounded one-file upload, tenant/actor-scoped job status, safe encrypted preview, review corrections, and explicit deletion. All registered types remain OCR-only and declare classification, structured extraction, and GIS operations unsupported.
- Added feature-flagged config contract with dedicated encrypted source/preview roots, authenticated session/API scopes, explicit per-upload consent, server-derived actor identity, and bounded source retention cleanup. The API fails closed unless the isolated worker heartbeat is fresh and encryption/storage configuration is valid.
- Exposed the configured fixed retention periods in the document-type registry response before upload consent, and preserved bounded worker error codes plus OCR truncation indicators for review UI messaging.
- Limited language hints to `auto`, `en`, and `th`, matching the current UI and OCR worker contract. Explicit deletion now immediately hides/clears document content, records a minimal content-free audit event, removes source bytes when possible, and signals the isolated worker to remove read-only-to-API previews while retaining a minimal tombstone.
- Added migration `infra/postgres/migrations/021_business_document_intake.sql` with the tenant-scoped job table, worker heartbeat, limited worker grants, lowercase SHA-256 digest, source/review expiry, preview cleanup marker, correction audit, and minimal metadata retention. Worker has no job deletion permission.
- Storage contract: `FAI1` + AES-256-GCM nonce/ciphertext/tag, object-specific tenant/job AAD, and dedicated source/preview roots. Generated artifact storage is not reused. No GIS/MCP writes or external model calls are in this slice.
- Changed files: `gateway/src/document-import.ts`, `gateway/src/index.ts`, `gateway/src/admin.ts`, and `infra/postgres/migrations/021_business_document_intake.sql`.
- No tests/builds or deployment were run. Compose/runtime wiring and UI are being coordinated separately; the feature remains disabled by default until the required isolated worker/profile is configured.
