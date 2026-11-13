# Base Skills executor rollout — 02-11-26

- Implemented deterministic `base.data-analysis` for already-loaded, displayed GIS PO lines. Supports counts, sum, average, minimum, and maximum for quantity, unit price, and line amount; max 10 POs / 500 loaded lines; partial results are disclosed.
- Connected private PDF, XLSX, and DOCX generation to fixed renderer executors. Artifact jobs bind to their Base Skill ID, use a dedicated least-privilege PostgreSQL login, and expire after 24 hours. Export only includes displayed PO lines, up to 500 rows; no Qdrant writes or free-form document execution.
- Kept `base.pptx` as `planned` and did not enable PowerPoint, per user direction.
- Added English and Thai examples and deployment limits in `example-prompt/base-skills-prompt-examples.md`.
- Updated `documents/spec/platform-base-skills.md` to distinguish the accepted target contract from shipped scope, actual endpoints, worker queue, and 24-hour artifact TTL.
- Deployment changes require migration `018_base_skill_artifact_binding`, provisioning the dedicated worker login, enabling `FAROAI_ARTIFACT_ENABLED`, and starting the `artifacts` Compose profile. Do not use the database superuser for the worker.
- Validation: Backoffice and Gateway typechecks passed; targeted prompt tests passed (4), Python analysis tests passed (5), and renderer/worker security tests passed (5). A synthetic PDF job completed through the PostgreSQL queue and its row/file were removed afterward. Migration `018` applied, the Base Skill catalog loaded 10 `ready` / 1 `planned`, and API/Backoffice returned HTTP 200. The full Backoffice test command also reported four discovery-page selector mismatches; those tests were not changed as part of this feature.
