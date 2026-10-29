# Tenant-scoped RAG Learning

Date: 16-10-26

- Added ADR-0023 and a dedicated spec for turning approved RAG documents into tenant-local supervised-learning drafts.
- Added a local-learning authorization per tenant, separate from shared-training authorization; the default remains off and authorization requires a reference.
- Added Learning controls to select approved tenant documents and ask that tenant's configured Ollama/LM Studio model to draft grounded question/answer pairs. Drafts require human review and explicit local-training approval before export.
- Enabled tenant-local consent capture and export for hosted multi-tenant deployments while retaining tenant-scoped queries and datasets; customer consent remains unchecked by default at the customer site.
- Reflected a customer's recorded local-training opt-in as the preselected Backoffice review choice. Shared training remains separately authorized and is not enabled by RAG-derived drafts.
- Updated ADR-0012, ADR-0022, the consented-improvement spec, the local-runner spec and the runner setup guide.
- Added migration 005 for tenant authorization and RAG-derived candidate metadata.
- Implementation files: gateway/src/admin.ts, ai-service/faroai/app.py, backoffice/app/admin/AdminConsole.tsx, backoffice/app/actions.ts, backoffice/app/page.tsx, backoffice/app/discovery-page.tsx, backoffice/app/globals.css, infra/postgres/migrations/005_tenant_rag_learning.sql.
- Validation: no tests or builds were run.

- Runtime setup on 16-10-26: enabled FAROAI_LOCAL_LLM_ENABLED for local learning. The local-model host allow-list remains empty until the LM Studio/Ollama endpoint is known; remote model hosts will remain blocked until explicitly allow-listed.
- Backoffice now runs from source in Next.js dev mode on loopback port 3003 because port 3001 could not be bound by the Windows dev server; API origin configuration matches. No Docker image was rebuilt. No enabled local Ollama/LM Studio provider is configured yet, so the host allow-list remains empty pending the model endpoint.
