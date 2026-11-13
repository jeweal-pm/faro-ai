# ข้อเสนอ: นำเข้าเอกสารธุรกิจด้วย AI ใน FaroAI

- **วันที่:** 2026-11-10 (Asia/Bangkok)
- **สถานะ:** `validate_first` — เหมาะสำหรับออกแบบและเก็บหลักฐานก่อนกำหนดขอบเขตพัฒนา
- **ผู้ใช้หลัก:** ทีมจัดซื้อ บัญชี และคลังสินค้าของ tenant
- **ผู้จ่ายเงินที่คาดหมาย:** ธุรกิจอัญมณี/ค้าปลีกที่เป็น tenant ของ FaroAI (สมมติฐาน รอ BD ตรวจสอบ)
- **เอกสารอ่านง่าย:** [เปิดเวอร์ชัน HTML](2026-11-10-ai-business-document-import.html)
- **เอกสารที่เกี่ยวข้อง:** [ADR-0036 Base Skills](../../adr/0036-platform-base-skills.md), [ADR-0026 GIS procurement](../../adr/0026-natural-language-gis-procurement.md), [ADR-0047 document revisions](../../adr/0047-prompt-driven-document-revisions.md), [Base Skills spec](../../spec/platform-base-skills.md), [RAG Learning spec](../../spec/tenant-scoped-rag-learning.md)

## ข้อเสนอร่วม

ออกแบบระบบเป็น **AI-assisted document intake and verified draft**: อ่านไฟล์ที่ layout แตกต่างกัน ระบุชนิดเอกสาร แยกข้อมูลเป็น schema กลางพร้อมหลักฐานอ้างอิง ตรวจค่ากับกฎและ GIS แล้วแสดงหน้าตรวจทานก่อนทำรายการจริง

AI ไม่ควรเป็นผู้สร้างความจริงทางธุรกิจหรือเขียน ERP ทันที การนำเข้าข้อมูลต้องแยกจากการสร้างรายงาน และใช้ authorization, GIS preview, explicit confirmation และ single-use write flow ที่มีอยู่แล้วเมื่อเชื่อมกับการเขียน GIS

BD และ PO เห็นตรงกันที่ `validate_first` ยังไม่มีหลักฐานตลาด/ตัวอย่างที่ยืนยันว่า PO หรือ quotation มีมูลค่าธุรกิจสูงกว่ากัน จึงไม่สรุป willingness-to-pay, ROI หรือเป้ารายได้ สถาปัตยกรรม staged import ใช้ร่วมกันได้ แต่ **ยังไม่เลือก pilot document type/direction**; supplier quotation → GIS PO preview เป็นเพียงทางเลือกเชิงเทคนิค ไม่ใช่ข้อเลือกด้าน commercial value

## กลุ่มเป้าหมายและปัญหา

- **ผู้ใช้:** เจ้าหน้าที่จัดซื้อ/บัญชี/คลังสินค้าที่ต้องอ่านเอกสาร supplier แล้วพิมพ์ข้อมูลซ้ำใน GIS
- **ผู้จ่ายเงิน:** เจ้าของหรือผู้ดูแลระบบของธุรกิจที่เป็น FaroAI tenant (สมมติฐาน ต้องให้ BD ยืนยัน)
- **ผู้ได้ประโยชน์:** ผู้อนุมัติ PO, ทีมบัญชี และทีมคลังสินค้า ซึ่งได้ข้อมูลที่ตรวจสอบย้อนกลับและลดงานคีย์มือ
- **งานที่ต้องแก้:** เอกสารมีรูปแบบต่างกัน อาจเป็น PDF ที่สร้างจากระบบ, สแกน, รูปถ่าย หรือ spreadsheet; ชื่อสินค้า หน่วย สกุลเงิน และเลขอ้างอิงอาจไม่ตรงกับ GIS

## สมมติฐานคุณค่าธุรกิจที่ต้องพิสูจน์

- **สมมติฐาน:** ลดเวลาคีย์ข้อมูลซ้ำและจำนวนข้อผิดพลาดเมื่อต้องเทียบเอกสาร supplier กับ GIS; ยังไม่มี baseline หรือหลักฐาน willingness-to-pay
- **วิธีตรวจ:** คุยกับ tenant ที่ใช้ GIS จริง ขอเอกสารตัวอย่างที่ได้รับอนุญาต แล้วจับเวลางานปัจจุบันเทียบกับเวลา review ที่มี AI ช่วย พร้อมนับ correction/exception
- **ต้นทุนที่ต้องนับ:** OCR ต่อหน้า, model inference, storage/retention, integration/GIS calls, human review, support และการจัดการ exception
- **การตั้งราคา:** ยังไม่กำหนด; ค่อยเปรียบเทียบ bundled tier กับคิดตามจำนวนหน้า/เอกสารหลังทราบ cost-to-serve และ willingness-to-pay

## สิ่งที่มีแล้วและช่องว่าง

**มีแล้ว:** FaroAI สร้าง PDF/DOCX/XLSX จากข้อมูล PO ที่แสดงในแชท, แก้ layout ของเอกสารที่ FaroAI สร้าง, รับข้อความความรู้เพื่ออนุมัติเข้า tenant RAG และมี GIS flow สำหรับค้น/preview/confirm PO โดยใช้ master จาก GIS

**ยังไม่มีตามสเปกที่ตรวจ:** การอัปโหลด PDF/ภาพ/Office เพื่อจำแนกและดึงข้อมูลธุรกรรม รวมถึงการสร้าง GIS draft จากข้อมูลที่อ่านได้ การแก้ arbitrary uploaded PDF ก็อยู่นอกขอบเขตของ ADR-0047

**PU หมายถึง Purchase** ตามที่ Sponsor ยืนยันแล้ว อย่างไรก็ตาม ยังต้องเลือกชนิดเอกสารฝั่ง Purchase และทิศทางที่จะนำเข้า (เช่น quotation จาก supplier เข้า FaroAI หรือเอกสารที่สร้างใน GIS ส่งเข้า FaroAI) ก่อนออกแบบ schema/operation เฉพาะชนิด

## Flow ที่เสนอ

1. ผู้ใช้แนบ PDF หรือภาพผ่านปุ่ม attachment ในแชท ภายใต้ tenant/session ที่ยืนยันตัวตนแล้ว
2. ระบบตรวจนามสกุลเทียบกับ file signature, MIME จริง, ขนาด, จำนวนหน้า, ความเสียหาย/เข้ารหัส, archive expansion และ malware; ปฏิเสธไฟล์ไม่ปลอดภัย
3. เก็บไฟล์ในพื้นที่ quarantine แบบ private และผูก tenant, actor, hash, retention/deletion policy; สแกน/ถอดข้อความ/OCR โดย parser ที่จำกัดทรัพยากร
4. Classifier คืนชนิดเอกสาร, ทิศทางเอกสาร, ภาษา, confidence และทางเลือก; หากไม่มั่นใจหรือชนิดไม่รองรับ ให้ผู้ใช้เลือกหรือหยุดแบบชัดเจน
5. Extractor แปลงเป็น typed schema ตามชนิดเอกสาร; ทุกค่ามีข้อความต้นทาง, page/ตำแหน่ง, raw value, normalized value, field confidence และสถานะตรวจสอบ
6. Validator คำนวณผลรวม/ภาษี/จำนวนบรรทัด, ตรวจค่าขาด/ขัดแย้ง/หน่วย, หาเอกสารซ้ำ และเทียบ supplier, product, location, voucher ด้วย GIS read-only tools
7. หน้า Review แสดงไฟล์ต้นฉบับคู่กับตารางข้อมูลที่ดึงได้; ไฮไลต์ค่าความมั่นใจต่ำและความขัดแย้ง ให้แก้ไขและยืนยัน master mapping ได้
8. ผู้ใช้เลือกการกระทำเป้าหมาย ระบบสร้าง GIS preview ผ่าน tool ที่ tenant อนุมัติ; แสดงค่าจากเอกสารเทียบค่าที่ GIS ยืนยัน
9. ผู้ใช้ยืนยัน preview เฉพาะรายการนั้น; gateway ตรวจสิทธิ์และข้อมูลปัจจุบันซ้ำ แล้วใช้ operation ที่อนุญาตแบบ single-use; แสดงผล GIS และ audit reference

## รองรับและเรียนรู้ชนิดเอกสารที่หลากหลาย

ต้องออกแบบ pipeline นำเข้าให้เป็นแกนกลาง และใช้ **Document Type Registry** สำหรับเพิ่มชนิดเอกสาร ไม่ทำระบบแยกเป็นพิเศษทุกครั้งที่เจอแบบฟอร์มใหม่ การรองรับชนิดหนึ่งต้องมี definition/version ของตัวเอง และแยกจากชนิดไฟล์ (เช่น PDF/PNG/JPEG/XLSX/DOCX)

### ตัวอย่าง taxonomy ที่ควรออกแบบให้เพิ่มได้

| กลุ่ม | ตัวอย่างชนิดเอกสาร |
|---|---|
| Purchase | Purchase Requisition, Supplier Quotation, Purchase Order, Purchase Invoice/Tax Invoice, Supplier Credit Note, Supplier Debit Note |
| รับและเคลื่อนย้ายสินค้า | Delivery Note, Packing List, Goods Received Note, Inventory Receipt, Stock Transfer, Stock Count/Adjustment, Goods Return |
| Sales | Sales Quotation, Sales Order, Sales Invoice/Tax Invoice, Receipt/Payment Receipt, Credit Note, Debit Note, Delivery Order |
| การเงินและชำระเงิน | Payment Request, Payment Advice, Remittance Advice, Bank Statement |

รายการเป็น taxonomy เพื่อออกแบบและจัดลำดับงาน ไม่ใช่คำยืนยันว่า GIS มี operation ให้สร้างทุกชนิด ต้องแยกคำที่ชื่อคล้ายกันแต่ความหมายต่างกัน เช่น `Goods Receipt` กับ `Payment Receipt` และแยกชนิดเอกสารออกจากไฟล์แนบ/format

### Definition ต่อ document type

ทะเบียนควรเก็บอย่างน้อย: stable type ID, ชื่อ/alias หลายภาษา, business family และ direction, schema version, required/optional fields, extraction guidance, deterministic validators, evidence requirements, duplicate keys, formats ที่ทดสอบแล้ว, evaluation fixtures, owner, support status และ GIS read/preview/write mapping พร้อม permission

สถานะรองรับต้องแยกเป็นขั้น ไม่ใช้คำว่า “รองรับ” กว้าง ๆ:

1. **Recognized:** จำแนกชนิดได้ แต่ยังไม่รับประกันว่าอ่านครบ
2. **Extractable/reviewable:** มี schema, evidence, validation และผลประเมิน จึงสร้าง draft ให้คนตรวจได้
3. **GIS preview enabled:** มี mapping ไป GIS read/preview tool ที่เกี่ยวข้องและผ่านการทดสอบ
4. **GIS write enabled:** เปิดเฉพาะเมื่อ GIS มี operation จริง, tenant มี permission และมี explicit user confirmation

ถ้าผู้ใช้อัปโหลดชนิดใหม่หรือแก้การจำแนก ระบบอาจบันทึก alias/layout hint ที่ผ่านการยืนยันใน tenant นั้น เพื่อช่วยจำแนกครั้งต่อไปได้ แต่การสร้าง registry entry, เปลี่ยน schema หรือเลื่อน support status ต้อง review และเพิ่ม evaluation fixtures ก่อน ไม่เรียนรู้จากไฟล์ดิบโดยอัตโนมัติ และไม่ทำให้ GIS write เปิดเอง การแชร์ pattern เข้าความรู้กลางยังต้อง opt-in และผ่าน de-identification ตามนโยบายส่วน learning

## รูปแบบข้อมูลกลาง

```text
DocumentImportJob
  tenant_id, actor_id, source_file_hash, private_object_id, detected_type,
  document_direction, language, classifier_confidence, status, created_at

ExtractedField
  field_path, raw_text, normalized_value, confidence,
  source_page, source_bbox, validation_status, user_override

LineItem
  source_description, source_sku, quantity, unit, unit_price, currency,
  tax, line_total, source_evidence[], gis_match_candidates[], selected_gis_id?

ValidationIssue
  code, severity, field_paths[], message, resolution_status

GISDraft
  target_operation, verified_master_ids, preview_payload_hash,
  preview_result, confirmation_actor, idempotency_key, write_outcome
```

`confidence` เป็นสัญญาณช่วยจัดลำดับการตรวจ ไม่ใช่หลักฐานว่าค่าถูกต้อง คะแนนต้อง calibrate จากเอกสารที่ label แล้ว ห้ามใช้ threshold ลอย ๆ เพื่ออนุญาต write โดยไม่มี policy

## หน้าที่ AI กับหน้าที่โค้ด/GIS

| ส่วน | หน้าที่ |
|---|---|
| AI classifier | จัดประเภทจากเนื้อหา/layout พร้อมทางเลือกและ confidence; อนุญาต `unknown` |
| AI extractor | คืน JSON ตาม schema ประเภทนั้น พร้อม page/evidence; ไม่แต่งค่าที่ไม่มีในต้นฉบับ |
| โค้ด validator | ตรวจ type, required fields, arithmetic, duplicate hash, limits, formats, consistency |
| GIS MCP | ยืนยัน Supplier/Product/Location/Voucher/Status/ราคาและ preview จากข้อมูลจริง |
| ผู้ใช้ | แก้ field ที่ไม่ชัด เลือก master mapping และยืนยัน preview ก่อน write |
| Gateway/executor | บังคับ tenant, actor, tool allow-list, permission, cost, idempotency, audit และ confirmation |

AI อาจจัดรูปแบบวันที่หรือยอดที่อ่านได้ แต่ต้องเก็บค่าดิบและแสดง normalization; ไม่เดา SKU/ID, ราคา, quantity, tax, stock, currency หรือสถานะอนุมัติ ถ้า GIS กับไฟล์ไม่ตรงให้แสดงทั้งสองค่า ไม่ overwrite เงียบ ๆ

## PDF, ภาพ และการเลือกเส้นทางประมวลผล

- **PDF ที่มี text layer:** ลองดึงข้อความด้วย PDF parser ก่อน ถ้าข้อความครบและอ่านได้ให้ข้าม OCR
- **PDF สแกนหรือแบบผสม:** ตรวจทีละหน้าและ OCR เฉพาะหน้าที่ไม่มี text layer หรือได้ข้อความไม่พอ ไม่ OCR ซ้ำทั้งไฟล์โดยไม่จำเป็น
- **ภาพที่แนบ:** แยกว่าเป็นภาพเอกสารธุรกิจหรือภาพสินค้า โดยเริ่มจากสัญญาณราคาถูก เช่น text/OCR และรูปแบบหน้า แล้วใช้ model เมื่อยังคลุมเครือ หากยังไม่แน่ใจให้ถามผู้ใช้ว่าจะ import เอกสารหรือค้นหาสินค้า
- เก็บ page/bounding-box evidence ที่ดึงได้ให้ผู้ใช้เปิดกลับไปตรวจค่าต้นทางได้
- OCR แปลงตัวอักษรในภาพเป็นข้อความ ไม่ได้จำแนกความหมายธุรกิจหรือยืนยันข้อมูลใน GIS; การแยกหน้าที่นี้ทำให้เลือก OCR/model ได้ตรงและไม่ส่งงานซ้ำหลายรอบ
- ให้ Jev เลือก model ตามความยากและข้อจำกัดราคา; ใช้รอบเดียวเมื่อทำได้ และส่งต่อเฉพาะหน้าหรือ field ที่ยังไม่แน่ใจให้ vision/model ที่แพงขึ้น

## ต้นทุน OCR, model และ embedding

ต้นทุนควบคุมได้ด้วยลำดับนี้: อ่าน text layer ก่อน → OCR เฉพาะหน้าที่จำเป็น → extract เฉพาะ schema ของ document type → ตรวจด้วย deterministic code/GIS → escalate เฉพาะค่ากำกวม OCR, model inference, storage, review และ GIS calls ต้องวัดเป็นต้นทุนต่อไฟล์และต่อหน้า

OCR กับ embedding เป็นงานคนละชนิด: OCR อ่านข้อความจากภาพ/scan; embedding แปลงข้อความเป็น vector เพื่อค้นความคล้ายและไม่ใช้แทน OCR หรือ structured extraction การนำเข้าธุรกรรมจึงไม่ต้อง embed เอกสารทุกใบ และไม่ควรส่งเอกสารเข้า Qdrant โดยอัตโนมัติ

### OCR worker และการรองรับปริมาณงาน

- แยก OCR เป็น service/container เพื่อกำหนด CPU/RAM/time limits และแยกความเสี่ยงจาก web/API ได้ โดยช่วง pilot ไม่จำเป็นต้องเช่าเครื่องจริงแยก; วางบน Docker host เดียวก่อนได้
- ค่าตั้งต้นเพื่อทดลองเท่านั้น: ประมาณ 2 vCPU, RAM 4 GB, concurrency 1; ปรับจากขนาด/คุณภาพไฟล์, throughput และ p95 queue wait ที่วัดจริง ไม่ใช่ข้อกำหนด production
- 1,000 ไฟล์จาก 100 tenants เข้าคิวได้ ไม่ได้หมายความว่าต้องประมวลผลพร้อมกันทั้งหมด ใช้ global worker limit, fair scheduling แยก tenant, จำกัด concurrent jobs ต่อ tenant ช่วงแรกประมาณ 1–2 งาน และมี queue aging/priority เพื่อป้องกัน starvation
- แสดงสถานะ queued, processing, needs review, completed และ failed; ขยาย worker ตาม queue wait, throughput, resource utilization และต้นทุน ไม่ตามจำนวนงานที่ enqueue อย่างเดียว

## เรียนรู้จากการแก้ไขโดยแยก tenant และคุ้มครองข้อมูล

| ขอบเขต | ข้อมูลที่อาจจำได้ | ข้อจำกัด |
|---|---|---|
| ความจำเฉพาะ tenant | Field aliases, ชื่อหัวคอลัมน์ และรูปแบบเอกสารที่ผู้ใช้แก้และยืนยันแล้ว | แยก tenant และ audit; ห้ามใช้ราคา, จำนวน, SKU, วันที่ หรือค่าธุรกรรมเก่าเป็นค่าของเอกสารใหม่ |
| ความรู้กลางของ FAROAI | Pattern ทั่วไปที่ de-identify และตรวจแล้ว เช่น synonym ของชื่อ field | ปิดเป็นค่าเริ่มต้น; ต้อง opt-in ชัดเจน; ห้ามส่งต้นฉบับ ชื่อ tenant/คู่ค้า SKU ราคา หรือข้อมูลส่วนบุคคลเข้ากลาง |

เก็บ mapping แบบ exact/tenant-scoped ใน relational database ได้ก่อน เพราะค้นตรงและ audit ง่าย ใช้ Qdrant เฉพาะเมื่อมีโจทย์ semantic retrieval ของ pattern ที่อนุมัติแล้วจริง ๆ; การเก็บ pattern เพื่อ retrieval ไม่ใช่การ fine-tune โมเดล

การเรียนรู้ต้องผูกกับผู้แก้/ผู้ยืนยัน/เวลาและ consent ที่เกี่ยวข้อง รองรับการถอน consent และคำขอลบ เมื่อ opt-in กลางถูกปิดต้องหยุดการส่งข้อมูลใหม่ และมีวิธีจัดการข้อมูลที่แชร์ไว้แล้วตาม retention/deletion policy

## ขอบเขต MVP และลำดับงาน

### ระยะ 0 — เก็บหลักฐานและล็อกศัพท์

- เลือกชนิดเอกสาร Purchase ที่ต้องเริ่ม, ทิศทาง (เอกสารจาก supplier หรือเอกสารที่ FaroAI/GIS สร้าง), รูปแบบไฟล์และภาษา; ความหมาย PU ยืนยันแล้วว่า Purchase
- ขอ sample ที่ลบ/ปกปิดข้อมูลส่วนบุคคลแล้ว และทำ gold labels: ชนิดเอกสาร, fields, line items, master mapping, evidence coordinates
- วัด baseline OCR/AI/cost กับชุดจริงก่อนกำหนดเป้าความแม่นยำ

### ระยะ 1 — Pilot: Sponsor เลือก document family/direction

- เริ่มหนึ่ง flow และหนึ่ง typed schema หลัง sponsor ยืนยันเอกสารและทิศทาง; BD/PO ยังไม่เลือกประเภทใดเป็น pilot แรก
- Supplier quotation → PO preview เป็นตัวเลือกทางเทคนิคเพราะต่อกับ flow ปัจจุบันได้ แต่ไม่ได้เลือกเพราะมีหลักฐานคุณค่าธุรกิจสูงสุด
- รองรับ PDF text/scanned และภาพ PNG/JPEG ก่อน; ถ้า flow จริงเริ่มจากเอกสารชนิดอื่นให้ใช้ schema/acceptance ของชนิดนั้นแทน
- รองรับ Thai/English, หลายหน้า, layout หลายแบบ, rotated/poor scan และ `unknown` path
- ดึง header/parties/date/currency/totals/lines พร้อมหลักฐาน, ตรวจยอดและทำ GIS read-only matching
- Review/edit table แล้วต่อไปยัง operation preview ที่ตรงกับ pilot และ GIS MCP รองรับ; write ทำได้เฉพาะตาม permission + existing explicit confirmation
- ถ้า GIS tool/schema ไม่รองรับการทำรายการให้หยุดที่ downloadable/reviewable draft; ห้ามทำ write ทางอ้อม

### ระยะ 2 — เพิ่มชนิดและ format

- เพิ่มชนิดเอกสารผ่าน Document Type Registry หลังแต่ละชนิดมี schema, aliases, fixtures, owner และ operation map; แยกสถานะ recognition, extraction/review, GIS preview และ GIS write
- เพิ่ม XLSX/DOCX แบบ parser แยกชนิด; ตรวจ hidden sheets/rows, formulas, macros และ embedded content ตาม policy
- เพิ่ม tenant-configurable aliases/templates เฉพาะเพื่อช่วย matching; ไม่ใช้ template เป็นข้อบังคับว่า layout ต้องตายตัว

### ระยะ 3 — งานปริมาณมากและการปฏิบัติการ

- batch queue, progress, retry/resume ที่ idempotent, bulk review, exception dashboard, audit/export และ retention automation
- เพิ่ม analytics จาก correction/override ที่ได้รับอนุญาตเท่านั้น โดยไม่ใช้ข้อมูลไปฝึก shared model อัตโนมัติ

## ความปลอดภัย ความเป็นส่วนตัว และการป้องกันข้อมูล

- Tenant/actor ตรวจจาก server session ทุก request; แยก object storage path, encryption key/access policy, job, audit และผลลัพธ์ตาม tenant
- **ตรวจรับไฟล์:** allow-list เฉพาะชนิดที่รองรับ; ตรวจ MIME จริงเทียบ file signature; ปฏิเสธไฟล์ปลอม/ไม่ตรงชนิด, corrupt, encrypted หรือรูปแบบไม่รองรับ; จำกัดขนาด, จำนวนหน้า, pixel, เวลา, memory และ decompression ratio เพื่อกัน zip/decompression bomb และ resource exhaustion
- **แยก parser:** สแกน malware เป็นชั้นหนึ่ง แต่ไม่ถือว่าไฟล์ clean แน่นอน; ใช้ parser ที่อัปเดตใน worker แบบ non-root, isolated, read-only filesystem, ไม่มี network egress และมี CPU/RAM/time limit; ห้าม worker เปิด URL ในเอกสารหรือต่อ GIS/provider เอง
- **PDF active content:** ตรวจและปิด/ปฏิเสธ JavaScript, launch actions, embedded files, forms และ external references ตาม policy; render preview ใน sandbox หรือแปลงหน้าเป็นภาพที่ปลอดภัย; ห้ามเปิดไฟล์ต้นฉบับที่ยังไม่ผ่าน sanitization ใน browser
- **ภาพ:** decode แล้ว re-encode เป็น PNG/JPEG ที่อนุญาตเพื่อตัด metadata และข้อมูลแนบ; ปฏิเสธ SVG และไฟล์ polyglot ใน pilot; จำกัด dimensions/pixel count ก่อน decode เต็มรูปแบบ
- **คำสั่งแฝงในเอกสาร:** ปฏิบัติต่อ OCR/text/image content ทั้งหมดเป็น untrusted input รวมถึงข้อความที่พยายาม prompt-inject ให้เปิดเผย secrets หรือเรียก tool; คั่นเนื้อหาเอกสารจาก system/developer instructions, ไม่ให้ model มี GIS credentials/tools โดยตรง และ validate output ด้วย typed schema กับโค้ดก่อนใช้
- เมื่อพบ active content, parser error, ชนิดไฟล์/เอกสารไม่แน่ใจ หรือผลตรวจขัดแย้ง ให้ fail closed และขอผู้ใช้ตรวจ/ส่งไฟล์ใหม่; malware scan เป็นเพียง defense-in-depth ไม่ใช่การรับรองความปลอดภัย
- ใช้เฉพาะ model/provider ที่ tenant/deployment อนุญาต; แจ้ง data processing/retention และเลือก local model เมื่อ policy ต้องการ; prompt/PII/file contents ไม่ลง logs
- เอกสารไม่เข้า Qdrant, RAG, knowledge, training หรือ shared dataset โดยอัตโนมัติ; การใช้เพื่อสิ่งเหล่านี้ต้องเป็น flow authorization แยกและมี review
- กำหนด TTL, ลบต้นฉบับและ derived OCR/extraction ตามนโยบาย; เก็บ audit metadata เท่าที่จำเป็นและรองรับคำขอลบ
- ป้องกัน duplicate/replay ด้วย content hash, GIS lookup, idempotency key และ single-use confirmation; เมื่อผล write ไม่ชัดให้สถานะ `unknown` และห้าม retry อัตโนมัติ

## ตัวชี้วัดและ evaluation

Baseline และเป้าหมาย **ยังไม่ทราบ**; กำหนดหลังได้ชุดเอกสารตัวอย่างจริง โดยแยกตามชนิด/ภาษา/คุณภาพ scan:

- Document-type top-1 accuracy และ coverage; อัตรา `unknown`/ผู้ใช้เปลี่ยนประเภท
- Exact match/normalized match ของ critical fields; line-item precision/recall และ exact line count/amount
- Evidence coverage: สัดส่วนค่าที่ชี้กลับไปยังหน้า/ตำแหน่งต้นทางได้
- Correction rate, เวลาจาก upload ถึง verified preview, preview rejection และ duplicate detection
- Cost ต่อเอกสาร/หน้า, latency p50/p95, failure/retry rate และสัดส่วนที่ต้อง manual fallback
- **Safety gates:** cross-tenant access = 0, write ก่อน explicit confirmation = 0, invented GIS ID/value = 0

Evaluation ต้องมีตัวอย่างหลาย layout, digital/scanned, ภาพเอียง/เบลอ, multi-page, ภาษาไทย/อังกฤษ, currency/date variants, missing field, conflicting totals, duplicate, malicious instruction ในเอกสาร, wrong tenant, unsupported file และ GIS unavailable

## บทบาทและเจ้าของงาน

| ผู้รับผิดชอบ | งาน |
|---|---|
| Sponsor (ผู้ใช้/ธุรกิจ) | เลือกชนิดเอกสาร Purchase/เอกสาร pilot, อนุมัติ data-processing/retention และการลงทุน |
| BD | ตรวจ segment/ผู้จ่าย/หลักฐาน demand, ต้นทุนสนับสนุนและสมมติฐาน willingness-to-pay |
| PO | กำหนด user flow, scope, acceptance และลำดับ document types |
| FaroAI Engineering | upload/session/job, extractor orchestration, typed schemas, validation/review UI, security/observability |
| GIS MCP team | read/preview/write contracts, field/master mapping และ permission enforcement; ไม่รับผิดชอบ OCR/classification |
| Security/Infra | quarantine storage, malware scanning, worker isolation, retention, encryption และ incident handling |
| Tenant operator | ตรวจ extracted values/mapping และยืนยันแต่ละ GIS preview |

## ประเด็นที่ยังต้องตัดสินใจก่อน implementation

1. **เอกสาร Purchase ชนิดใดและทิศทางไหนเป็น pilot แรก?** BD/PO ยังไม่เลือก; Supplier Quotation → PO preview เป็นเพียงทางเลือกเชิงเทคนิค
2. รูปแบบแรกให้รองรับ PDF กับภาพก่อนหรือรวม XLSX/DOCX ตั้งแต่ pilot?
3. แต่ละ tenant ต้องการ retention เท่าไร และเอกสารส่งไป provider ภายนอกได้หรือบังคับ local model?
4. ขอชุดเอกสารตัวอย่างที่ anonymize แล้ว เพื่อสร้าง evaluation baseline; ห้ามใช้ไฟล์ production จริงในรายงาน/ตัวอย่าง

การตอบคำถามเหล่านี้เป็นขั้น discovery ต่อ ไม่ใช่การอนุมัติให้ import หรือเขียนข้อมูล GIS จริง

## ผลทบทวนบทบาท

- **PO:** แนะนำ `validate_first`; ทำเอกสารเป็น draft มี field evidence, GIS reconciliation, user review และ explicit preview/confirmation; ชนิด Purchase pilot ต้องยืนยัน
- **BD:** เห็นด้วยกับ draft ที่ตรวจสอบได้และ GIS read-only reconciliation; ไม่มีข้อมูลเลือก PO เหนือ quotation ในเชิงพาณิชย์ และยังไม่สรุป willingness-to-pay หรือ target รายได้
- **PO ทบทวนหลัง BD review:** ไม่กำหนด PO/quotation เป็น pilot; เสนอ reusable staged-import architecture จน Sponsor เลือกชนิด/ทิศทางและจัด sample ที่ได้รับอนุญาต
- **ข้อสรุปร่วม:** `validate_first`; Sponsor ยืนยันแล้วว่า PU คือ Purchase; ยังต้องเลือก document type/direction แรกและให้ตัวอย่างที่ได้รับอนุญาต; ห้ามอ้างความแม่นยำ/รายได้ที่ยังไม่มีข้อมูล
