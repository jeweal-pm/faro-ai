# แผนฟีเจอร์ถัดไปของ FaroAI

**วันที่:** 29 ตุลาคม 2026  
**ผลทบทวนร่วม BD + PO:** `validate_first`  
**สถานะเอกสาร:** ข้อเสนอเพื่อช่วยตัดสินใจ ไม่ใช่ backlog ที่อนุมัติหรือคำสั่งให้เริ่มพัฒนา

## ข้อเสนอสำหรับฟีเจอร์ถัดไป

### ทำให้ GIS Discovery พร้อมเปิด pilot และค้นหาได้ตรงเงื่อนไขอย่างตรวจสอบได้

จำกัดรอบแรกไว้ที่ tenant ร้านเครื่องประดับซึ่งเชื่อม GIS อยู่แล้ว เป้าหมายคือให้ผู้ดูแลรู้ได้ว่า Discovery พร้อมใช้งานหรือยัง และให้ผู้ใช้ได้ผลค้นหาสินค้าที่ตรงข้อจำกัดจากข้อมูลที่ตรวจสอบได้

ข้อเสนอนี้รวมสองส่วนที่เป็นลำดับเดียวกัน:

1. **ตรวจความพร้อมสำหรับ Discovery** จากสถานะจริงที่ระบบมี เช่น provider/model ที่ผ่านเพดานราคา, GIS connection และ `search_products` ที่ทดสอบและอนุมัติ, สถานะ catalog sync/ความสดของข้อมูล และ coverage ของ attribute ที่ใช้กรอง
2. **ยืนยันคุณภาพการค้นหา** โดยเริ่มจากเงื่อนไขเชิงโครงสร้างที่ต้องถูกต้อง เช่น “ring, not round cut” แล้ววัดผล semantic search กับ baseline แบบ lexical/filter ก่อนเปิด rollout

ไม่ควรสร้างหน้า setup ใหม่ถ้าการเปิดใช้ tenant ปัจจุบันไม่มีปัญหา หากตรวจแล้วผู้ดูแลตั้งค่าได้ราบรื่น ให้ข้ามส่วน UI readiness และไปทดสอบ search rollout โดยตรง

## ทำไมจึงเป็นลำดับถัดไป

- ADR-0017 ระบุให้ GIS เป็นแหล่งข้อมูลสินค้าจริง ผลจาก MCP ต้องถูกตรวจสอบ และห้ามถือผลลัพธ์ว่างที่ผิดรูปหรือ MCP ล้มเหลวว่าเป็น “ไม่พบสินค้า”
- ADR-0021 ระบุว่าการตัดสินใจปฏิเสธ shape ต้องผ่าน structured filter ของ GIS และข้อมูล shape ที่ยืนยันได้; SPEC ยังทำเครื่องหมายความสามารถฝั่ง GIS ว่าค้างอยู่
- ADR-0033 อนุมัติ product-specific Qdrant collection และ semantic retrieval แต่ SPEC ระบุว่า rollout ยังรออยู่; Qdrant ช่วยจัดอันดับผู้สมัคร ไม่ใช่แหล่งยืนยันราคา stock หรือ availability
- ADR-0018 กำหนดให้ `Add to Order` ยังไม่ทำรายการจริง ดังนั้น click หรือการเห็น product card ยังนับเป็นยอดขายไม่ได้
- การตรวจ readiness ก่อนขยาย AI ช่วยแยกปัญหา configuration, ข้อมูลไม่ครบ, MCP error, no-match และ ranking ออกจากกัน ลดความเสี่ยงทำฟีเจอร์เพิ่มทั้งที่ข้อมูลต้นทางยังไม่พร้อม

นี่เป็นเหตุผลเชิงลำดับและ dependency ไม่ใช่หลักฐานว่าตลาดยืนยันความต้องการหรือคาดการณ์รายได้แล้ว

## ผู้ใช้และผู้จ่ายเงินที่เสนอ

| กลุ่ม | ข้อเสนอสำหรับ pilot | สิ่งที่ยังต้องยืนยัน |
|---|---|---|
| ผู้จ่ายเงิน | เจ้าของร้านหรือ operations owner ของ tenant เครื่องประดับที่ใช้ GIS | ปัญหานี้มีมูลค่าพอให้จ่ายหรือไม่ และ budget owner คือใคร |
| ผู้ใช้ readiness | FaroAI platform operator ที่ได้รับอนุญาตให้ตั้งค่า tenant | ใช้ operator ช่วยเปิด pilot ได้หรือจำเป็นต้องให้พนักงาน tenant ตั้งค่าเอง |
| ผู้ใช้ Discovery | เลือกหนึ่งกลุ่มสำหรับ pilot: พนักงานขาย หรือ shopper ที่ได้รับอนุญาต | กลุ่มใดมีความถี่งานและผลกระทบที่พิสูจน์ได้ดีกว่า |
| ผู้ได้ประโยชน์ | พนักงานที่ช่วยเลือกสินค้าและผู้ซื้อที่ต้องการ shortlist ตรงความต้องการ | ต้องตรวจผลกับ workflow จริงของร้าน |

อย่าแก้ปัญหาสิทธิ์พนักงานด้วยการให้บัญชี tenant ใช้ `platform_admin` ร่วมกัน หาก pilot ต้องให้พนักงานใช้งานตรง ต้องกำหนด role และขอบเขตสิทธิ์แยกเป็นงานออกแบบ/ADR ก่อน

## ขอบเขต MVP ที่เสนอ

### ส่วน A: readiness gate เฉพาะ GIS Discovery

- แสดงสถานะ readiness แยกตามหลักฐานที่มีจริง: tenant, provider/Jev และ price limits, GIS connection, tool approval, catalog sync/version/freshness, และ shape coverage
- แสดง blocker และเจ้าของขั้นต่อไปอย่างตรงไปตรงมา เช่น “ยังไม่ได้อนุมัติ tool”, “catalog ยังไม่ sync” หรือ “ไม่ทราบ shape ของสินค้าบางรายการ”
- มี read-only smoke query ที่แสดงผล GIS ที่ผ่าน validation หรือข้อความว่าไม่พร้อม/ตรวจไม่ได้อย่างชัดเจน
- การ test connection ไม่ได้แปลว่า tool ได้รับอนุมัติ และการเชื่อมต่อ MCP ไม่ได้แปลว่า catalog ถูก sync แล้ว
- ไม่อนุมัติ tool, เพิ่ม cap, สร้าง GIS record หรือเปลี่ยน configuration ให้อัตโนมัติ

ส่วน UI ใหม่ให้ทำต่อเมื่อ BD/PO พบ setup friction จาก operator หรือ tenant จริง ถ้าไม่มี ให้ใช้ checklist/operator-assisted pilot แทนการสร้างหน้าจอที่ไม่มีปัญหารองรับ

### ส่วน B: ความถูกต้องและการวัดคุณภาพค้นหา

- ใช้คำค้นสั้นและภาษาธรรมชาติภาษาไทย/อังกฤษ โดยให้ GIS เป็นผู้ค้นและเป็นเจ้าของข้อมูลสินค้า
- ส่ง structured filter เฉพาะเมื่อ schema ของ MCP tool ที่ประกาศรองรับเท่านั้น
- สินค้าที่ shape ถูกยืนยันว่าเป็นค่าที่ห้ามต้องไม่แสดงเป็น match; ถ้าข้อมูล shape ไม่พอ ระบบต้องบอกว่าไม่สามารถยืนยันเงื่อนไข ไม่อ้างว่าผ่าน
- ทดลอง rollout semantic search กับ catalog ที่ sync แล้ว เปรียบเทียบกับ lexical/structured baseline ด้วยชุดประเมินที่คนตรวจ ไม่ใช้ prompt หรือคำตอบ AI เป็น ground truth โดยอัตโนมัติ
- แสดงผลราคา stock และ availability จาก GIS ที่สดตาม workflow; Qdrant เก็บ descriptive vector/candidate เท่านั้น
- แยกสถานะ `verified empty`, `source error`, `not ready`, และ `uncertain attribute` ออกจากกัน

## สิ่งที่ไม่รวมใน MVP

- Outfit stylist, การสร้างคำแนะนำจากข้อมูลที่ไม่มีใน catalog, image-vector similarity หรือการทำ image understanding ให้เป็นฟีเจอร์ใหม่โดยไม่มีการประเมินแยก
- Checkout, reserve stock, payment หรือสร้าง order ผ่าน `Add to Order`
- การนำ MCP result, prompt หรือคำตอบ AI ไป embed/training อัตโนมัติ
- การสร้าง platform-wide onboarding/health dashboard ครอบทุก MCP และทุก feature
- การเปิด tenant self-service หรือเพิ่มสิทธิ์พนักงานเป็น `platform_admin`
- การเปิดใช้ Local LoRA/Local inference ใน Discovery ก่อนมีนโยบายต้นทุนและ eligibility ที่สอดคล้องกัน

## Roadmap ตามลำดับ

| ลำดับ | งาน/ผลลัพธ์ | เหตุผลและเงื่อนไขเดินหน้า | เจ้าของหลัก |
|---|---|---|---|
| 0 | ตรวจหลักฐานและ readiness ของ tenant นำร่อง | ยืนยัน setup friction, GIS contract, sync/attribute coverage และสถานะ runtime ปัจจุบัน; ถ้า setup ราบรื่นไม่สร้าง readiness UI | BD: หลักฐานปัญหา; PO: pilot task; Engineering: runtime/contract |
| 1 | เปิด pilot: trusted GIS Discovery และ constrained search | ผ่าน source readiness, tenant isolation, GIS filter contract และชุด acceptance ไทย/อังกฤษ; วัด semantic rollout เทียบ baseline | PO: scope/acceptance; Engineering: contract/rollout; BD: segment/value |
| 2 | แสดงผลลัพธ์ bulk operation/job และกู้คืนสถานะอย่างปลอดภัย | หลังงานสร้าง product/PO ขยายขึ้น ต้องเห็น job ID, ผลสำเร็จ/ล้มเหลว/ไม่ทราบผล และห้าม retry write ที่ไม่แน่ชัด | PO + Engineering; BD ประเมิน support/cost |
| 3 | Inquiry/quote handoff จากสินค้าที่ตรวจแล้ว | ทำเมื่อร้านยืนยันช่องทางรับ inquiry, variant/ข้อมูลที่ใช้ได้ และวิธีเชื่อมผลกับ order; ก่อนนั้นนับ inquiry ไม่ใช่ยอดขาย | PO: flow; BD: sales outcome; Engineering: API/consent |
| 4 | เปลี่ยน/ถอน knowledge แบบมี version และ audit | ทำเมื่อมีหลักฐานเอกสารเปลี่ยนบ่อยหรือคำตอบจากเอกสารเก่าก่อปัญหา; ต้องจัดการ index, RAG และ lineage อย่าง tenant-scoped | PO: reviewer flow; Engineering: version/delete; BD: impact |

Tenant operator role เป็น dependency แบบมีเงื่อนไข หากพนักงานของลูกค้าต้องใช้งานเองจึงออกแบบ RBAC และ ADR; ห้ามให้ platform admin ร่วมกันเป็นทางลัด

## ตัวชี้วัดและวิธีตั้งเป้า

ยังไม่มี baseline หรือข้อมูลจากลูกค้าในเอกสาร จึงไม่กำหนดตัวเลขเป้าหมายหรือ ROI ขึ้นเอง ก่อนเปิด pilot ให้บันทึก baseline และให้ sponsor อนุมัติเกณฑ์ผ่าน

| มิติ | ตัวชี้วัดที่เสนอ | วิธีวัด |
|---|---|---|
| เปิดใช้งาน | เวลาจากเริ่ม setup ถึงผล GIS ที่ verified ครั้งแรก; สัดส่วน blocker ที่ระบุสาเหตุได้ | บันทึก timestamp และสถานะ readiness โดยไม่เก็บ prompt เกินจำเป็น |
| Search utility | task success, เวลาถึง shortlist ที่ผู้ใช้ยอมรับ, relevant results ใน top 8 | ชุดทดสอบ Thai/English ที่ผู้ประเมินตรวจแยกจาก training data |
| Constraint safety | จำนวนผลที่ละเมิด exclusion ที่ยืนยันได้; สัดส่วน unknown ที่ถูกกล่าวอ้างว่าผ่าน | acceptance suite; เป้าหมายด้าน known exclusion = 0 การ์ดที่ขัดเงื่อนไข |
| Source reliability | แยก verified no-match, MCP failure, missing approval, stale/missing catalog | log metadata แบบไม่บันทึก API key หรือ raw payload |
| Commercial | inquiry ที่มีคุณภาพ, เวลาตอบกลับ, order ที่ยืนยันจากแหล่งข้อมูลที่เชื่อถือได้, contribution margin เมื่อวัดได้ | เริ่มจาก inquiry; click ไม่ใช่ order และ order ไม่ใช่กำไร |
| Cost | model/Jev/image cost ต่อ task ที่สำเร็จ, retry และ human review effort | เทียบ provider usage กับงานสำเร็จ; แยก estimated/actual/unknown |

ไม่ตั้งเป้า uplift จนเห็น baseline และ sample เพียงพอ การทดสอบ semantic ต้องกำหนดเกณฑ์ขั้นต่ำร่วมกับ sponsor ก่อน rollout และหยุด rollout หาก uplift ไม่คุ้มกับ cost/latency หรือมี constraint violation

## ความขัดแย้ง/ช่องว่าง ADR ที่ต้องปิดก่อนเปิด pilot

1. **สถานะปัจจุบันไม่ตรงกัน:** `adr-implementation-audit.md` ลงวันที่ 14 ต.ค. และตรวจถึง ADR-0016 เท่านั้น ขณะที่มี ADR/SPEC ถึง 0035; ใช้แทนการตรวจ release ปัจจุบันไม่ได้
2. **สถานะ GIS MCP:** `openrouter-jev-discovery-routing.md` ระบุ GIS HTTP 404 เป็น blocker แต่ ADR-0017 และ `live-mcp-product-search.md` ระบุ frontend verification ว่าได้ product cards แล้ว ต้องตรวจ endpoint/runtime ที่จะใช้ pilot ก่อนสรุปว่าใช้งานได้หรือยัง
3. **Structured filter:** ADR-0021/SPEC ยังระบุ GIS `stone_shape_exclude` และ structured shape data ว่ารอการรองรับเต็มรูปแบบ; อย่าสื่อสารว่า “not round” รับประกันได้จน contract ผ่าน acceptance
4. **Semantic rollout:** ADR-0033 รับรอง architecture แต่ SPEC บอก rollout pending; ต้องตรวจ tenant sync, freshness, metric และ fallback ก่อนเปิดใช้
5. **Product create กับ procurement:** amendment ของ ADR-0025 ให้ direct prompt create สำหรับ operator แต่ ADR-0026 ยังอ้าง preview/confirmation สำหรับการสร้าง product ก่อน PO; ต้องระบุ effective policy แยกตามงาน ไม่ใช้ confirmation rule เดียวกับ product create, PO create และ receipt
6. **Network egress:** ADR-0009 amendment และ product creation SPEC กล่าวถึง `host_api`; ADR-0020 ใช้ `provider_egress`; Engineering ต้องยืนยัน network authority/config ที่ถูกต้องก่อน production
7. **Local model กับราคา:** ADR-0006/ADR-0023 มีเส้นทาง Local LLM/Learning ขณะที่ ADR-0016 ไม่ให้โมเดลที่ราคา free/unknown ผ่าน eligibility; ต้องตัดสินต้นทุน self-hosted แยกจากราคา token ก่อนโฆษณา local Discovery
8. **เครดิตไม่ใช่ต้นทุนงาน:** credits เป็นหน่วย usage; งาน bulk อาจเรียก model หลายครั้งและมี Jev, image, retry, infra และ human review cost เพิ่ม ต้องเห็นต้นทุนต่อ operation ก่อนกำหนด pricing/ROI

## ความรับผิดชอบตามผังองค์กร

| บทบาท | รับผิดชอบในแผนนี้ | ไม่ใช่เจ้าของ |
|---|---|---|
| Sponsor / เจ้าของธุรกิจ (มนุษย์) | เลือก segment, อนุมัติงบ, เกณฑ์ผลตอบแทนและความเสี่ยงที่ยอมรับ | รายละเอียด implementation รายบรรทัด |
| BD | สัมภาษณ์/ยืนยัน demand, payer, current workaround, frequency, willingness-to-pay, commercial metric | Product backlog, architecture, production release |
| PO | กำหนด user problem, pilot scope, functional flow, acceptance, metric และลำดับ backlog ภายในกรอบที่อนุมัติ | สัญญาราคา/งบ หรือ architecture |
| Engineering | ตรวจ GIS/provider/Qdrant contract, feasibility, isolation/security, estimates, implementation, tests และ release readiness | ตัดสิน target segment หรืออนุมัติงบธุรกิจ |
| Parent / ผู้ประสานงาน | รวมข้อเสนอ BD/PO, บันทึกหลักฐานและข้อขัดแย้งอย่างตรงไปตรงมา | ผู้อนุมัติงบหรือแทน Sponsor |

BD และ PO เป็น peer roles; PO ไม่ได้เป็นหัวหน้า BD และ BD ไม่ได้สั่ง Engineering ให้ deploy

## งานก่อนตัดสินใจลงทุน

1. **BD:** ยืนยันกลุ่มร้านเป้าหมาย, buyer/payer, ปัญหาค้นไม่ตรงหรือ setup ติดขัด, ความถี่, workaround, budget owner และวิธีพิสูจน์ willingness-to-pay
2. **PO:** เลือก primary user หนึ่งกลุ่มสำหรับ pilot และทำ task study/acceptance set โดยแยก shopping จาก product creation/procurement
3. **Engineering:** ตรวจสถานะจริงของ GIS `tools/list`, tool approval, structured shape filters, catalog sync/freshness, Qdrant rollout, deployment egress และ tenant isolation; ประเมินขนาดงานและ fallback
4. **Sponsor:** เลือก retail vs wholesale ที่จะพิสูจน์ก่อน, อนุมัติเกณฑ์ผ่าน/งบ และเลือก hosted vs local หากข้อกำหนด privacy เป็นตัวขับหลัก
5. **Gate:** ถ้า setup friction ไม่มี ให้ไม่สร้าง activation UI; ถ้า GIS ไม่มี shape attribute/filter ให้เลื่อนการอ้างรับประกัน exclusion; ถ้า semantic uplift ไม่ผ่านต้นทุน ให้คง lexical/structured path

## บันทึกการทบทวนร่วม

- BD อ่าน ADR หมายเลข 0000–0035 ครบทุกไฟล์ รวมไฟล์ ADR-0025 สองไฟล์ และ `tech-stack.md`; ทบทวนมุม payer, demand, economics และ commercial risk
- PO อ่าน ADR ชุดเดียวกันและ SPEC ที่เกี่ยวข้อง; ทบทวน user journey, scope, acceptance และ dependency
- ทั้งสอง cross-review และเห็นพ้องกับ `validate_first` สำหรับ trusted GIS Discovery pilot; ลำดับถัดไปคือ constrained search/semantic rollout, job outcome/recovery, inquiry/quote และ knowledge lifecycle
- ไม่ได้ตรวจ code หรือ runtime ในการทบทวนนี้ และไม่อ้างว่าเป็นหลักฐานสถานะ deployment ปัจจุบัน
- ข้อเสนอไม่อนุมัติให้ implement, deploy, เปลี่ยนราคา หรือทำ live GIS write โดยอัตโนมัติ

## ขอบเขต ADR ที่อ่าน

อ่านไฟล์ ADR หมายเลข 0000–0035 ทุกฉบับ (37 ไฟล์ เพราะมี ADR-0025 สองเรื่อง) และ `tech-stack.md` รวมถึง SPEC ที่เกี่ยวข้อง ได้แก่ implementation audit, platform backoffice, live MCP search, structured constraints, semantic product search, Discovery journey, product creation, procurement, consented learning, tenant-scoped RAG, provider catalog และ local inference

รายการไฟล์ ADR:

- 0000 `0000-clone-project.md`; 0001 `0001-use-faroaikey-centralize-3rdpartyapi-with-jev.md`; 0002 `0002-use-qdrant-for-embed-db.md`; 0003 `0003-use-tenant-id-for-design.md`; 0004 `0004-use-redis-for-caching-queuing.md`; 0005 `0005-use-postgres-for-general-database.md`
- 0006 `0006-can-support-local-llm.md`; 0007 `0007-from-3rdparty-to-localllm.md`; 0008 `0008-use-phyton-for-service-worker.md`; 0009 `0009-use-multiple-source-mcp.md`; 0010 `0010-platform-backoffice-and-deployment-modes.md`; 0011 `0011-jev-selects-tenant-approved-models.md`
- 0012 `0012-consented-model-improvement-and-training.md`; 0013 `0013-bound-model-routing-by-price.md`; 0014 `0014-image-pricing-and-free-model-exclusion.md`; 0015 `0015-discover-provider-models-and-manage-pricing.md`; 0016 `0016-provider-specific-price-caps-and-automatic-model-selection.md`
- 0017 `0017-live-mcp-product-search-results.md`; 0018 `0018-discovery-shopping-journey.md`; 0019 `0019-use-openrouter-typesafe-jev-decisions-api.md`; 0020 `0020-ai-service-restricted-egress.md`; 0021 `0021-structured-product-search-constraints.md`; 0022 `0022-local-fine-tuning-runner.md`
- 0023 `0023-tenant-scoped-rag-learning.md`; 0024 `0024-manual-tenant-knowledge-review.md`; 0025 `0025-ai-assisted-mcp-product-creation.md` และ `0025-python-lora-inference-server.md`; 0026 `0026-natural-language-gis-procurement.md`; 0027 `0027-single-request-po-search-details.md`
- 0028 `0028-structured-po-result-display.md`; 0029 `0029-contextual-po-table-filters.md`; 0030 `0030-correct-po-line-filter-comparisons.md`; 0031 `0031-edit-latest-procurement-prompt.md`; 0032 `0032-support-lower-higher-po-price-filters.md`; 0033 `0033-tenant-scoped-semantic-product-search.md`; 0034 `0034-configurable-procurement-conversation-context.md`; 0035 `0035-bd-po-product-discovery-roles.md`
- สถาปัตยกรรมหลัก `tech-stack.md`

## แหล่งเอกสารหลัก

ADR: `documents/adr/0017-live-mcp-product-search-results.md`; `documents/adr/0018-discovery-shopping-journey.md`; `documents/adr/0021-structured-product-search-constraints.md`; `documents/adr/0025-ai-assisted-mcp-product-creation.md`; `documents/adr/0026-natural-language-gis-procurement.md`; `documents/adr/0033-tenant-scoped-semantic-product-search.md`; `documents/adr/0035-bd-po-product-discovery-roles.md`.

SPEC: `documents/spec/adr-implementation-audit.md`; `documents/spec/live-mcp-product-search.md`; `documents/spec/structured-product-search-constraints.md`; `documents/spec/semantic-product-search.md`; `documents/spec/platform-backoffice.md`; `documents/spec/natural-language-gis-procurement.md`; `documents/spec/ai-assisted-mcp-product-creation.md`; `documents/spec/python-lora-inference-service.md`; `documents/spec/bd-po-product-discovery.md`.
