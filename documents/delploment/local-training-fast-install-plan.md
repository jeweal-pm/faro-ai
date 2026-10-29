# แผนติดตั้งเครื่อง GPU สำหรับ Local Fine-tuning แบบเตรียมครั้งเดียว เปิดใช้ซ้ำได้

- **สถานะ:** แผนเสนอ ยังไม่ได้สร้าง Cloud resource หรือติดตั้งเครื่องจริง
- **วันที่:** 2026-10-15
- **ขอบเขต:** เตรียมเครื่องฝึก LoRA นอก FAROAI ให้เปิดเครื่องมาใช้งานได้เร็ว เก็บโมเดลและข้อมูลข้ามการปิดเครื่อง และหยุดค่า GPU เมื่อไม่ใช้งาน
- **เอกสารอ้างอิง:** [ADR-0022](../adr/0022-local-fine-tuning-runner.md), [SPEC Local fine-tuning runner](../spec/local-fine-tuning-runner.md), [GPU Cloud Pricelist](gpu-cloud-pricelist-15-10-26.html), [คู่มือ runner](../../backoffice/public/local-training/README.md)

## 1. เป้าหมาย

เตรียม environment ให้เสร็จเพียงครั้งเดียว แล้วการเทรนรอบต่อไปทำเพียง:

1. เปิด GPU instance
2. ยืนยันว่ามี CUDA และ volume สำหรับงาน
3. วาง dataset ที่ผ่าน consent/review ไว้ในพื้นที่ทำงาน
4. สั่ง runner โดยใช้ model cache ที่ดาวน์โหลดแล้ว
5. ตรวจผลลัพธ์และหยุด GPU instance

เป้าหมายด้านความเร็วหลังเตรียมเครื่องคือไม่ต้องติดตั้ง Python dependencies หรือดาวน์โหลด base model ซ้ำทุกครั้ง เป้าหมายนี้ยังต้องวัดกับผู้ให้บริการและ region ที่เลือกก่อนถือว่าผ่าน

## 2. แนวทางที่เสนอ

### ตัวเลือกหลัก: AWS EC2 ที่ Stop/Start ได้ พร้อม EBS เข้ารหัส

ใช้ instance แบบ On-Demand สำหรับ GPU และ EBS สำหรับ boot/data disk. เมื่อหยุด EC2 ค่า compute หยุด แต่ EBS ยังคงคิดค่าพื้นที่; EBS เก็บข้อมูลข้ามการ Stop/Start ได้ [AWS stop/start billing](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/how-ec2-instance-stop-start-works.html).

สำหรับการทดลอง runner ปัจจุบัน `g4dn.xlarge` (T4 VRAM 16 GB) เป็นตัวเลือกเริ่มต้นที่สมดุลตาม pricelist. ราคา `us-east-1` ประมาณ `$0.526/hour` เป็น snapshot จากผู้ให้บริการข้อมูลราคา และต้องยืนยันใน AWS Pricing/console ก่อนเปิดจริง. ภูมิภาคและ OS เปลี่ยนราคาได้. การเริ่มใหม่อาจเจอ capacity ไม่ว่าง แม้จะ Stop instance ไว้.

เหตุผลที่เลือกแนวทางนี้เป็นค่าเริ่มต้นคือเก็บ environment ไว้กับ instance, เก็บ model/data แยกบน EBS ได้ และหยุด compute โดยไม่ต้องสร้าง environment ใหม่. ใช้ราคาและ region จริงจาก console ก่อนอนุมัติงบ.

### ตัวเลือกสำรอง

- **Google Cloud:** Stop VM เพื่อหยุด CPU/GPU billing และเก็บ Persistent Disk ไว้ได้ แต่ยังมี storage charge; GPU capacity และราคาแตกต่างตาม region/zone [Google Cloud stop billing](https://docs.cloud.google.com/compute/docs/instances/suspend-stop-reset-instances-overview).
- **DigitalOcean GPU Droplet:** ไม่เหมาะกับการกดปิดทิ้งไว้เพื่อประหยัด เพราะ powered-off GPU Droplet ยังคิดค่า GPU จนกว่าจะ Destroy. ใช้ได้เมื่อ workflow เก็บข้อมูลไว้ใน volume แยกและยอมสร้าง Droplet/boot image ใหม่ทุกรอบ [DigitalOcean billing](https://docs.digitalocean.com/products/droplets/details/pricing/).
- **Runpod:** ใช้ได้ถ้าต้องการเปิดเป็น Pod ตามรอบงาน แต่ก่อนเลือกต้องยืนยัน Cloud tier, region, storage/network volume และค่าที่คิดหลังหยุด Pod จากหน้า Deploy/ราคาในขณะนั้น. อย่าถือว่าราคา Pod รวม storage ที่เก็บข้ามรอบ.

## 3. โครงสร้าง storage ที่ต้องเตรียม

แยกข้อมูลที่ต้องเก็บจาก scratch/temporary storage. ตัวอย่าง layout บน volume ที่ mount คงที่เป็น `/mnt/faro-training`:

```text
/mnt/faro-training/
├── datasets/             # JSONL export ที่อนุมัติแล้ว; จำกัดสิทธิ์และเข้ารหัส
├── model-cache/          # Transformers checkpoint ที่ดาวน์โหลดครั้งแรก
├── runs/<run-id>/        # adapter, tokenizer metadata, training-manifest.json
├── logs/                 # log ของแต่ละรอบ ไม่ใส่ secret
└── backups/              # ใช้ชั่วคราวก่อน sync กลับ storage ปลายทาง
```

- เก็บ OS, Python runtime, dependencies และ runner ใน boot disk/image ที่สร้างซ้ำได้.
- เก็บ dataset, model cache และผลลัพธ์ใน encrypted persistent data volume หรือที่จัดเก็บเข้ารหัสซึ่ง mount กลับ path เดิมได้.
- แยกแต่ละรอบใน `runs/<run-id>` เพื่อไม่เขียน adapter ทับงานก่อนหน้า.
- ห้ามเก็บข้อมูลสำคัญไว้บน instance-store/local scratch เพียงที่เดียว เพราะพื้นที่ชั่วคราวอาจหายเมื่อ instance หยุดหรือถูกสร้างใหม่.
- ค่าดิสก์/volume ยังคงคิดเงินขณะที่ GPU หยุด. กำหนด retention และลบ dataset/model cache ที่ไม่ต้องเก็บเมื่อจบงาน.

## 4. เตรียม environment ครั้งแรก

1. **เลือก cloud และสิทธิ์ใช้งาน**
   - ใช้บัญชี/โปรเจกต์สำหรับทดลองโดยเฉพาะ และตั้ง budget alert ก่อนสร้าง GPU.
   - ตรวจ GPU quota, region/zone availability, ราคา Linux, disk, IP และ network egress.
   - ใช้ IAM role ที่ให้สิทธิ์เฉพาะอ่าน dataset ที่กำหนด, เขียนผลลัพธ์ที่กำหนด และจัดการ instance เท่าที่จำเป็น.
2. **สร้างเครื่องที่เข้าถึงแบบส่วนตัว**
   - ใช้ Linux x86_64 image ที่รองรับ NVIDIA CUDA; ใช้ AWS Deep Learning AMI หรือ base image ที่ทีมดูแลได้.
   - ห้ามเปิด SSH/RDP สู่ internet แบบกว้าง. ใช้ Session Manager/console access หรือ allowlist IP ชั่วคราว.
   - เข้ารหัส boot disk, data disk และ snapshot; ปิด public bucket/object access.
3. **ติดตั้ง software ครั้งเดียว**
   - ใช้ Python 3.12 และ virtual environment.
   - ติดตั้ง `train_lora.py` กับ requirements ของ runner โดยใช้ `pip --no-cache-dir` เพื่อลด pip download cache.
   - ก่อนใช้จริง ให้ pin เวอร์ชันที่ผ่านการทดสอบลง lock file ของ training image; requirements ปัจจุบันเป็น version ranges จึงยังไม่รับประกัน reproducibility แบบ byte-for-byte.
   - ตรวจ driver/CUDA/PyTorch ว่าเห็น GPU จริงด้วย `nvidia-smi` และ `torch.cuda.is_available()`.
4. **mount volume และตั้ง path ให้คงที่**
   - mount encrypted data volume ทุกครั้งที่ boot ที่ `/mnt/faro-training`.
   - ตรวจ filesystem, สิทธิ์ผู้ใช้, พื้นที่ว่าง และเจ้าของ directory ก่อนเริ่ม job.
   - ตั้ง model cache เป็น `/mnt/faro-training/model-cache`; อย่าใส่ API keys หรือ credentials ไว้ใน shell history หรือไฟล์ command.
5. **warm cache และสร้าง machine image**
   - ดาวน์โหลดเฉพาะ base checkpoint ที่เลือกและมี license ใช้งานได้ ลง persistent `model-cache`.
   - รัน smoke check ขนาดเล็กเพื่อยืนยัน dependencies, GPU, mount, อ่าน JSONL และเขียนผลลัพธ์ได้.
   - หลังผ่านการตรวจ จึงสร้าง AMI/snapshot ของ boot environment; ไม่ bake dataset หรือ credentials ลง image.
   - บันทึก Python, driver, CUDA, PyTorch/Transformers/PEFT versions, image ID, รุ่น GPU, region และวันที่ไว้กับเอกสาร runbook.

## 5. ขั้นตอนใช้ซ้ำในแต่ละรอบ

### ก่อนเปิด GPU

- ยืนยันเงื่อนไข local training ตาม ADR-0012/ADR-0022/ADR-0023: เปิด local LLM, มี tenant authorization และ consent ตามแหล่งข้อมูล, ผ่าน human review และอนุมัติ preferred answer แล้ว; รองรับ hosted multi-tenant โดย export แยก tenant.
- Export dataset ผ่าน Backoffice แล้วเก็บชั่วคราวในพื้นที่เข้ารหัส. ตรวจ manifest/hash และ tenant scope.
- ยืนยันว่า dataset ไม่ใช่ shared-training data และไม่มี secret/ข้อมูลที่ไม่ควรนำไปฝึก.
- เลือก `run-id`; เตรียมงบประมาณเวลารอบนี้และแจ้งเตือนค่าใช้จ่าย.

### เปิดและรัน

1. Start instance จาก image ที่ผ่านการเตรียมไว้.
2. mount persistent volume และตรวจ `nvidia-smi`, CUDA, free disk, และไฟล์ `model-cache`.
3. คัดลอก dataset ที่ได้รับอนุมัติลง `datasets/<run-id>.jsonl`; ตรวจ hash ก่อนเริ่ม.
4. สั่ง runner ด้วย path บน volume ตัวอย่าง:

   ```bash
   python train_lora.py \
     --dataset /mnt/faro-training/datasets/<run-id>.jsonl \
     --model Qwen/Qwen2.5-0.5B-Instruct \
     --model-cache-dir /mnt/faro-training/model-cache \
     --output-dir /mnt/faro-training/runs/<run-id> \
     --max-sequence-length 512
   ```

5. เก็บ log และตรวจว่ามี `adapter/`, tokenizer metadata และ `training-manifest.json`; ทดสอบ adapter แยกกับ held-out prompts ก่อนนำไปใช้.
6. ส่งผลที่ต้องเก็บกลับ encrypted S3/object storage หรือดาวน์โหลดสู่พื้นที่ควบคุมของ tenant. ห้ามปล่อย adapter เข้า LM Studio หรือ production อัตโนมัติ.
7. ตรวจว่าสำรองครบแล้วจึง Stop instance. ลบข้อมูลชั่วคราวตาม retention policy.

## 6. ค่าใช้จ่ายและการปิดเครื่อง

- **AWS:** `Stop` EC2 เพื่อหยุดค่า instance compute; EBS และ snapshot ยังคิด storage charge. อย่า `Terminate` จนตรวจ DeleteOnTermination และยืนยันว่ามี backup ของ dataset/adapter ที่ต้องเก็บแล้ว.
- **Google Cloud:** `Stop` VM เพื่อหยุด CPU/GPU charge; persistent disk/IP ที่ยังเก็บไว้มีค่าใช้จ่าย. Local SSD อาจไม่คงข้อมูลเมื่อหยุด.
- **DigitalOcean GPU:** `Power off` ไม่หยุดค่า GPU Droplet; ต้อง `Destroy` เพื่อหยุด compute charge. สำรองข้อมูลออกจาก boot disk ก่อน Destroy.
- **ทุกค่าย:** ตั้ง budget alert; ตรวจสถานะใน billing console หลังหยุดจริง; ลบ unattached volume, snapshots, public IP และ storage ที่ไม่จำเป็น.
- จัดเก็บ artifact บน object storage มี storage/egress charge และต้องตั้ง encryption, access policy, lifecycle expiration, และ audit.

## 7. Security และ data handling

- Cloud GPU เป็นเครื่องฝึกแยกจาก FaroAI; ไม่เปิด inbound API และไม่ให้ runner ต่อ Qdrant, FaroAI database, OpenRouter หรือ LM Studio API.
- ใช้เฉพาะ JSONL export ที่ผ่าน consent/review; จำกัดข้อมูลต่อ tenant และสิทธิ์ผู้ปฏิบัติงาน.
- เข้ารหัส disk, volume, snapshots, object storage และทางส่งข้อมูล; ใช้ role/short-lived credentials แทน key ฝังใน image.
- ไม่ใส่ข้อมูลจริงใน image, AMI, source repository, issue tracker หรือ log. ไม่เปิด volume เป็น public.
- ตรวจ model license, provenance, dataset hash และ output hash ก่อนส่งต่อ.
- เมื่อหมดอายุ ให้ลบ dataset, checkpoint, cache และสำเนา backup ตามนโยบาย tenant; บันทึกการลบตามขั้นตอนปฏิบัติการ.
- Qdrant เป็น retrieval index เท่านั้น. Dataset และ adapter ไม่ถูกส่งเข้า Qdrant.

## 8. ข้อจำกัดของ runner ที่ต้องทราบก่อนทำ automation

- ปัจจุบัน runner ตั้ง `save_strategy="epoch"`, ค่าเริ่มต้น 1 epoch และไม่มี option `--resume-from-checkpoint`. ถ้า instance ถูกหยุดกลาง epoch งานจะไม่ทำต่อจากจุดเดิมโดยอัตโนมัติ; ต้องเริ่มรอบใหม่.
- เพื่อกันค่าใช้จ่ายและงานหาย ให้ตั้งกระบวนการปิดแบบ graceful และอย่าหยุด instance จน Trainer จบและ output ผ่าน checklist.
- ถ้าต้องรองรับ interruption/resume จริง ค่อยทำ enhancement แยก: periodic checkpoint, resume argument, manifest สถานะ และทดสอบ restore. การเปลี่ยนนี้ต้องอัปเดต SPEC และ changelog ก่อนใช้งาน.
- ไม่ย้าย training dependencies เข้า FaroAI Docker images และไม่ทำให้ export แล้วเริ่มเทรนอัตโนมัติ.

## 9. เกณฑ์รับมอบเมื่อลงมือทำแผน

- [ ] เปิด/หยุด GPU ได้จาก console หรือ script ที่จำกัดสิทธิ์ และหยุดแล้วค่า compute ลด/หยุดตาม billing page.
- [ ] Boot image มี Python, runner dependencies และ NVIDIA runtime ที่ตรวจเวอร์ชันได้.
- [ ] หลัง Stop/Start, persistent volume mount กลับ path เดิม; model cache ใช้ซ้ำโดยไม่ดาวน์โหลด base model ใหม่.
- [ ] dataset และ output ไม่อยู่บน temporary disk เพียงที่เดียว; encrypted at rest และจำกัดสิทธิ์.
- [ ] run log เก็บ run-id, dataset hash, model ID, image/GPU, parameter สำคัญ, start/end time และ output location โดยไม่บันทึก secret.
- [ ] ตัวอย่าง run จบครบ, มี adapter/manifest, hash ตรง และสามารถดาวน์โหลด/สำรองก่อนหยุดเครื่อง.
- [ ] budget alert, idle-cost check, volume cleanup และ data-retention ขั้นตอนถูกทดลองแล้ว.
- [ ] ไม่มี data/adapter/credentials ใน Qdrant, FaroAI Docker image, Git หรือ public object storage.

## 10. ลำดับงานเมื่ออนุมัติให้ลงมือ

1. เลือก cloud/region และยืนยันราคา/quota/ความพร้อมใน console.
2. สร้าง account permissions, budget alert, private access, encrypted EBS และ GPU instance.
3. ทำ provisioning script แบบ idempotent สำหรับ mount, environment check, logs และ start/stop.
4. ติดตั้ง dependencies, pin tested versions, warm model cache และสร้าง AMI.
5. ทดลอง Stop/Start โดยตรวจ cache persistence และต้นทุน disk.
6. ทดลองหนึ่ง approved dataset โดยเริ่มจากชุดเล็ก; เก็บเวลา/token count จริงเพื่อแทนค่าประมาณใน pricelist/operating notes.
7. สรุป runbook, cost observations, cleanup policy และผลทดสอบ; อัปเดต SPEC/changelog หาก implementation แตกต่างจากแผน.

## 11. แหล่งอ้างอิง

- [AWS EC2 Stop/Start และ EBS billing](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/how-ec2-instance-stop-start-works.html)
- [AWS EBS volume คงอยู่และค่าใช้จ่าย](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-instance-lifecycle.html)
- [Google Cloud Stop/Start billing](https://docs.cloud.google.com/compute/docs/instances/suspend-stop-reset-instances-overview)
- [DigitalOcean GPU Droplet pricing/billing](https://docs.digitalocean.com/products/droplets/details/pricing/)
- [FAROAI GPU cloud pricelist ที่จัดทำใน repo](gpu-cloud-pricelist-15-10-26.html)

