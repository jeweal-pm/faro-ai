# ADR-0001: ใช้ faroai เป็นตัวกลางในการพูดคุยกับ 3rd party openrouther , Ollama, aws bedrock , localllm

- **Status:** Accepted
- **Date:** 2026-10-04
- **Deciders:** Jakapong Chan-o ( PM )

## Context

Faroai จะต้องรองรับการดึงข้อมูลจากหลากหลาย Ai Model ไม่ว่าจะเป็น GPT Gemini Claude deepseek และ model อื่นๆ   

## Decision
เลือกใช้วิธีการให้ faroai เป็นตัวกลางในการไปเชื่อมต่อกับ 3rd party เช่น openrouther , Ollama, bedrock รวมถึงตัว local LLM
โดย สำหรับ decidion model ของ ฝั่ง third party เราเลือกที่จัใช้ jev ในการตัดสินใจว่าจะเลือกใช้ model ไหนในการทำงาน

กติกาที่ทีมต้องทำตาม:

- กรณีที่ ลูกค้าใช้เฉพาะในส่วนของ Localllm เราจะต้องทำให้ลูกค้าสามารถเลือกได้ว่าจะใช้ decision model มั้ย ถ้าใช้ ระบบจะหา local model  ที่เหมาะสมแล้ว install ในเครื่องก่อนในกรณีที่ไม่ได้มี model นัะ้น แต่ถ้าไม่ใช้ ก็คือ ต้องใช้แค่ model ที่ localllm ( lm studio api ) set ไว้

-  local model จะถูก  set เป็น false ก่อนเสมอ หมายถึง ต้องติ๊กก่อนถึงใช้ได้ เพราะว่า เครื่องที่ ทำการ develop ไม่มี localllm จึ้งเน้นในการทำผ่าน 3rd party ทั่วไปก่อน


## Consequences


ADR อื่นๆที่เกี่ยวข้อง 
documents\adr\0006-can-support-local-llm.md
documents\adr\0007-from-3rdparty-to-localllm.md
documents\adr\0002-use-qdrant-for-embed-db