# Platform Base Skills development plan - 29-10-26

- Recorded user scope: centrally maintained Base Skills automatically inherited by every tenant, covering data analysis, PDF/XLSX/DOCX/PPTX and Jewelry/GIS.
- BD and Product Owner reviewed the same request and cross-reviewed scope, phased sequencing, metrics and organizational ownership.
- Added Proposed ADR-0036, Draft runtime SPEC and a development/discovery plan; these are design documents, not implemented capabilities.
- Proposed a global immutable skill release, selective loading and bounded Jev selection using existing authorization/model/MCP policies; existing catalog direct-create and PO/receipt confirmation remain distinct.
- Planned isolated document workers/private artifacts, versioning/rollback, cost tracking and phased read/write/document adapters before bounded composition.
- Flagged test-specific bulk procurement defaults for parameterization before a global base executor release.
- Used current source entrypoints and primary Agent Skills/Claude documentation as design evidence. No package install, runtime tests, container build, live GIS writes, commit or push was performed for this planning change.
