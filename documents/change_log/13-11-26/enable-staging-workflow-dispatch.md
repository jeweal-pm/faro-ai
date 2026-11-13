# Enable staging workflow dispatch

- Added the FaroAI CI/CD workflow definition to the repository's default branch (`master`) so GitHub exposes the manual `workflow_dispatch` control.
- The workflow remains configured to deploy only when the staging input is explicitly enabled and the selected ref is `dev`; no application code from `dev` was merged into `master`.
- This default-branch copy exists to expose GitHub's manual dispatch UI. Select `dev` in “Use workflow from” to run the deployment code and images from `dev`.
- No secrets or `.env` values were added. The staging runtime secret ARN remains configured as a GitHub Environment variable.
