# ADR-0006: LocalLLM Support

- **Status:** Accepted
- **Date:** 2026-10-04
- **Deciders:** Jakapong Chan-o ( PM )

## Context

FaroAI requires a runtime for AI orchestration, MCP integration, document processing, embedding generation, RAG context assembly, background workers and retrieval evaluation.

Next.js is better suited for the web interface and administration panel, while Hono.js is better suited for the public API boundary, authentication, tenant validation, consent checks, rate limiting and streaming responses.

Python has a mature ecosystem for:

- AI/LLM provider integrations
- Embedding generation
- Document parsing and chunking
- RAG pipelines
- MCP connectors
- Background workers
- Evaluation and experimentation
Using Python does not require a GPU by default. When FaroAI uses OpenRouter or hosted embedding APIs, GPU processing happens on the provider side. Local GPU usage is only required when running local models or embedding models through Ollama or another local inference runtime.


## Decision
Use Python as the internal AI service and worker runtime for FaroAI.

Python will be responsible for:

- AI orchestration and model routing
- MCP synchronization and live-tool adapters
- Document sanitization and chunking
- Embedding generation
- RAG context assembly
- Qdrant vector upserts and retrieval pipelines
- Background jobs and retries
- Retrieval evaluation and quality checks
- OpenRouter, Ollama and LM Studio adapters

Hono.js remains the public API and security boundary. Python services must not bypass Hono authorization, tenant validation or consent checks. Every job sent to Python must include a validated `tenant_id`, permission context and correlation ID.

The initial Python deployment will run CPU-only. GPU support will be optional and enabled only for local model or local embedding workloads that justify the additional resource cost.

PostgreSQL remains the durable source of truth, Qdrant handles vector search, and Redis handles cache, queue coordination, locks and short-lived decision state.




## Consequences

**ข้อดี**
- ไม่ต้องเรียก third party ตลอดเวลา และทำให้เราสามารถมี faroai ของเราฉลาดยิ่งขึ้นในอนาคตสามรรถแยกขยายได้เป็นหลาย model หลายรูปแบบการใช้งาน
