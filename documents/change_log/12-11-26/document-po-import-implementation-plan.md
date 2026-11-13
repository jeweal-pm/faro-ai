# Change log — 12-11-26

- Added `documents/product/discovery/2026-11-12-document-po-import-implementation-plan.html` with a phased, safety-focused implementation plan for document-to-PO, current foundation and remaining work, acceptance criteria, and EC2 sizing guidance.
- Recommended `m7i.xlarge` (4 vCPU, 16 GiB) as a pilot starting point, with `m7i.2xlarge` as a measured scale-up option. The plan directs operators to AWS Pricing Calculator for current region and storage-inclusive cost.
- Added a staged EC2 deployment section covering private networking, IAM/SSM access, encrypted EBS, managed secrets, migration and least-privilege worker setup, staging readiness, limited pilot, monitoring, and data-preserving rollback.
- Added Singapore (`ap-southeast-1`) Linux On-Demand estimate snapshots: `m7i.xlarge` $0.252/hour (~$183.96 per 730-hour month), `m7i.2xlarge` $0.504/hour (~$367.92/month), and `m7i-flex.xlarge` $0.2394/hour (~$174.76/month). Document labels them estimates, excludes EBS/network/monitoring/tax and links to the AWS Pricing Calculator for confirmation.
- No application code, Docker configuration, database, AWS account, or running infrastructure was changed.
