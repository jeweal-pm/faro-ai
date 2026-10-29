# Local training fast-install plan — 15-10-26

- Added a detailed, proposed plan for preparing a reusable external GPU workstation for the local LoRA runner.
- Added a responsive, reader-friendly HTML version with a table of contents, provider comparison, visual setup/run sections, cost notes, and acceptance checklist at `documents/delploment/local-training-fast-install-plan.html`.
- Covers AWS Stop/Start with encrypted EBS as the preferred repeat-use pattern, Google Cloud and DigitalOcean alternatives, persistent model cache/data/artifacts, one-time image preparation, per-run steps, cost controls, security, retention, and acceptance criteria.
- Calls out current runner limitation: it does not resume an interrupted epoch, so graceful completion is required unless a later SPEC-backed enhancement adds resume support.
- This is documentation only. No cloud resources, images, volumes, scripts, or billing settings were created or changed.
