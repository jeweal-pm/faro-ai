# ADR-0001: ใช้ faroai เป็นตัวกลางในการพูดคุยกับ 3rd party openrouther , Ollama, aws bedrock , localllm

- **Status:** Accepted
- **Date:** 2026-10-04
- **Deciders:** Jakapong Chan-o ( PM )

## Context

เนื่องด้วยเวลาในการพัฒนาที่จำกัด เราจึงจำเป็นจต้องหา local project ของเราที่เคยทำไว้มาพัฒนาต่อ

## Decision
นำโปรเจค Ai ที่เคยทดลองทำแต่ยังไม่ได้ใช้งาน โฟลเดอร์ faroai_example มา migrate เป็น ภาษาตาม  documents\adr\tech-stack.md


กติกาที่ทีมต้องทำตาม:

- ต้องเขียนตาม best pratice ของภาษา หรือ framework นั้นๆ

- กรณี Ai ต้องใช้ Skill / subagent ที่สร้างไว้สำหรับ ภาษานั้นๆเท่านั้น ถ้าไม่มี Skills หรือ Subagebt ที่เกี่ยวข้องให้ถามกลับมา และไม่ต้องทำอไร

- มีการทำ testcase ทั้งฝั่ง frontend และ backend

## Consequences


ADR อื่นๆที่เกี่ยวข้อง 
documents\adr\tech-stack.md