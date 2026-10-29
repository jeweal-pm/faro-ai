# ADR-0001: ใช้ qdrant สำหรับเป็น Vector Database

- **Status:** Accepted
- **Date:** 2026-10-04
- **Deciders:** Jakapong Chan-o ( PM )

## Context

เนื่องจากต้องการเก็บข้อมูลที่ prompt มาทำการ learning สำหรับทำ localllm ด้วย 



## Decision
เลือกใช้ qdrant ซึ่งเป็นVector Engine เพื่อมาดูแลเรื่อง data ที่เป็น Vector โดยเฉพาะ
กติกาที่ทีมต้องทำตาม:

- กรณีที่ ลูกค้าใช้เฉพาะในส่วนของ Localllm เราจะต้องทำให้ลูกค้าสามารถเลือกได้ว่าจะใช้ decision model มั้ย ถ้าใช้ ระบบจะหา local model  ที่เหมาะสมแล้ว install ในเครื่องก่อนในกรณีที่ไม่ได้มี model นัะ้น แต่ถ้าไม่ใช้ ก็คือ ต้องใช้แค่ model ที่ localllm ( lm studio api ) set ไว้

-  local model จะถูก  set เป็น false ก่อนเสมอ หมายถึง ต้องติ๊กก่อนถึงใช้ได้ เพราะว่า เครื่องที่ ทำการ develop ไม่มี localllm จึ้งเน้นในการทำผ่าน 3rd party ทั่วไปก่อน


## Consequences


ADR อื่นๆที่เกี่ยวข้อง 
documents\adr\0006-can-support-local-llm.md
documents\adr\0007-from-3rdparty-to-localllm.md
documents\adr\0002-use-qdrant-for-embed-db