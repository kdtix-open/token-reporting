# Projectit.ai Cloudflare Publication Runbook

## Current MVP Lane

The supported MVP lane is hybrid:

- Token Reporting runs as a local Docker container.
- Caddy preserves the `/tools/token-reporting` subpath.
- Cloudflare Tunnel publishes `dev.projectit.ai/tools/token-reporting`.
- Provider Admin/API tokens remain in `.env.admin.credentials` on the operator
  host or deployment secret store.
- SDLCA provider CLI forensic tokens remain SDLCA local-bridge owned.

## Commands

Local production wrapper:

```bash
docker compose -f deploy/local-docker/docker-compose.yml up --build
```

Hybrid Caddy preview:

```bash
docker compose -f deploy/hybrid-cloudflare/docker-compose.yml up --build
```

Hybrid tunnel:

```bash
CLOUDFLARE_TUNNEL_TOKEN=... \
  docker compose -f deploy/hybrid-cloudflare/docker-compose.yml --profile tunnel up
```

Cloudflare-native read-only scaffold:

```bash
TOKEN_REPORTING_BASE_PATH=/tools/token-reporting npm run build
npx wrangler dev --config deploy/cloudflare/wrangler.jsonc
```

## Configuration

| Variable | Purpose |
|---|---|
| `TOKEN_REPORTING_PUBLIC_BASE_PATH` | Runtime mount path; use `/tools/token-reporting` for projectit.ai. |
| `TOKEN_REPORTING_BASE_PATH` | Vite build asset base; use `/tools/token-reporting` for projectit.ai. |
| `TOKEN_REPORTING_DATA_ROOT` | Local accumulated provider snapshot root. |
| `TOKEN_REPORTING_DIST_ROOT` | Built Vite asset root. |
| `TOKEN_REPORTING_ADMIN_ENV_FILE` | Optional local env file for provider Admin/API credentials. |
| `TOKEN_REPORTING_SDLCA_BRIDGE_URL` | Optional SDLCA local bridge URL for forensic reviewer execution. |
| `TOKEN_REPORTING_SDLCA_BRIDGE_TOKEN` | Optional SDLCA bridge bearer token; never commit or log raw value. |
| `DEBUG` / `VERBOSE` | `0` to `3`; use `3` during UAT troubleshooting. |

## Publication Checklist

- `npm test -- --run`
- `npm run typecheck`
- `npm run lint`
- `npm run build:projectit`
- `docker compose -f deploy/local-docker/docker-compose.yml up --build`
- `docker compose -f deploy/hybrid-cloudflare/docker-compose.yml up --build`
- `curl http://127.0.0.1:8081/tools/token-reporting/api/integration/contract`
- Cloudflare Tunnel route returns HTTP 200 at
  `https://dev.projectit.ai/tools/token-reporting`
- UAT scenarios in `docs/uat/projectit-ai-cloudflare-publish-uat.md` pass

## Rollback

1. Stop the tunnel profile or remove the published application route.
2. Keep local accumulated data mounted at `public/data` intact.
3. Restart the last known-good Docker image or return Caddy to the previous
   route table.
