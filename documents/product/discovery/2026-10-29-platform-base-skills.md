# แผนพัฒนา Platform Base Skills ของ FaroAI

วันที่ 29 ตุลาคม 2026 | BD + Product Owner cross-review

**ข้อสรุป:** จัดทำแผนได้ครบตามขอบเขตผู้ใช้ สถานะสำหรับ implementation/rollout และผลตอบแทนคือ `validate_first` แผนนี้พร้อมใช้จัด technical backlog/estimate; ยังไม่ได้เพิ่ม runtime skill หรือ deploy

## 1. สิ่งที่ผู้ใช้จะได้รับ

FaroAI มีชุดทักษะพื้นฐานที่ระบบดูแลและอัปเดตส่วนกลาง ทุก tenant ได้ใช้อัตโนมัติ ไม่ต้อง upload skill หรือตั้งค่าทุก skill ใหม่ ผู้ใช้บอกงานตามปกติ เช่น ค้นสินค้า สรุป PO วิเคราะห์ยอด หรือทำเอกสาร แล้วระบบเลือก skill ที่เกี่ยวข้องและส่งผลลัพธ์ในรูปแบบที่เหมาะ

ครอบคลุมทั้งหมดตามคำตอบของเจ้าของโครงการ: **วิเคราะห์ข้อมูล, PDF, Excel, Word, PowerPoint และ Jewelry/GIS** การใช้ข้อมูล/สร้างรายการยังต้องผ่านสิทธิ์และ policy ของ tenant ที่มีอยู่

ตัวอย่างปลายทาง:

| Prompt | สิ่งที่จะทำ | ผลลัพธ์ |
|---|---|---|
| หาแหวนไม่เอา round cut | Jewelry search + verified GIS constraints | product cards และเงื่อนไขที่ยืนยันได้/ไม่ได้ |
| Show Ham's pending POs and export an Excel summary. | PO read -> deterministic summary -> XLSX | ตารางและไฟล์ Excel ตามสิทธิ์ |
| ทำ PDF catalog จากแหวนที่ค้นเจอ | verified search -> PDF template | catalog PDF โดยราคา/stockอิงข้อมูลที่ตรวจแล้ว |
| สรุปยอดขายในไฟล์นี้ แล้วทำ PowerPoint | authorized file data -> analysis -> PPTX | ตัวเลขที่คำนวณจริงและ slides |
| ทำ Word คู่มือดูแลเครื่องประดับจากเอกสารที่อนุมัติ | tenant knowledge -> DOCX | รายงานพร้อมที่มาของเนื้อหา |
| เพิ่มสินค้าแหวน 10 แบบ | existing creative catalog workflow | actual GIS bulk job/results ตาม direct policy |
| สร้าง PO สินค้าเหล่านี้ | live masters/products -> PO preview | ให้ตรวจและยืนยันก่อนสร้าง PO รออนุมัติใน GIS |

ตัวอย่าง composite คือเป้าหมายระยะหลัง ต้องไม่โฆษณาว่ามีแล้วเมื่อยังไม่ได้ implement executor

## 2. เหตุผลและกลุ่มเป้าหมาย

ผู้จ่ายเงินที่เสนอคือเจ้าของร้าน/operations owner ของ jewelry tenant ผู้ใช้คือฝ่ายขาย จัดซื้อ merchandising และผู้ดูแลความรู้ตามสิทธิ์จริง Shopper ได้ประโยชน์จาก discovery; platform operator เป็นผู้ดูแล base catalog/release

ประโยชน์ที่ต้องพิสูจน์คือทำงานสำเร็จเร็วขึ้น ลดการเขียน prompt ซ้ำและงานแก้ รวมถึงลดการดูแล workflow แยก tenant ยังไม่มี baseline, willingness-to-pay หรือ ROI ที่ยืนยัน จึงไม่เสนอราคาขาย/ตัวเลขรายได้ขึ้นเอง

จาก source ที่ตรวจ ปัจจุบัน frontend แยก search/product-create/procurement ด้วย intent checks และ backend มี prompt/model/tool loops เฉพาะงานอยู่แล้ว จึงเสนอ adapters เพื่อใช้ของเดิมก่อน แทนการ rewrite workflow ธุรกิจทั้งหมด

## 3. ภาพการทำงาน

[เปิดภาพรวมและ sequence แบบ HTML/PDF/draw.io](../../diagram/base-skills/README.md)

```text
ผู้ใช้พิมพ์งาน
  -> ตรวจ tenant/actor และ prerequisites
  -> อ่านรายชื่อ Base Skills กลาง
  -> Jev เลือก skill และ model ที่อนุญาต
  -> โหลดเฉพาะคำแนะนำ skill ที่ใช้
  -> fixed executor เรียก MCP/คำนวณ/สร้างไฟล์
  -> คำตอบ สินค้า ตาราง preview หรือไฟล์ดาวน์โหลด
```

ฐาน skill กลางเก็บวิธีทำงานและ templates; ข้อมูล tenant ยังอยู่ในแหล่งของ tenant Skill ไม่ได้เพิ่มสิทธิ์ MCP/model และไม่ส่งข้อมูล tenant เข้า shared skill หรือ training อัตโนมัติ

## 4. ลำดับพัฒนาและหลักฐานจบงาน

| ระยะ | งานที่ส่งมอบ | เกณฑ์ก่อนเดินหน้าต่อ |
|---|---|---|
| 0: Contract/สำรวจของเดิม | Draft ADR/SPEC, catalog 11 skills, auth/cost/confirmation map, route/eval cases และ dependency inventory | Engineering ยืนยัน effective policy จาก code/ADR; แยก test-only defaults และกำหนด baseline โดยไม่ live-write เพื่อทดสอบ |
| 1: Core + read-only pilot | shared registry, exact versions/digests, Jev bounded selection, selective loading, typed output และ adapters ของ search/PO read/knowledge | tenant ใหม่และเดิม inherit release; สิทธิ์/ผลลัพธ์เดิมไม่เปลี่ยน; routing TH/EN/no-skill/ambiguous ผ่าน |
| 2A: Existing writes | catalog-create, PO-create, inventory-receive adapters ใช้ flow เดิม | direct catalog policy กับ PO/receipt confirmation ถูกคงไว้; replay/change/timeout/unknown jobไม่สร้างรายการซ้ำ |
| 2B: Analysis + files | isolated worker, private artifact/job/download lifecycle; data-analysis และ PDF/XLSX/DOCX/PPTX adapters | ทุก format ที่เปิดใช้สร้างไฟล์จริง เปิดได้ คำนวณถูก renderผ่าน และ access isolationผ่าน |
| 3: Composition + global rollout | reviewed data -> analysis -> document plans, usage/cost dashboard, staged publish/rollback | งานเดี่ยวผ่านก่อน; bounded plan ไม่มี tool/skill recursion; วัด quality/cost เทียบ baselineก่อนปล่อยทั้งระบบ |

ระยะ 2A กับ 2B เดินเป็น workstreams อิสระหลัง core ผ่าน เลือกเริ่มตาม Engineering capacity และความต้องการ pilot ทุก format ยังอยู่ในแผน ลำดับภายใน adapters ขึ้นกับ quality/resource spike ไม่ตั้งกำหนดเสร็จหรือจำนวนสัปดาห์โดยยังไม่มี estimate

## 5. ตัวเลขและผลลัพธ์ที่ต้องวัด

| มิติ | วิธีประเมิน | สถานะ baseline/target |
|---|---|---|
| ประสิทธิภาพผู้ใช้ | task completion, เวลาได้ผลลัพธ์ที่ใช้ได้, จำนวนแก้/retry/support | ยังไม่ทราบ; เก็บจาก workflow ปัจจุบันและ pilot |
| Routing | correct skill/no-skill/clarification, false write route, TH/EN cases | สร้างชุดที่คนตรวจ label; เป้าตัวเลขเสนอหลัง baseline |
| เอกสาร | เปิดได้ เนื้อหา/สูตร/ตัวเลขถูก layoutไทย-อังกฤษผ่าน | acceptance ต่อ adapter; ห้ามประกาศพร้อมใช้ก่อนผ่าน |
| สิทธิ์ | tenant/artifact isolation, write policy/replay/revocation | invariant: ไม่มี bypass/leakในชุดตรวจรับ |
| ต้นทุน | Jev+generation+worker/render+storage+retry/review ต่อ task ที่สำเร็จ | แยก observed/estimated/unknown; credits ไม่ใช่ USD |
| ผลธุรกิจ | ลดเวลางาน/งานแก้และ support ต่อ tenant, willingness-to-pay เมื่อมีข้อมูล | BD เก็บหลักฐาน ไม่ใช้จำนวน skill/download เป็น ROI |

ไม่สมมติหนึ่ง skill เท่ากับหนึ่งเครดิตหรือหนึ่ง model call Registry reuse อาจลดงานดูแล แต่ metadata และการสร้างเอกสารมีต้นทุนเพิ่ม ต้องวัดจริง

## 6. ขอบเขตและความเสี่ยง

- ใช้ Base Skills กลางที่ FAROAI review ก่อน ยังไม่เปิด tenant authoring/override/marketplace หรือ download skill จาก URL ขณะรัน
- แยก runtime skill จาก `.codex/skills`; ไม่รันคำสั่ง shell/Python ที่ model สร้างเอง และไม่คัดลอก proprietary Claude scripts โดยอัตโนมัติ
- รักษา direct product-create และ preview/confirm PO/receipt; ใช้ trusted credentials เดิมโดยไม่เพิ่ม sign-in ขั้นใหม่เพียงเพราะมี skill
- Global bad release กระทบทุก tenant จึงต้อง pin version, canary, emergency disable และ rollback พร้อม audit
- เอกสารต้องมี worker/ฟอนต์/renderer/private storage จริง; ประเมิน CPU/RAM/image size ก่อน build แยกงานเอกสารจาก embedding เพื่อไม่เพิ่มภาระให้ทุก request
- ข้อมูลจากไฟล์/MCP เป็น input ที่อาจไม่ถูกต้อง ต้องตรวจและไม่เปิด macro/code/external links การเผยแพร่/ส่งไฟล์ออกนอกระบบไม่เป็น side effect ของสร้างไฟล์
- Qdrant ยังเก็บ approved knowledge/product vectors ตามเดิม; base instructions และไฟล์ผลลัพธ์ไม่กลายเป็น shared learning อัตโนมัติ
- Current code มี bulk procurement branch ที่ยึด Ham/Central Worl/test note ต้อง parameterize ก่อนนำ executor นั้นเป็น base ของทุก tenant

## 7. ความรับผิดชอบ

| เจ้าของ | งานต่อไป | หลักฐานจบ |
|---|---|---|
| BD | ยืนยันความถี่งาน ผู้จ่าย ความเจ็บปวด ประโยชน์และ cost economics ของทุกหมวดที่ขอ | opportunity/baseline พร้อมหลักฐาน ไม่แต่ง ROI |
| PO | user flow, catalog, priority, functional acceptance และชุดทดสอบ | acceptance ชัดเรื่อง output/read/write/clarify และ baseline task study |
| Engineering | technical sizing, registry/router/executors/worker/storage/auth, implementationและrelease | estimates, reviewed contracts, conformance/quality/resource checks |
| Sponsor | งบ rollout และข้อผูกพัน pricing/ธุรกิจ | ลงมติจากข้อมูล quality/cost ที่วัดได้ |

BD/PO ทบทวนข้ามกันแล้ว ตกลง scope กลางทุก tenant ครบทุกหมวด และยอมให้ 2A/2B สลับหรือทำแยกกันเพราะไม่มีหลักฐานว่าต้องรออีกชุดหนึ่งเสร็จ Demand/ต้นทุน/estimate เป็นงาน validation ของ rollout ไม่ใช่เหตุให้หยุดจัดทำแผน ไม่มีข้อขัดแย้งสำคัญค้างสำหรับเอกสารนี้

## 8. แหล่งอ้างอิงและสถานะ

- [Proposed ADR-0036](../../adr/0036-platform-base-skills.md) และ [Draft SPEC](../../spec/platform-base-skills.md)
- ADR-0003/0009: tenant context และ approved MCP; ADR-0016/0019: model policy และ bounded Jev; ADR-0012: learning/consent; ADR-0025/0026: write behavior; ADR-0035: BD/PO ownership
- [Agent Skills specification](https://agentskills.io/specification), [client integration guide](https://agentskills.io/client-implementation/adding-skills-support): รูปแบบและ selective loading
- [Claude Agent Skills](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview): system-provided document skills เป็นตัวอย่างแนวผลิตภัณฑ์ งาน runtime ของ FaroAI เป็น design ที่เสนอแยก

ตรวจเอกสารและ source entrypoints เพื่อวางแผน ไม่ได้ทดสอบ runtime, สร้าง GIS record, ติดตั้ง library, build container หรือเปลี่ยน release ในรอบนี้
