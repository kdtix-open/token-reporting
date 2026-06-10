# Cloudflare-Native Lane

This folder is the Cloudflare-native scaffold for the post-hybrid MVP lane.

The current production-ready lane is still hybrid local Docker plus Cloudflare
Tunnel because provider Admin/API refreshes and SDLCA bridge-backed forensics
depend on local credentials, local files, and provider CLI access. The native
lane starts as a read-only Workers Static Assets deployment so the suite can
publish the built dashboard independently while the dynamic refresh service
stays behind the hybrid API.

## Current Shape

- `wrangler.jsonc` serves `dist/` as Workers Static Assets.
- `worker/index.ts` exposes read-only health and contract endpoints.
- Mutating refresh is intentionally disabled here until refresh state, secrets,
  queueing, and bridge ownership are re-architected for Cloudflare-native use.

## Follow-On Cloudflare-Native Decisions

- Use D1 for normalized provider snapshots and refresh job records when SQL
  history queries become required at the edge.
- Use R2 for downloadable report artifacts and forensic reviewer artifacts.
- Use Queues or Workflows for bounded multi-step refresh orchestration.
- Use Cron Triggers for scheduled refresh once provider Admin/API credentials
  are safely stored and scoped in Cloudflare.
- Keep SDLCA provider CLI forensic tokens local-bridge-side unless a separate
  bridge publication architecture is approved.

## Local Preview

```bash
TOKEN_REPORTING_BASE_PATH=/tools/token-reporting npm run build
npx wrangler dev --config deploy/cloudflare/wrangler.jsonc
```

## Deploy

```bash
TOKEN_REPORTING_BASE_PATH=/tools/token-reporting npm run build
npx wrangler deploy --config deploy/cloudflare/wrangler.jsonc
```
