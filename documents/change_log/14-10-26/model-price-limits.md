# Model pricing and Jev routing

Date: 14-10-26

- Added ADR-0013 and its SPEC for manually verified USD token rates, estimated tenant request ceilings, and conservative input-token bounds.
- Added ADR-0014 to record per-image pricing and the default-on policy to skip free and unknown-price models.
- Added migrations 005 and 006 for token/image model rates, tenant price ceilings, image count limits, and free-model exclusion.
- Added provider Backoffice controls for input/output token rates and optional USD/image rates. `$0.035/image` is shown as an example only; no provider price is assumed.
- Added tenant Jev routing controls for max estimated request spend, input-token budget, image-count budget, and “Skip free models”. The estimate includes the configured image rate and maximum image count.
- The gateway filters missing, stale, free, and over-ceiling candidates before Jev. The AI service rechecks price freshness, free-model exclusion, token budget, and estimated spend before provider invocation.
- Request credits remain request-based and separate from USD. Provider invoice reconciliation and Jev's own routing-model cost are outside the response-model ceiling.
- Cache review: `pnpm store prune` found no unused packages (the 2.32 GB store backs active workspace dependencies); no host pip/uv cache or project `__pycache__` was found. `npm cache clean` exited successfully, but the separate npm `_npx` package cache still contains about 338 MB. The AI image has no pip cache; its 241 MB FastEmbed model is runtime data required by the service.
- Validation: gateway and Backoffice TypeScript typechecks pass; AI-service Python source parses; migration 006 applied successfully. API and AI-service containers now use the already-built images; Backoffice alone was rebuilt and redeployed. All three containers are running and API/AI service health checks pass. C: has about 1.53 GB free after deployment. Live provider pricing/image-request validation remains pending.
