# FaroAI Base Skills: executive view and sequence diagrams

วันที่: 29 ตุลาคม 2026 | **Proposed target design** จาก [ADR-0036](../../adr/0036-platform-base-skills.md) และ [Draft SPEC](../../spec/platform-base-skills.md) ไม่ใช่ภาพสถานะ production ที่ตรวจแล้ว

## เปิดประชุมหรือส่งต่อ

- [HTML เปิดดูได้ทันที](index.html): เลือกภาพ/ขยาย และเปิด PDF หรือไฟล์แก้ไขได้ ไม่ต้องเชื่อม CDN
- [PDF 3 หน้า](faroai-base-skills-diagrams.pdf): vector A3 landscape พร้อมฟอนต์ไทย
- [draw.io แบบแก้ไขได้](base-skills.drawio): 3 pages; เปิดใน diagrams.net/draw.io

## ภาพที่ 1: ผู้บริหาร

[ภาพรวม SVG](01-overview.svg) แสดงวิธีที่ Base Catalog กลางใช้กับทุก tenant, Jev/Skill Runtime เลือกวิธีทำงาน และนำความสามารถเดิมมารวมกับ analysis/document worker ที่เสนอเพิ่ม

สารหลัก: ทุก tenant ได้ชุด skill เดียวกันใน deployment โดยไม่ต้องติดตั้งราย tenant ข้อมูลและสิทธิ์ยังแยกกัน วัดคุณค่าจากงานสำเร็จ เวลา งานแก้ และต้นทุน ไม่ใช้จำนวน skills เป็นตัวแทน ROI

## Sequence 1/2: เลือก skill และอ่านข้อมูล

[SVG](02-sequence-routing.svg) / [Mermaid source](02-sequence-routing.mmd)

ตัวอย่าง “สรุป PO รออนุมัติแล้วทำ Excel” เป็นเป้าหมายระยะ composition ของแผน ไม่ใช่ความสามารถที่เปิดแล้วทั้งหมด

Gateway ตรวจ trusted tenant/actor/budget ก่อน Runtime resolve release, ส่งเฉพาะตัวเลือกที่อนุญาตให้ Jev, ตรวจผลแล้วโหลดคำแนะนำเฉพาะ skill ที่ใช้ MCP ให้ข้อมูลจริง และ model ช่วยอธิบายเฉพาะเมื่องานต้องใช้ ไม่ให้ model คำนวณยอดแทน deterministic executor

เมื่อสร้างไฟล์ต้องบันทึก durable job ก่อนตอบ queued รูปแสดง logical responsibilities; การรวม skill/model selection ใน decision call เดียวต้องผ่าน compatibility checks ตอน implementation

## Sequence 2/2: worker และไฟล์ส่วนตัว

[SVG](03-sequence-artifact.svg) / [Mermaid source](03-sequence-artifact.mmd)

PostgreSQL เก็บ job manifest/status แบบถาวร Redis ส่ง job identity ให้ worker Worker ตรวจ context/version/policy คำนวณและสร้างไฟล์ แล้วเก็บใน private storage การอ่านสถานะและดาวน์โหลดผ่าน Gateway ที่ตรวจ tenant/actor/expiry

UI polling ในภาพเป็นการติดตาม job อัตโนมัติ ไม่ใช่ให้ผู้ใช้พิมพ์ prompt ซ้ำ และ source snapshot reference ไม่ได้หมายถึงส่ง raw MCP payload เข้า logs/queue

## กติกาที่ต้องอธิบายต่อทีม

1. Shared Base Skills คือวิธีทำงาน ไม่ใช่การแชร์ข้อมูล tenant หรือให้สิทธิ์ tools เพิ่ม
2. Read/search/analysis/file generation ไม่สร้าง GIS transaction แอบแฝง
3. Catalog create คง direct authorized policy เดิม; PO/receipt ต้อง preview → confirm → re-preview; FaroAI ไม่ approve PO
4. Skill/model IDs, runtime versions, tools และ artifact access ต้องตรวจฝั่ง server ไม่อาศัยข้อความใน SKILL.md อย่างเดียว
5. Qdrant ใช้ approved knowledge/product retrieval ตาม flow เดิม รูปยุบไว้ในกล่องความรู้; ไม่เก็บ skill code, artifact bytes หรือเรียนรู้จากผลลัพธ์อัตโนมัติ
6. สีฟ้าคือสิ่งที่เสนอเพิ่ม สีเขียวคือความสามารถเดิมที่นำมาต่อ/ปรับ; ทั้งภาพเป็น target design ไม่ใช่แผนผัง container

## สร้างไฟล์ใหม่จาก source

`build_diagrams.py` เก็บ layout/labels กลาง แล้ว export SVG, PDF, HTML, editable draw.io และ Mermaid ให้ตรงกัน ใช้ Python + ReportLab และฟอนต์ Thai ที่ระบุใน script ไม่ต้องลง dependency ใน FaroAI runtime

```powershell
python -B documents/diagram/base-skills/build_diagrams.py
```

Review: เทียบกับ ADR/SPEC เรื่อง inheritance, scoped credentials, selective loading, write policy, durable jobs และ private artifacts; render PDF ทั้งสามหน้าเพื่อตรวจความอ่านง่าย
