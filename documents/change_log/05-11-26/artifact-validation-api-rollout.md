# Artifact validation API rollout

- Follow-up inspection found the running API image still contained the old generic artifact validation response although the source included field-level diagnostics.
- The local Compose override bind-mounts `gateway/dist` over the image, so rebuilding the image alone kept serving stale JavaScript.
- Rebuilt the mounted `gateway/dist` with `npm --prefix gateway run build` and force-recreated only the API service.
- Verified the live container contains the detailed validation handler (the old generic message is absent) and `/health/ready` returns HTTP 200.
