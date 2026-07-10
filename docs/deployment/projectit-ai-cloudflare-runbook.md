# Projectit.ai Cloudflare Publication Runbook

## Current MVP Lane

The supported MVP lane is hybrid:

- On the KDTIX operator Mac, Token Reporting runs as a macOS LaunchAgent owned by
  the `mac-local` bridge host.
- SDLCA Docker Caddy preserves the `/tools/token-reporting` subpath and proxies
  to `host.docker.internal:8095`.
- Cloudflare Tunnel publishes `dev.projectit.ai/tools/token-reporting`.
- Provider Admin/API tokens remain in `.env.admin.credentials` on the operator
  host or deployment secret store.
- SDLCA provider CLI forensic tokens remain SDLCA local-bridge owned.

## Commands

Local production wrapper:

```bash
docker compose -f deploy/local-docker/docker-compose.yml up --build
```

mac-local LaunchAgent used by `dev.projectit.ai/tools/token-reporting`:

```bash
TOKEN_REPORTING_BASE_PATH=/tools/token-reporting npm run build
npm run startup:repair-bridge-env
TOKEN_REPORTING_NODE_BIN=/opt/homebrew/bin/node npm run startup:install:macos
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
| `TOKEN_REPORTING_REFRESH_ASYNC` | Use `true` for Cloudflare-published routes so long forensic refreshes run as background jobs. |
| `TOKEN_REPORTING_NODE_BIN` | Absolute Node executable pinned into launchd/systemd startup units. |
| `TOKEN_REPORTING_PORT` | Local production port. Use `8095` for the SDLCA Caddy route. |
| `TOKEN_REPORTING_HOST` | Bind address. Use `0.0.0.0` when Docker Desktop Caddy reaches the host through `host.docker.internal`. |
| `TOKEN_REPORTING_SDLCA_BRIDGE_URL` | Optional SDLCA local bridge URL for forensic reviewer execution. |
| `TOKEN_REPORTING_SDLCA_BRIDGE_TOKEN` | Optional SDLCA bridge bearer token; never commit or log raw value. |
| `TOKEN_REPORTING_SDLCA_BRIDGE_WORKING_DIRECTORY` | Working directory sent to the local bridge for forensic reviewer execution. |
| `TOKEN_REPORTING_SDLCA_BRIDGE_TIMEOUT_MS` | Bridge forensic execution timeout, default `120000`. |
| `DEBUG` / `VERBOSE` | `0` to `3`; use `3` during UAT troubleshooting. |

## Tenant and Secret Boundaries

- `mac-local` / KDTIX operations: the hosted `dev.projectit.ai` Token Reporting
  route is an operator-only view over KDTIX provider usage and KDTIX-owned
  Admin/API credentials. These credentials stay on the operator host and are
  loaded from `TOKEN_REPORTING_ADMIN_ENV_FILE`; they are not copied into the
  SDLCA Docker container or the bridge config.
- WSL Ubuntu 26.04 UAT: run a separate Token Reporting service inside WSL with
  sandbox or mock-client credentials. This validates local startup and bridge
  integration without reading KDTIX paid-provider reports.
- Customer deployments: before customers see hosted Token Reporting, add an
  OIDC tenant boundary through the customer KDTIX App identity. The server must
  filter reports by tenant, and customer provider admin tokens must remain local
  to the customer installation. KDTIX should not receive, store, or proxy those
  customer admin tokens.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `https://dev.projectit.ai/tools/token-reporting` returns `502` | Caddy is up but nothing is listening on host port `8095` | Run `lsof -nP -iTCP:8095 -sTCP:LISTEN`, then `TOKEN_REPORTING_NODE_BIN=/opt/homebrew/bin/node npm run startup:install:macos`. |
| LaunchAgent is loaded but exits quickly | Node path moved or dependencies/dist are missing | Re-run `npm install`, `TOKEN_REPORTING_BASE_PATH=/tools/token-reporting npm run build`, then reinstall the LaunchAgent with a current absolute `TOKEN_REPORTING_NODE_BIN`. |
| Refresh shows all provider scripts failed with `npm_not_found_or_path_missing` | launchd started the service without a useful `PATH` | Re-run `TOKEN_REPORTING_NODE_BIN=/opt/homebrew/bin/node npm run startup:install:macos`; the installer persists `/opt/homebrew/bin`, `/usr/local/bin`, and system paths into the LaunchAgent. |
| Forensic reviewers are not dispatched and operational status says `not_configured` | Token Reporting is up but the SDLCA bridge URL/token are absent from `TOKEN_REPORTING_ADMIN_ENV_FILE` | Run `npm run startup:repair-bridge-env`, restart the LaunchAgent, and confirm `/api/operational-status` reports `configured`. |
| UI loads but refresh is blocked | Read-only mode or missing Admin/API credential file | Confirm `TOKEN_REPORTING_READ_ONLY=false` for the operator host and that `TOKEN_REPORTING_ADMIN_ENV_FILE` points to the local credential file. Do not print credential values. |
| WSL UAT shows KDTIX data | WSL service is using the KDTIX credential file or data root | Stop the WSL service, point it at sandbox/mock credentials and an isolated `TOKEN_REPORTING_DATA_ROOT`, then restart with `npm run startup:install:wsl`. |

## Publication Checklist

- `npm test -- --run`
- `npm run typecheck`
- `npm run lint`
- `npm run build:projectit`
- `npm run startup:repair-bridge-env`
- `TOKEN_REPORTING_NODE_BIN=/opt/homebrew/bin/node npm run startup:install:macos`
- `curl http://127.0.0.1:8095/tools/token-reporting/api/integration/contract`
- `curl http://127.0.0.1:8095/tools/token-reporting/api/operational-status`
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
