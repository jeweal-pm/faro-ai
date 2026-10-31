# SPEC: FaroAI Platform Base Skills

- **Status:** Accepted target contract; implementation in progress. Six of eleven skills are registered ready: jewelry search, approved knowledge answers, PO search/create, catalog draft creation through the existing confirmed GIS workflow, and inventory receipt preparation. The test-specific PO shortcut has been disabled and PO creation uses the generic master lookup and preview/confirmation path. Data analysis and artifact downloads are not released.
- **Date:** 2026-10-29
- **Decision:** [ADR-0036](../adr/0036-platform-base-skills.md)
- **Plan:** [BD/PO development plan](../product/discovery/2026-10-29-platform-base-skills.md)

รายละเอียดการทำงาน 30-10-2026: การค้น PO ใช้สิทธิ์อ่านที่อนุมัติแยกจากการสร้าง PO และรับสินค้า ซึ่งต้องตรวจสิทธิ์ preview และเขียนของงานนั้นอีกครั้งตอนยืนยัน หาก Jev ไม่เลือก skill ให้ route อ่านที่ตรวจสิทธิ์แล้วเลือก skill ที่ตรงกันได้ แต่ปฏิเสธตัวเลือกที่ผิดหรือขัดแย้ง ผลค้น vector ไม่ใช่คำตอบที่ยืนยันแล้ว และ fallback ที่ไม่มีโมเดลต้องไม่แสดงข้อความเอกสารดิบที่อาจไม่เกี่ยวข้องแทนคำตอบ

สถานะ implementation 30-10-2026: registry มี skill สถานะ ready 6 จาก 11 รายการ โดย catalog-create ครอบคลุมขั้น draft ใน workflow สร้างสินค้าเดิม, po-create ใช้ master lookup และ preview/confirmation แบบทั่วไป, inventory-receive ใช้ executor เตรียม preview เดิม ทั้งหมดอยู่ใต้ permission และ confirmation เดิม; PO ที่สร้างยังรออนุมัติใน GIS. ปิด shortcut PO สำหรับข้อมูลทดสอบเฉพาะรายแล้ว ส่วน data-analysis กับ PDF/XLSX/DOCX/PPTX ยังไม่เปิดใช้

## 1. Product contract

ทุก tenant ใหม่และเดิมได้รับ Base Skills ที่ FaroAI publish ใน deployment นั้นโดยอัตโนมัติ ไม่ต้องสร้าง ติดตั้ง หรือเปิดทีละ skill ต่อ tenant ผู้ใช้พิมพ์งานตามปกติ ระบบเลือกขั้นตอนและแสดงคำตอบ ตาราง สินค้า เอกสาร หรือ preview ตามงาน

สิทธิ์และข้อมูลยังมาจาก trusted context เดิม เช่น tenant service credential, actor scope, approved MCP, provider/model policy และเครดิต งานที่ขาด prerequisite แสดงเหตุผลและวิธีตั้งค่าที่จำเป็น การมี Base Skill ไม่เปลี่ยน policy เหล่านี้

Base catalog ครอบคลุมทั้ง generic document/data tasks และ Jewelry/GIS; tenant ที่ไม่มี GIS ยังใช้ generic skills ได้เมื่อมี input, worker และ model ที่งานนั้นต้องการ

## 2. ชุด Base Skills ที่เสนอ

| ID | งาน | Executor/ข้อมูลที่ต้องมี | ผลลัพธ์ |
|---|---|---|---|
| `base.jewelry-search` | ค้น/แนะนำสินค้าและข้อยกเว้น เช่น not round | search adapter, GIS approved tool หรือ indexed catalog ตาม flow เดิม | verified cards และ uncertainty/source metadata |
| `base.knowledge-answer` | ตอบจากเอกสารที่อนุมัติของ tenant | approved tenant RAG | answer พร้อม source references |
| `base.po-search` | ค้น PO/รายละเอียด/สรุปสถานะ | approved GIS read tools | structured PO cards/table |
| `base.catalog-create` | สร้างสินค้าเชิงสร้างสรรค์จาก prompt | scoped existing catalog executor + verified master | GIS bulk job/results ตาม direct flow เดิม |
| `base.po-create` | เตรียมและสร้าง PO | existing procurement executor | preview/confirmation แล้ว pending GIS approval |
| `base.inventory-receive` | รับสินค้าตาม PO ที่ GIS อนุมัติแล้ว | approved PO/receipt tools + permitted actor | receipt preview/confirmation และ actual result |
| `base.data-analysis` | รวมยอด เปรียบเทียบ จัดกลุ่ม filter และวิเคราะห์ข้อมูลที่อนุญาต | typed table/CSV/XLSX adapter และ fixed operations | verified calculations, table/chart spec, narrative เมื่อมี model |
| `base.pdf` | สรุป/สร้าง PDF จากข้อมูลหรือข้อความที่ตรวจแล้ว | private artifact worker + PDF adapter/font/render checks | downloadable PDF |
| `base.xlsx` | สร้าง spreadsheet ตาราง/สรุป/กราฟตาม template | spreadsheet adapter + calculation validation | downloadable XLSX |
| `base.docx` | สร้างรายงาน/ข้อเสนอ Word | document adapter + template/layout validation | downloadable DOCX |
| `base.pptx` | สร้าง presentation จากเนื้อหา/ผลวิเคราะห์ | presentation adapter + slide/render validation | downloadable PPTX |

แต่ละหมวดต้องมี executor จริงก่อนแสดงพร้อมใช้ ระยะแรกของเอกสารเน้นสร้าง/export จาก structured data และ approved text; การอ่าน แก้ไข หรือแปลงไฟล์อัปโหลดเพิ่มตาม input-format conformance ทีละประเภท รวมทั้ง PDF/CSV/XLSX ที่อนุมัติให้รองรับ ไม่อ้างว่าทุกไฟล์เปิด/แก้ได้จากการมีชื่อ skill

## 3. สิ่งที่แยกจากกัน

| ส่วน | หน้าที่ |
|---|---|
| Base Skill | วิธีทำงาน/หลักเลือกขั้นตอน/รูปแบบผลลัพธ์ที่โหลดเมื่อเกี่ยวข้อง |
| Jev | เลือก skill และ eligible generation model จากตัวเลือกที่ server ให้ |
| Generation model | ตีความ/ร่างข้อความตาม skill และข้อมูลที่อนุญาต |
| MCP | ช่องทางเรียกข้อมูล/การทำรายการของ GIS/GMS/ERP ตาม approved tools |
| Qdrant | ดึง approved knowledge/product candidates ของ tenant ตาม ADR เดิม |
| Executor | โค้ดที่รับ typed input และบังคับ operation policy จริง |
| Subagent | การแบ่งงานให้ agent/context อื่น เป็นความสามารถแยกที่ยังไม่อยู่ใน MVP |
| `.codex/skills` | คำแนะนำสำหรับ coding agent ใน workspace; ไม่ถูกส่งให้ลูกค้า |

กฎ tenant isolation, secrets, confirmation และ budget ต้องบังคับใน gateway/executor แม้ skill หรือ model ไม่ทำตามข้อความคำแนะนำ

## 4. Package และ global release

โครงสร้างที่วางแผนไว้:

```text
runtime-skills/
  base/
    purchase-order-search/
      SKILL.md
      faroai.json
      references/
      assets/
  releases/
    release-manifest.json
```

`SKILL.md` ใช้ name/description ตามมาตรฐาน ส่วน stable ID/version อยู่ใน metadata หรือ manifest; folder ชื่อเดียวกับ name ตัวอย่างนี้เป็นสัญญาออกแบบ ยังไม่ได้สร้าง package จริง:

```yaml
---
name: purchase-order-search
description: Find and explain purchase orders in Thai or English using verified tenant GIS data.
metadata:
  faroai.id: base.po-search
  faroai.version: "1.0.0"
---
```

`faroai.json` ที่ platform review ต้องประกาศ executor ID/version ที่ลงทะเบียนแล้ว, input/output schema, required scopes, MCP capability group, model requirements, write class/confirmation contract, limits และ artifact policy โดยไม่ใส่ credentials หรือ tenant-specific records

Runtime validate ขนาดไฟล์/schema/frontmatter, ID/version collision, digest และ resource paths ภายใน bundle; ไม่เดิน symlink หรือ path traversal ไม่ถือ `allowed-tools` ใน frontmatter ว่าเพิ่มสิทธิ์ API ได้

Source อยู่ใน Git; deployment สร้าง immutable release bundle ระบุ skill versions/content hashes/executor compatibility Postgres เก็บ active release selection, publish/revoke audit และรายการเวอร์ชันที่ deploy ไว้ เนื้อหากลางไม่ถูก copy เข้า tenant rows

ทุก tenant ใน deployment resolve release เดียวกัน ระหว่าง canary ให้ใช้ staging/canary deployment หรือ temporary release policy ที่หมดอายุชัดเจน ไม่เปลี่ยนเป็นระบบขอสิทธิ์ base skill ราย tenant หลัง global publish ทุก tenant ต้อง inherit ได้ทันทีสำหรับ request ใหม่

Self-hosted ใช้ bundle ที่มากับ release ไม่ต้อง download จากอินเทอร์เน็ตตอนรับ prompt Dev reload ทำได้เฉพาะ dev mode โดยสร้าง digest ใหม่และยกเลิก version เก่าของ session อย่างชัดเจน Production ใช้ read-only packages ที่ผ่าน publish เท่านั้น

## 5. Routing และ selective loading

[ภาพรวมและ sequence diagrams สำหรับผู้บริหาร/ทีม](../diagram/base-skills/README.md) ใช้ตัวอย่าง PO read -> analysis -> XLSX เพื่อสื่อสาร target flow ในระยะ composition แยกจากสถานะ implementation ปัจจุบัน

```text
Prompt + optional authorized input
  -> Hono: trusted tenant/actor + policy + budget context
  -> resolve published Base Skill catalog
  -> capability/permission shortlist
  -> bounded Jev skill choice + compatible model choice
  -> validate IDs/version and load selected SKILL.md/references
  -> registered executor / existing workflow adapter
  -> schema-validated result or artifact job
  -> cards/table/answer/confirmation/download in frontend
```

- เพิ่ม typed `skill` choices ใน adapter Jev เดิม พร้อม `none`, `needs_clarification` และ selection validation ไม่รับ endpoint/tool arguments/credentials จาก decision response
- จัด model candidates ตามงานที่ skill ต้องใช้ เช่น tool calling, structured output หรือ vision พร้อม price caps เดิม ตรวจความเข้ากันของ skill/model ฝั่ง server อีกครั้ง การเลือก model ไม่เพิ่มความสามารถ executor
- พยายามรวม skill/model selection กับ decision call ที่จำเป็นอยู่แล้ว แต่ต้องพิสูจน์ conformance ก่อนใช้ ไม่เพิ่ม paid classifier อีกหนึ่ง call ทุก prompt โดยอัตโนมัติ
- Filter/table toggle และ export จาก structured UI action ที่ตรวจสิทธิ์แล้วใช้ deterministic adapter ได้ ไม่ต้องเรียก model เพื่อคำนวณซ้ำ
- เริ่มหนึ่ง primary skill ต่อ request; ช่วง composition รองรับเฉพาะ reviewed plan/dependency templates ที่มี bounds ไม่ปล่อย skill เรียก skill/agent/code วนเอง
- ถ้า Jev ไม่พร้อม ใช้เฉพาะ deterministic route ที่รองรับและตรวจสิทธิ์แล้ว กรณีคลุมเครือให้ถามเฉพาะสิ่งจำเป็น; ไม่เดา write intent
- Catalog อาจรู้จัก skill ที่ execution ไม่พร้อมได้ แต่ router ต้องไม่เลือกไปทำโดยไม่ผ่าน prerequisites ผู้ใช้ที่ระบุงานนั้นตรง ๆ ได้ blocker ที่เจาะจง
- อนุญาต cache ของ immutable package bytes/metadata ตาม release digest ไม่ cache user prompts หรือ Jev decisions ภายใต้การเพิ่มระบบนี้

## 6. Gateway, frontend และ operation policy

เพิ่ม unified server orchestration contract โดยรับ prompt ผ่าน BFF/trusted client และคืน typed response ใช้ tenant จาก server authentication ห้ามเปิด privileged GIS workflow ผ่าน public discovery credential ที่ไม่มี scope

Frontend ส่งหนึ่ง prompt แล้วแสดงผลตาม kind; skill selector ของ browser หรือชื่อ skill ที่ user พิมพ์เป็นคำขอ ไม่ใช่อำนาจเปิด workflow ไม่บังคับให้ user รู้ชื่อ skill/tool/model และไม่บังคับ sign-in เพิ่มถ้า server-held tenant credential เดิมมี scope ถูกต้อง

| Operation | สัญญาที่ต้องรักษา |
|---|---|
| Search/read/analysis | ไม่มี GIS mutation; ระบุแหล่งข้อมูล เวลา และ scope ของข้อมูลที่นำมาคำนวณ |
| Catalog create | explicit authorized request ใช้ direct flow เดิม; inactive defaults, IDs/master validation และ bulk outcome/cancellation ไม่เพิ่ม second confirmation ครอบทุก skill |
| PO create | preview -> explicit confirm -> current re-preview -> single-use mutation; pending GIS approval |
| Inventory receipt | GIS ยืนยัน approved PO ก่อน; receipt preview/confirm แยก; ห้าม AI approve PO |
| Requested artifact | สร้างไฟล์ส่วนตัวให้ดาวน์โหลดตามสิทธิ์; ไม่ส่งให้ผู้อื่นหรือ publish ภายนอกโดยอัตโนมัติ |

Version ของ preview/skill/executor/payload digest ผูกกับ confirmation draft; การเปลี่ยนข้อมูลหรือ policy/revocation ต้องทำให้ตรวจใหม่ได้ ไม่ใช้ skill update แอบเปลี่ยนรายการที่ผู้ใช้ยืนยัน

## 7. Data analysis และเอกสาร

- คำนวณจาก structured data ด้วย fixed operations; model ช่วยตีความ/อธิบาย แต่ตัวเลขยืนยันจาก executor
- ระบุว่า totals คำนวณจากข้อมูลที่โหลดแล้ว หรือทั้ง query ที่ดึงครบจริง ถ้า MCP มี pagination ต้องใช้ approved bounded paging หรือแจ้งขอบเขต ไม่ silent truncate และไม่ select-all ทุก prompt
- สิทธิ์อ่านข้อมูลมาจาก MCP/tenant source เดิม ไม่ต่อ SQL/GIS backend โดยตรง
- ไฟล์ input ต้องตรวจ type/signature/size และจำนวน row/cell/page/slide ตาม adapter limits; ไม่รัน macro, embedded code หรือ external formula links
- Output ใช้ reviewed templates และตรวจ numeric type/formula values, safe text export, missing facts และชื่อไฟล์/MIME ไม่รับ model-generated HTML/path/URL เป็นไฟล์ที่เชื่อถือทันที
- PDF/DOCX/PPTX ตรวจ layout/ฟอนต์ไทย-อังกฤษและการล้นหน้า; XLSX ตรวจ workbook เปิดได้ สูตร/ผลรวม/รูปแบบตัวเลขถูกต้อง
- ระยะแรกเน้น output ที่สร้างใหม่จากข้อมูลที่อนุญาตก่อนเพิ่มความสามารถแก้ไฟล์ซับซ้อนหรือแปลง format

## 8. Worker, jobs, artifacts และ resource limits

Instruction runtime และ registry เพิ่มไฟล์ข้อความ/โค้ด adapter เป็นหลัก ไม่ต้องลง model หรือ container ใหม่เพื่ออ่าน SKILL.md

Artifact phase เสนอ worker แยกจาก AI/embedding service เพื่อแยก dependency, CPU/RAM และการ rebuild ใช้ fixed registered operations พร้อม dependencies ที่ pin ตอน build รันด้วย user ที่ไม่มีสิทธิ์ root, จำกัด filesystem/temp/เวลา/memory และปิด network ตามปกติ ไม่ mount Docker socket/host workspace หรือเปิด shell ให้ model ไม่มี pip/npm/download ตอนรับงาน

แยก worker profile และใช้ shared image/layers ตามความจำเป็น ตรวจขนาด image และพื้นที่ก่อน build; ไม่บังคับติดตั้ง browser/office suite ขนาดใหญ่กับทุก deployment เลือก renderer/adapters และ libraries ตอน implementation จากผล quality/resource spike

Postgres บันทึก job ก่อนตอบ accepted; Redis เป็นตัวส่งงาน/lease เท่านั้น Worker ต้อง idempotent งานที่ยังไม่รู้ผล GIS ห้าม retry mutation อัตโนมัติ งานสร้างไฟล์ retry ได้ด้วย job identity เดิมและผลลัพธ์ที่มี digest ตรวจได้

Artifacts อยู่ private storage adapter (private volume หรือ object store ตาม deployment) ไม่วางใน `backoffice/public` หรือ Qdrant ใช้ server-generated IDs/paths ตรวจ tenant และสิทธิ์ทุก preview/download มี TTL/delete; ค่าเริ่มต้นเสนอ 24 ชั่วโมงและ platform-configurable ต้องยืนยันก่อน release ไม่ใช้ retention ของ training candidates มาปะปน

คำขอ/file/output ไม่ถูกเก็บเข้า shared skill, RAG หรือ training อัตโนมัติ การใช้ข้อมูลเพื่อปรับปรุงยังอยู่ใต้ ADR-0012 และ consent/review เดิม

## 9. Proposed persistence/API contracts

| Record | Scope/ข้อมูลหลัก |
|---|---|
| platform skill release | global release ID, approved bundle digest, compatible executor build, active/revoked state, publisher/audit |
| skill run/steps | mandatory tenant, trusted actor, request/idempotency ID, immutable release/skill/executor references, current step status, usage/error codes |
| skill artifact | mandatory tenant/run/owner scope, private object reference, content hash, MIME, size, created/expires/deleted state |

Run payload ไม่ใช่ raw conversation archive เก็บเท่าที่ job/resume ต้องใช้และตาม retention; ไม่ log keys/raw MCP payloads/ไฟล์ข้อมูล

Proposed endpoints (ต้อง review security และ API convention ก่อน implementation):

- `GET /admin/v1/skills/base`: global published catalog/release และสถานะ executor
- `GET /admin/v1/tenants/:tenantId/skills/effective`: readiness ภายใต้สิทธิ์ tenant ไม่ใช่ list ที่ต้อง grant
- `POST /v1/assist`: unified orchestration ที่รักษา trusted auth/scopes เดิม
- `GET /v1/skill-runs/:id`, `POST /v1/skill-runs/:id/cancel`: job status/cancellation ตาม actor/tenant
- `GET /v1/artifacts/:id/download`: authorized streaming; ไม่ส่ง filesystem path ให้ browser

Business confirmation ใช้/ปรับ existing typed confirmation contract ไม่สร้าง mutation endpoint ที่หลบ gateway เดิม

## 10. Release, observability และต้นทุน

- Run pin release/skill/content/executor/policy versions; policy/credential/tool revocation ตรวจใหม่ก่อน business write เสมอ
- Publish/rollback เลือกเฉพาะ reviewed bundles ที่ deploy แล้ว ไม่มี admin upload arbitrary code ใน MVP
- Emergency disable หยุด request ใหม่และตรวจ queued/confirmation steps; in-flight mutation ที่ส่งแล้วต้องแสดง unknown/actual job status ตาม source ไม่อ้าง cancel สำเร็จ
- Shadow/evaluation เปรียบเทียบ routing จาก fixtures หรือ read-only pilot; ห้าม execute งานเขียนซ้ำหรือจ่าย model call เพิ่มโดยไม่ติดตาม budget
- รวม usage/cost ของ Jev + generation + worker/render + storage/retry ระบุ estimated/observed/unknown ไม่สมมติว่า provider price cap คุมค่า worker ทั้งหมด
- Adapter migration ต้องระบุว่าใคร reserve/settle credits เพื่อป้องกันคิดซ้ำ; ไม่เปลี่ยนค่า credit unit/pricing ในการย้ายเป็น skill

## 11. Acceptance และ regression gates

1. Tenant ใหม่/เดิม inherit published release เดียวกันโดยไม่สร้างสำเนา skill หรือ grant ราย tenant; self-hosted อ้าง release ของ deployment อย่างถูกต้อง
2. ไม่ activate unknown/unpublished/revoked skill หรือ executor ที่ไม่รองรับ version; no-skill/clarification เป็นผลลัพธ์ที่ถูกต้อง
3. โหลด body/references เฉพาะ selected skills; อธิบาย missing model/tool/scope/input/worker ได้
4. Prompt, uploaded content และ MCP text เปลี่ยน tenant, endpoint, scopes, skill policy หรือ confirmation ไม่ได้; ข้อมูล tenant A ไม่รั่วไป B ผ่าน job/artifact
5. Existing cards/structured PO results/local filters/direct catalog create/confirmed PO-receipt flows ผ่าน regression รวม replay, changed preview, cancellation และ source unavailable
6. ตรวจ test-specific Ham/Central Worl/voucher/note logic และแทนด้วย parameter resolution ที่มาจาก user/live tenant GIS ก่อน global executor publish
7. ภาษาไทย/อังกฤษและคำขอสั้น/คลุมเครือ/ไม่ครบทำงานได้; ไม่จัด read request เป็น write หรือบังคับ user รู้ tool ID
8. ทุก format ที่ advertise พร้อมใช้ต้องมีไฟล์เปิดได้จริง, content/calculation validation และ rendered visual QA ไม่รายงาน success จากการสร้าง metadata เท่านั้น
9. Timeout/partial/unknown outcome แสดงตามจริง; restart/retry ไม่คิด credits หรือเขียน GIS ซ้ำ; failed artifact ไม่ได้ download link ที่อ้างว่าเสร็จ
10. เก็บ baseline selection/task success, rework, latency, artifact quality และ cost per completed task แล้วกำหนด proposed release thresholds ก่อน rollout; safety invariants ต้องไม่มี cross-tenant access หรือ confirmation bypass ใน acceptance suite

## 12. Evidence และขอบเขตการตรวจ

ตรวจ source entrypoints ณ 29-10-2026: `backoffice/app/discovery-page.tsx` (`search`, intent checks), `backoffice/app/actions.ts` (`gisPromptRequest`), `gateway/src/admin.ts` (service credential exception/procurement routes), `ai-service/faroai/routing.py` (Jev/tool allow-list), `ai-service/faroai/app.py` (prompt/tool loops และ bulk branch) และ worker/Dockerfile ที่เกี่ยวข้อง ไม่ใช่การตรวจ runtime หรือทดสอบ end-to-end ในรอบวางแผนนี้

[Agent Skills specification](https://agentskills.io/specification) และ [client integration guide](https://agentskills.io/client-implementation/adding-skills-support) รองรับแนวคิด package และ selective loading; API, authorization, executor isolation และ release policy ในเอกสารนี้เป็นข้อเสนอของ FaroAI ไม่ใช่ข้อรับประกันจากมาตรฐาน
