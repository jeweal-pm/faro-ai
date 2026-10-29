## Deployment update — 14-10-26

- Rebuilt `faroai-api` and `faroai-backoffice` from the current source.
- Removed the local Compose bind mount that overlaid the API image's compiled `/app/dist` with host `gateway/dist`; this prevents stale or incomplete host output from hiding the rebuilt API.
- Recreated only the API and Backoffice containers. API health is healthy, Backoffice returns HTTP 200, and its served provider UI bundle contains the Jev 1.13 eligibility guidance.
- Replaced images: `faroai-api:latest` (`d1fba441e614`) and `faroai-backoffice:latest` (`5320c66a9146`). No old dangling FaroAI API or Backoffice images remain. Persistent volumes were left untouched.
- Disk note: C: had about 20 MB free before the rebuild. The npm cache was cleared; after the image build C: is nearly full. Free space before another build or large dependency install.
