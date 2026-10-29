# ADR-0004: ใช้ postgres สำหรับ งาน database ที่นอกเหนือจาก Vector data

- **Status:** Accepted
- **Date:** 2026-10-04
- **Deciders:** Jakapong Chan-o ( PM )

## Context
ในการทำ Applation ทั้วไป เราต้องการ DB ที่เอาไว้เก็บข้อมูลต่างๆที่นอกเหนือจาก Vector data ประกอบด้วย

- Tenant configuration
- Consent และ policy
- MCP source/configuration
- Document/chunk metadata
- content_version และ catalogue_version
- Model policy และข้อจำกัดของแต่ละ tenant
- Embedding job และ audit log
- Feedback, unanswered questions และ approved synonyms

## Decision

เราได้เลือก ใช้ postgressql มาเพื่อดูแลงานกลุ่มนี้โดยเฉพาะ เพราะว่า postgresSQL เองสามารถรองรับการ Query concurrent ได้จำนวนมหาศาล โดยหน้าที่กลุ่มงานที่นำมาตัดสินใจใช้คร่าวๆมีดังนี้

- PostgreSQL เก็บ model policy และ routing configuration ถาวร
- Redis เก็บ routing decision cache เช่น request ประเภทนี้ควรใช้ model ไหน มี TTL
- ถ้า Redis ไม่มี decision จึงประเมินใหม่ แล้วบันทึกผลกลับ Redis
- ถ้าต้องการ audit/history ค่อยบันทึก decision metadata ลง PostgreSQ

