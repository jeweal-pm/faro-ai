# หลังเทรน LoRA เสร็จ ต้องทำอะไรต่อ

- วันที่: 2026-10-18
- สถานะ: คู่มือปฏิบัติการสำหรับผลลัพธ์จาก `train_lora.py`; ยังไม่มี Python inference server หรือการเชื่อม inference เข้ากับ FAROAI

## สิ่งที่ runner สร้าง

เมื่อคำสั่ง train จบสำเร็จ จะได้โฟลเดอร์ output เช่น:

```text
D:\FaroTraining\runs\gemma4-12b-first\
  adapter\
  training-manifest.json
```

- `adapter/` เป็น PEFT LoRA adapter ไม่ใช่ base model และไม่ใช่โมเดลเต็มที่เปิดใช้งานได้เอง
- `training-manifest.json` ระบุ base model ID, ชุดข้อมูลและ SHA-256, จำนวนตัวอย่าง, ค่าฝึก และตำแหน่ง model cache
- Base checkpoint ที่ดาวน์โหลดไว้จะอยู่ที่ `D:\FaroTraining\model-cache` ตามคำสั่งตัวอย่าง ต้องเก็บไว้หรือเตรียมดาวน์โหลด base model ID เดิมใหม่เมื่อต้องย้ายเครื่อง
- runner ไม่ได้สร้าง API, รวม adapter เข้ากับ base model, แปลง GGUF, ส่งไฟล์กลับ FAROAI หรือ deploy โมเดล

## ทำทันทีหลังเทรน

1. รอจน runner จบและเห็นข้อความ `LoRA adapter saved to:` และ `This created an adapter only` โดยไม่มี error
2. ตรวจว่ามี `adapter/` และ `training-manifest.json` ในโฟลเดอร์ output เปิด manifest เพื่อยืนยัน `base_model`, `dataset_sha256` และ `example_count`
3. เก็บ output, dataset ที่ใช้, manifest และ base checkpoint/cache ไว้ด้วยกันในพื้นที่จำกัดสิทธิ์และเข้ารหัส ห้าม commit เข้า Git หรือใส่ shared folder ที่ tenant อื่นเข้าถึงได้
4. ประเมิน adapter ด้วยคำถามชุดใหม่ที่ไม่ได้ใช้ train แล้วเทียบคำตอบกับ base model ก่อนอนุมัติให้ใช้งาน

ชุด `2026-10-18-kt-local-training-test.jsonl` ที่สร้างไว้เป็นชุดทดลองจากสินค้า GIS 77 รายการ โดยขยายเป็นคำถามหลายสำนวน รวม 1,000 แถว จึงไม่ใช่ข้อมูลอิสระ 1,000 เรื่อง และไม่ควรใช้ไฟล์เดียวกันเป็นทั้งชุด train และชุดประเมินผล อย่าใช้ mapping prompt-to-product จาก discovery evaluation เป็นเฉลยความถูกต้องโดยไม่มีผู้ตรวจ

## ถ้าจะให้ FaroAI เรียก adapter นี้โดยไม่ใช้ LM Studio

การรัน Python แทน LM Studio ยังเป็นการรันโมเดลแบบ self-hosted: เครื่อง inference ต้องโหลด base model เดิมพร้อม adapter และให้บริการ API ระหว่างที่ FAROAI เรียกใช้ การได้ไฟล์ adapter กลับมาอย่างเดียวไม่ได้เชื่อมต่อ FAROAI

ต้องพัฒนาส่วนต่อไปนี้ก่อน:

1. **Python inference server** ที่โหลด Transformers base model ตาม manifest และ PEFT adapter จาก output พร้อม endpoint ตรวจสุขภาพ, แสดง model ID และรับคำขอ chat ในรูปแบบ API ที่ตกลงใช้
2. **การเชื่อมฝั่ง FAROAI** ให้รองรับ inference provider/API ดังกล่าว ปัจจุบัน local provider ใน Learning จำกัดไว้ที่ Ollama และ LM Studio และ host ของ endpoint ต้องผ่านนโยบายตรวจสอบ host ที่อนุมัติไว้
3. **การเชื่อมเส้นทางผลิตภัณฑ์**: local model connection ที่มีอยู่ใช้สร้าง draft ใน Learning ไม่ได้ทำให้ Jev หรือ Discovery เลือก adapter นี้ตอบลูกค้าโดยอัตโนมัติ การนำไปใช้ใน product search ต้องออก ADR/spec และทำ routing แยกให้ชัดเจน
4. **การเปิดทางเข้าถึงเครื่อง**: หลัง server และ policy รองรับแล้วจึงค่อยพิจารณา ngrok สำหรับทดลอง เครื่องต้องเปิดและมีทรัพยากรพอขณะให้บริการ ห้ามเปิด endpoint สาธารณะแบบไม่มี authentication; จำกัดผู้เรียก ใช้ HTTPS และอย่าเปิดพอร์ตหรือโฟลเดอร์ฝึกให้ภายนอก

ดังนั้นตอนนี้อย่าเพิ่งเปิด ngrok หรือคาดหวังว่าใส่ URL ใน Backoffice แล้ว FAROAI จะเรียก Python server ได้ทันที เส้นทางนี้ยังไม่มี implementation ใน repository

## ถ้าไม่ต้องการดูแล inference server เอง

เก็บ adapter ไว้จนกว่าจะเลือกบริการที่รับ base model/adapter รูปแบบนี้และให้บริการ inference ได้ บริการนั้นต้องรองรับ model family และ adapter format ที่ใช้จริง หากเลือก OpenRouter สำหรับ inference ตามปกติ FAROAI จะยังใช้โมเดลที่ OpenRouter ให้บริการ แต่ไฟล์ LoRA ที่ฝึกเองจะไม่ถูกใช้กับโมเดลเหล่านั้นโดยอัตโนมัติ

ข้อมูลเอกสารที่ index เข้า Qdrant เป็นอีกเส้นทางหนึ่ง: RAG สามารถดึงข้อมูลให้โมเดล hosted เช่น OpenRouter ใช้ตอบได้ โดยไม่ต้องนำ LoRA ไป deploy การ index และการตอบด้วย adapter เป็นคนละ workflow

## สรุป

ผลการ train คือ adapter ที่รอประเมินและ deploy ไม่ใช่ endpoint ที่ FaroAI เรียกได้แล้ว ขั้นต่อไปที่เลือกได้คือสร้าง/เตรียม inference service ที่รองรับ adapter หรือเก็บผลลัพธ์ไว้ก่อน ส่วนการเชื่อม Python server ผ่าน ngrok และการให้ Jev/Discovery เลือกใช้ต้องมี implementation และ ADR/spec เพิ่มเติม

