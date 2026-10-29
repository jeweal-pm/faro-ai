# Prompt ตัวอย่างสำหรับสร้างชุดร่างสินค้าและเพิ่มเข้า GIS ผ่าน MCP

ใช้เป็นแนวทางสำหรับ AI client ที่เชื่อม MCP server ของ GIS: ผู้ใช้พิมพ์คำขอทั่วไปได้ เช่น “เพิ่มสินค้าเกี่ยวกับ ring 10 ชิ้น” หรือ “เพิ่มสินค้าเกี่ยวกับ Diamond 10 ชิ้น” แล้วให้ AI แตกเป็นแนวคิดสินค้าที่แตกต่างกัน ก่อนถามข้อมูลจริงที่ยังขาดและค่อยเพิ่มผ่าน MCP

## กติกาการแปลงคำขอทั่วไปเป็นชุดร่าง

- สร้างแนวคิดให้ครบตามจำนวนที่ผู้ใช้ขอ โดยทำชื่อสินค้า, `Matatag`, คำบรรยายการตลาด และ tags ให้หลากหลายและสอดคล้องกับหมวด/ธีมที่ระบุ
- ความคิดสร้างสรรค์ใช้ได้เฉพาะข้อความนำเสนอสินค้า ห้ามแต่ง SKU, ID, master ID, ราคา, ต้นทุน, ภาษี, สต็อก, สาขา, น้ำหนัก, จำนวน/น้ำหนักพลอย, ใบรับรอง หรือคุณสมบัติจริงอื่น ๆ
- ถ้ารายละเอียดชนิดพลอยยังไม่พอ ห้ามถือว่าคำว่า Diamond หมายถึงข้อมูล cut, clarity, color, shape, carat, จำนวนเม็ด หรือ setting แบบใดแบบหนึ่ง ให้ถามเพิ่มหรือเว้นฟิลด์ที่ GIS อนุญาต
- ค้น master จาก GIS ก่อนจับคู่ชื่อกับ ID จริง หากไม่มีหรือมีหลายตัวเลือก ให้แสดงตัวเลือก/ถามผู้ใช้ ห้ามสร้าง master เอง
- แสดงร่างทุกชิ้นและฟิลด์ที่ยังขาดให้ผู้ใช้ตรวจและเติมก่อนเริ่ม preview; อย่าเรียก create tool ในขั้นร่าง
- ก่อนบันทึก ให้ preview สินค้าทุกชิ้นด้วย payload ที่ผู้ใช้เห็น หากมีชิ้นใดไม่ผ่านหรือมีประเด็นต้องตัดสินใจ ให้หยุดทั้งชุดเพื่อแก้ก่อน
- ขอคำยืนยันขั้นสุดท้ายก่อน create และสร้างทีละชิ้นตาม payload ที่ตรวจแล้ว หากล้มเหลวกลางชุดให้รายงานชิ้นที่สำเร็จ/ไม่สำเร็จ และห้าม retry แบบไม่ตรวจ GIS ก่อน

ตัวอย่างด้านล่างแสดง schema ของสินค้าหนึ่งชิ้นเท่านั้น ค่าตัวเลข/ข้อความและ placeholder เป็นข้อมูลตัวอย่าง ห้ามนำไปสร้างจริงโดยไม่ให้ผู้ใช้ตรวจและยืนยัน

```text
ใช้ MCP tools เพื่อเตรียมและเพิ่มสินค้าใหม่ในองค์กรที่ตั้งค่าไว้กับ MCP_ORG_DB โดยต้องอ่าน master ที่มีอยู่จริงใน GIS ก่อน

ขั้นตอนและกติกา:
- ขั้นแรก เรียก `get_product_master_data` สำหรับ master ที่สินค้านี้ใช้จริงเท่านั้น เช่น Item, Collection, Style, Category, Metal, Color, Size, Stone, Stone Group, Shape, Cut, Clarity, Stone Color, Stone Size, Setting Type, Location และ Tax ใช้ `query` ค้นทีละชื่อเมื่อจำเป็น
- จับคู่ชื่อ/รหัสจากข้อมูลสินค้าเข้ากับผลที่ GIS ส่งกลับ ถ้ามีหลายรายการที่ใกล้เคียงหรือไม่แน่ใจว่าเป็นรายการเดียวกัน ให้แสดงตัวเลือกและถามฉัน ห้ามเลือกเอง
- ใช้ `id`, `name` และ `code` ของ master จากผล GIS เท่านั้น ห้ามใช้ ID ตัวอย่างใน prompt, เดา ID หรือส่งชื่อ/รหัสที่ไม่มีใน GIS แทน ID ที่หาไม่พบ
- ถ้า master ที่จำเป็นไม่มีหรือจับคู่ไม่ได้ ให้หยุดและแจ้งชื่อ master ที่ขาด ห้ามเรียก `create_product_master` เอง เว้นแต่ฉันสั่งให้สร้าง master นั้นอย่างชัดเจน หลังได้รับอนุญาต ให้ตรวจซ้ำก่อนสร้าง และห้ามสร้าง location หรือ tax ผ่าน MCP
- ใช้เฉพาะข้อมูลสินค้าที่ฉันให้และ master ที่ GIS ส่งกลับ ห้ามเดาหรือสร้าง SKU, ID, master ID, location, ราคา, สต็อก, น้ำหนัก หรือรายละเอียดพลอยขึ้นเอง ถ้าข้อมูลที่จำเป็นไม่มี ให้ถามฉัน
- SKU และ ID ต้องไม่ซ้ำ ถ้า tool แจ้งว่าซ้ำ ให้หยุดและแจ้งฉัน ห้ามแก้หรือเขียนทับสินค้าเดิม
- ต้องใช้ GIS ID จริงสำหรับ master ที่เลือก รวมถึง `location_id` ใน `price_details` และ `other_details` ถ้าจะส่งสองฟิลด์นี้ หากไม่มี ID ที่ตรงกัน ให้ถามฉันก่อน
- ส่ง `price_details` และ `other_details` เฉพาะเมื่อฉันให้ข้อมูลราคา/จุดสั่งซื้อมาแล้ว หากไม่ได้ให้ข้อมูล ให้ละฟิลด์นั้นไว้ ห้ามใส่ศูนย์เพื่อแทนข้อมูลที่ไม่ทราบ และห้ามถือว่า `OtherDetails` เป็นธุรกรรมรับสินค้าเข้าคลัง
- สินค้านี้เป็นสินค้าเดี่ยว จึงตั้ง product_variants_enable เป็น "0" ถ้าข้อมูลนี้ต้องมี variants จริง ให้หยุดและแจ้งฉัน เพราะ create_product ไม่ได้สร้าง variant records
- สถานะ "0" หมายถึง inactive สำหรับสินค้าทดลอง ถ้าต้องการเปิดใช้งานจริงต้องระบุ status เป็น "1"
- เมื่อข้อมูลและ master ครบ ให้ประกอบ payload แล้วเรียก `preview_product` ก่อน ถ้า `valid` เป็น `false`, พบ SKU/ID ซ้ำ หรือมีคำเตือนที่ต้องตัดสินใจ ให้หยุดและแจ้งฉัน ห้ามสร้างสินค้าต่อเอง
- เมื่อ preview ผ่านและไม่มีประเด็นค้าง ให้เรียก `create_product` ด้วย payload เดิมเพียงครั้งเดียว แล้วแจ้งผลและ product ID ที่ระบบส่งกลับ

ข้อมูลสินค้า:
{
  "name": "Avenues Statement Hinged Bracelet - MCP Demo",
  "SKU": "[ใส่ SKU ใหม่ที่ไม่ซ้ำ]",
  "ID": "[ใส่ Product ID ใหม่ที่ไม่ซ้ำ]",
  "Matatag": "18 Karat Gold Statement Diamond Hinged Cuff",
  "Description": "Asymmetrical lines enhanced with brilliant diamond clarity highlight this striking crown design.",
  "alternateDescription": [],
  "item": "Bracelet",
  "item_code": "B",
  "item_id": "[ใส่ Item master ID ถ้ามี]",
  "collection": "AVENUES",
  "collection_code": "AVENUES",
  "collection_id": "[ใส่ Collection master ID ถ้ามี]",
  "style": "Best Seller",
  "style_code": "Best Seller",
  "style_id": "[ใส่ Style master ID ถ้ามี]",
  "categories": [
    { "id": "[Category ID ของ Bracelets ถ้ามี]", "name": "Bracelets" },
    { "id": "[Category ID ของ Best Seller ถ้ามี]", "name": "Best Seller" },
    { "id": "[Category ID ของ Cleo by Sky ถ้ามี]", "name": "Cleo by Sky" },
    { "id": "[Category ID ของ New Arrival ถ้ามี]", "name": "New Arrival" }
  ],
  "metal": "White gold",
  "metal_code": "WG",
  "metal_id": "[ใส่ Metal master ID ถ้ามี]",
  "color": "WG",
  "color_code": "WG",
  "color_id": "[ใส่ Color master ID ถ้ามี]",
  "size": "XXS",
  "size_code": "XXS",
  "size_id": "[ใส่ Size master ID ถ้ามี]",
  "gross_weight": 1,
  "net_weight": 1,
  "labor": 300,
  "cost_price": 5250,
  "unit": "Pcs",
  "ConsumerLifestage_": ["Adult"],
  "Gender": ["Female"],
  "SpecifiedOccasion": ["Personal"],
  "product_tags": "AVENUES",
  "status": "0",
  "product_variants_enable": "0",
  "Point_of_sale": 1,
  "Point_of_sale_eCommerce": 1,
  "stones": [
    {
      "stone": "Diamond",
      "stone_code": "DD",
      "stone_id": "[ใส่ Stone master ID ถ้ามี]",
      "stone_group": "Diamond",
      "stone_group_code": "DIA",
      "stone_group_id": "[ใส่ Stone Group master ID ถ้ามี]",
      "shape": "Round",
      "shape_code": "RD",
      "shape_id": "[ใส่ Shape master ID ถ้ามี]",
      "cut": "None",
      "cut_code": "None",
      "cut_id": "[ใส่ Cut master ID ถ้ามี]",
      "color": "None",
      "color_code": "None",
      "color_id": "[ใส่ Stone Color master ID ถ้ามี]",
      "size": "0.5MM",
      "size_code": "0.5MM",
      "size_id": "[ใส่ Stone Size master ID ถ้ามี]",
      "setting_type": "Prong",
      "setting_type_code": "Prong",
      "setting_type_id": "[ใส่ Setting Type master ID ถ้ามี]",
      "variant": "1",
      "unit": "Cts",
      "pcs": 19,
      "carat_weight": 0.18,
      "price": 110000,
      "pointer": 0.01,
      "certificate_type": "",
      "certificate_number": ""
    },
    {
      "stone": "Black Onyx",
      "stone_code": "BO",
      "stone_id": "[ใส่ Stone master ID ถ้ามี]",
      "stone_group": "Color Stone",
      "stone_group_code": "CS",
      "stone_group_id": "[ใส่ Stone Group master ID ถ้ามี]",
      "shape": "Brilliant Round",
      "shape_code": "BR",
      "shape_id": "[ใส่ Shape master ID ถ้ามี]",
      "cut": "Good",
      "cut_code": "Good",
      "cut_id": "[ใส่ Cut master ID ถ้ามี]",
      "clarity": "Si1",
      "clarity_code": "Si1",
      "clarity_id": "[ใส่ Clarity master ID ถ้ามี]",
      "color": "D",
      "color_code": "D",
      "color_id": "[ใส่ Stone Color master ID ถ้ามี]",
      "unit": "Cts",
      "pcs": 0,
      "carat_weight": 0.2,
      "price": 0,
      "variant": "0"
    }
  ],
  "price_details": [
    {
      "location_id": "[ใส่ GIS Location ID จริง]",
      "currency": "USD",
      "taxrate_id": "[ใส่ Tax master ID ถ้ามี]",
      "tax": 981.31,
      "retailprice_ex": 14018.69,
      "retailprice_inc": 15000,
      "inv_retailprice_ex": 14018.69,
      "inv_retailprice_inc": 15000,
      "tax_type": "Inclusive",
      "tax_rate_value": "7"
    },
    {
      "location_id": "[ใส่ GIS Location ID จริงของสาขาที่สอง]",
      "currency": "THB",
      "tax": 4252.34,
      "retailprice_ex": 60747.66,
      "retailprice_inc": 65000,
      "inv_retailprice_ex": 60747.66,
      "inv_retailprice_inc": 65000,
      "tax_type": "Inclusive",
      "tax_rate_value": "7"
    }
  ],
  "other_details": [
    {
      "location_id": "[ใส่ GIS Location ID จริง]",
      "current_stock": 0,
      "available_stock": 0,
      "reorder_point": 10,
      "reorder_quantity": 10
    },
    {
      "location_id": "[ใส่ GIS Location ID จริงของสาขาที่สอง]",
      "current_stock": 0,
      "available_stock": 0,
      "reorder_point": 10,
      "reorder_quantity": 10
    }
  ]
}
```

## หมายเหตุ

- ค่าชื่อ/รหัสและตัวเลขด้านล่างเป็นเพียงตัวอย่าง ห้ามใช้แทนข้อมูลจริงโดยอัตโนมัติ ให้ค้น master ก่อนและแทนทุก placeholder ด้วยข้อมูลที่ฉันให้หรือผลจริงจาก GIS; prompt นี้ยังเรียกใช้ไม่ได้จนกว่าจะใส่ SKU, ID และ ObjectId จริง 24 ตัวอักษรฐาน 16
- `create_product` สร้างเอกสารสินค้าหลักใน `tbl_products`; ระบบสร้าง `_id`, `Slug`, timestamps, `imageSku`, `type`, `product_type`, `is_delete` และข้อมูลผู้สร้างให้อัตโนมัติ
- `price_details` เป็นราคาของแต่ละ location ส่วน `other_details` เป็นค่าคงเหลือ/จุดสั่งซื้อที่แสดงในเอกสารสินค้า ไม่ได้สร้างรายการรับสินค้าใน `tbl_po_products`
- `preview_product` ตรวจข้อมูลและ master references โดยไม่เขียนฐานข้อมูล แต่ผล preview ไม่ได้จอง SKU หรือ ID; `create_product` ตรวจซ้ำก่อนบันทึก
- การสร้าง variant records, `choice`, และอัปโหลดภาพเป็น binary ยังต้องทำผ่าน GIS แยกต่างหาก
- หากไม่มีราคาต่อ location สินค้าอาจยังไม่ปรากฏใน `search_products`
