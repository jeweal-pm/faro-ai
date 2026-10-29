# FaroAI feature roadmap — 29-10-26

- BD และ PO อ่าน ADR หมายเลข 0000–0035 ครบ 37 ไฟล์ (มี ADR-0025 สองฉบับ) พร้อม `tech-stack.md` และ SPEC ที่เกี่ยวข้อง แล้ว cross-review กัน
- สรุปร่วมเป็น `validate_first`: โครงการถัดไปเสนอให้ทำ trusted GIS Discovery pilot โดยตรวจ readiness ของ tenant แบบจำกัดขอบเขต และ rollout constrained/semantic search เมื่อพบช่องว่างจริง
- เพิ่ม roadmap ตามลำดับ: verified discovery, operation/job outcome & recovery, inquiry/quote handoff, knowledge version replacement/withdrawal
- กำหนด target/payer/user แยกกัน, บทบาท BD/PO/Engineering/Sponsor, MVP/non-goals, metrics ที่ต้องเก็บ baseline และประเด็น ADR/SPEC ที่ต้อง reconcile
- สร้างรายงาน PDF และ source Markdown ที่ `documents/tasks/2026-10-29-faroai-feature-roadmap.*`
- ตรวจ render PDF ทั้งเอกสาร ปรับ page break/พื้นที่ว่าง และตรวจ metadata/จำนวนหน้าแล้ว
- รายงานระบุชัดว่าเป็นข้อเสนอ ไม่ใช่คำสั่ง implement/deploy; ไม่ตรวจ runtime หรือทำ live GIS write
