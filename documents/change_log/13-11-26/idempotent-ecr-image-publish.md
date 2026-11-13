# Reuse immutable ECR images during deployment retries

- Updated the staging workflow to check each commit-SHA image tag in its ECR repository before building and pushing.
- If that immutable tag already exists, the workflow reuses it and continues with the release upload/deployment. Missing images are still built and pushed.
- The GitHub deployment role must have `ecr:BatchGetImage` on the five FaroAI repositories; this is also part of the ECR image-push permission set.
- This prevents a failed later deployment step from making the next run fail when it reaches an image already published by the earlier run.
