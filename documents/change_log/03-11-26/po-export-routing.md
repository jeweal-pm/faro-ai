# PO export prompt routing — 03-11-26

- The main discovery router now recognizes PO export/download/generate prompts and routes them to the procurement assistant instead of the jewelry-search model.
- Users can request a named PO search and file export in one prompt. When a follow-up refers to “these PO results” without PO rows loaded in that chat, FaroAI now gives deterministic instructions rather than an LLM refusal.
- Updated [ADR-0044](../../adr/0044-explicit-export-intent.md) and the Thai/English Base Skills specs.
