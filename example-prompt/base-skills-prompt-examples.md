# FaroAI Base Skills: prompt examples

Updated: 2026-11-02  
Catalog source: `ai-service/faroai/base_skills/release.json` (release `2026.11.02.1`)

Use these prompts in FaroAI. Shopping, catalog creation, and GIS procurement prompts enter their existing workflows. Jev can choose a published Base Skill only within an already-authorized route. A prompt cannot grant MCP permissions or bypass a required preview/confirmation.

## Available Base Skills

### 1. Jewelry search — `base.jewelry-search`

Find verified jewelry in the connected catalog. Results depend on GIS data.

```text
ช่วยหา necklace ทองคำสีเหลืองที่มี emerald เม็ดเล็ก ๆ แสดงเฉพาะสินค้าที่ตรวจสอบได้จากแคตตาล็อก
```

```text
Find a yellow-gold necklace with a small emerald. Show verified catalog matches only.
```

### 2. Approved knowledge answer — `base.knowledge-answer`

Answer from this tenant's approved and indexed knowledge only.

```text
จากเอกสารความรู้ที่อนุมัติของบริษัท นโยบายรับคืนแหวนเป็นอย่างไร? ระบุแหล่งอ้างอิง และถ้าไม่มีข้อมูลให้บอกว่าไม่พบ
```

```text
According to this tenant's approved knowledge, what is the return policy for rings? Cite the source and say when the information is unavailable.
```

### 3. Create catalog products — `base.catalog-create`

Create creative product drafts through the product workflow. Names and marketing descriptions may be creative; GIS IDs, SKU, prices, stock, and product attributes must come from the user or verified GIS data. Follow the workflow's review and confirmation before writing.

```text
ช่วยสร้างร่างสินค้าแหวน 3 แบบ ธีมธรรมชาติ ตั้งชื่อให้แตกต่างกันและเขียนคำบรรยายสินค้าแบบละเอียด ใช้ master ที่มีอยู่จริงใน GIS เท่านั้น ห้ามเดา SKU, ID, ราคา, สต็อก หรือคุณสมบัติอัญมณี แล้วแสดงร่างให้ฉันตรวจ
```

```text
Create three distinct nature-inspired ring product drafts with creative names and detailed marketing descriptions. Use only GIS-verified masters; do not invent SKUs, IDs, prices, stock, or gemstone specifications. Show me the drafts to review.
```

### 4. Read-only PO search — `base.po-search`

Search existing GIS purchase orders. This is read-only and does not need create, approval, or receipt permission.

```text
ค้นหา PO ของ [ชื่อผู้ขาย] ที่รออนุมัติ แล้วแสดงเลข PO วันที่ รายการสินค้า จำนวน ราคาต่อหน่วย ยอดรวม และสถานะ ห้ามแก้ไขหรืออนุมัติ PO และห้ามรับสินค้า
```

```text
Find [supplier name]'s POs pending approval. Show the PO number, date, each item, quantity, unit price, total, and status. Do not modify or approve a PO, or receive inventory.
```

Replace the bracketed supplier name with one that exists in GIS.

### 5. Create a purchase order — `base.po-create`

Resolve supplier, location, voucher, and products from GIS, then follow the preview and confirmation workflow. FaroAI does not approve the created PO.

```text
เตรียมสร้าง PO สินค้า ring จำนวน 5 ชิ้น จากผู้ขาย [ชื่อผู้ขาย] ที่สาขา [ชื่อสาขา] ใช้ Purchase Order voucher ที่ใช้งานได้ใน GIS แสดง preview และรอให้ฉันยืนยันก่อนสร้าง ห้ามอนุมัติ PO หรือรับสินค้า
```

```text
Prepare a PO for 5 ring items from [supplier name] at [location name], using an active Purchase Order voucher in GIS. Resolve products and identifiers from GIS, show the preview, and wait for my confirmation. Do not approve the PO or receive inventory.
```

If required values are missing or ambiguous, FaroAI should ask for those values instead of inventing GIS IDs.

### 6. Receive against an approved PO — `base.inventory-receive`

Use only after GIS shows the PO as approved. FaroAI verifies the live PO and remaining quantities, prepares a receipt preview, then follows the confirmation workflow. It cannot approve the PO.

```text
เตรียมรับสินค้าคงเหลือจาก PO [เลข PO] ตรวจสถานะอนุมัติและจำนวนคงเหลือจาก GIS ก่อน ถ้า PO ยังไม่อนุมัติให้หยุด แสดง preview แล้วรอให้ฉันยืนยัน ห้ามอนุมัติ PO
```

```text
Prepare an inventory receipt for the remaining quantities on PO [PO number]. Verify its GIS approval status and remaining quantities first. If it is not approved, stop. Show the receipt preview and wait for my confirmation. Do not approve the PO.
```

### 7. Analyze displayed PO results — `base.data-analysis`

This uses deterministic calculations on PO lines already loaded and displayed in this conversation; it does not fetch more GIS data. It supports counts and sum, average, minimum, or maximum for quantity, unit price, and line amount. The limit is 10 displayed POs and 500 loaded lines. Incomplete data is reported as partial.

```text
จากรายการ PO ที่แสดง ช่วยคำนวณยอดรวมของ line amount
```

```text
จำนวนบรรทัดสินค้าทั้งหมดในผลลัพธ์ที่แสดงมีกี่บรรทัด?
```

```text
หาราคาต่อหน่วยเฉลี่ยจากรายการที่แสดง
```

```text
Calculate the total line amount for the displayed PO results.
```

```text
How many line items are in the displayed results?
```

```text
What is the average unit price in the displayed PO lines?
```

### 8. Export displayed PO results — `base.pdf`, `base.xlsx`, `base.docx`

First run a PO search. Export includes only the loaded PO lines currently displayed, including the active filter/view, up to 500 rows. It creates a private download that expires after 24 hours. It does not generate arbitrary documents from free-form instructions, fetch more GIS data, or store files in Qdrant. Artifact generation must be enabled in the deployment.

```text
ส่งออกรายการ PO ที่แสดงเป็น PDF
```

```text
ดาวน์โหลดบรรทัด PO ที่แสดงเป็น Excel
```

```text
ทำรายงาน Word จากรายการ PO ที่แสดง
```

```text
Export the displayed PO lines as a PDF.
```

```text
Download the displayed PO results as an Excel workbook.
```

```text
Create a Word report from the displayed PO lines.
```

## Still planned

- `base.pptx` — PowerPoint presentations. Intentionally excluded from this implementation as requested.

## Trying the examples

- For shopping and approved knowledge, use the main FAROAI search prompt and accept the AI processing notice.
- For catalog and GIS procurement, use the same prompt box; the app routes the request to its existing workflow.
- Data analysis and exports require a PO result already loaded in the same conversation. Exports also require the artifact worker to be enabled.
- A successful run depends on the provider, tenant consent, GIS MCP tools, tenant records, and permissions being configured.
- Skills guide execution; they do not grant permissions or make unverified GIS facts true.



Find Modern Heirloom POs pending approval. 
Find Heritage Gold Components pending POs and export the results as a PDF.

Change the report text color to navy and the table header background to emerald green.

Make the title dark blue, body text charcoal, and table header background gold.