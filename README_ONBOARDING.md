# Onboarding

## Preferred environment

Use the devcontainer in `.devcontainer/devcontainer.json` for a reproducible Node 20 setup.

## Local setup

1. Use Node 20 or later.
2. Run `npm install`.
3. Run `npm test` to confirm the local baseline.
4. Run `npm run dev` to start the dashboard.
5. For projectit.ai subpath testing, run `npm run build:projectit` and
   `npm run serve:production`, then open
   `http://127.0.0.1:8080/tools/token-reporting`.
6. For the mac-local projectit.ai operator host, run
   `TOKEN_REPORTING_NODE_BIN=/opt/homebrew/bin/node npm run startup:install:macos`.
   The LaunchAgent listens on `8095`, which is the upstream used by the SDLCA
   Docker Caddy route. The installer writes a launchd-safe `PATH` so refresh
   scripts can find `npm` after a reboot.
7. If bridge-backed forensics should be enabled on the operator host, run
   `npm run startup:repair-bridge-env`. It copies the SDLCA local bridge token
   into `.env.admin.credentials`, writes a backup, chmods the file to `600`, and
   prints only a redacted summary. Then rerun
   `TOKEN_REPORTING_NODE_BIN=/opt/homebrew/bin/node npm run startup:install:macos`
   so the LaunchAgent restarts and reloads the updated admin env file before
   checking `/tools/token-reporting/api/operational-status`.

## Environment variables

- `.env.admin.credentials`: local-only admin credential file sourced before live provider refreshes
- `GITHUB_ADMIN_TOKEN`: required for live GitHub Copilot report fetches
- `GITHUB_ORG`: defaults to `kdtix-open`
- `CURSOR_ADMIN_API_KEY`: required for live Cursor usage fetches (team Admin API key)
- `TOKEN_REPORTING_CURSOR_REDACTION_SALT`: optional dedicated salt for public Cursor identity aliases; falls back to `CURSOR_ADMIN_API_KEY` when omitted
- `ANTHROPIC_ADMIN_API_KEY`: required for live Claude usage fetches (Admin API key, `sk-ant-admin...`)
- `OPENAI_ADMIN_API_KEY`: required for live OpenAI Codex usage fetches (org admin key with `api.usage.read` scope)
- `TOKEN_REPORTING_READ_ONLY`: set to `true` or `1` to block file-writing operations
- `TOKEN_REPORTING_PUBLIC_BASE_PATH`: runtime mount path, normally `/tools/token-reporting`
- `TOKEN_REPORTING_BASE_PATH`: Vite build base path, normally `/tools/token-reporting`
- `TOKEN_REPORTING_DATA_ROOT`: accumulated provider data root, defaults to `public/data`
- `TOKEN_REPORTING_DIST_ROOT`: Vite build output root, defaults to `dist`
- `TOKEN_REPORTING_ADMIN_ENV_FILE`: optional local env file, defaults to `.env.admin.credentials`
- `TOKEN_REPORTING_LOG_ROOT`: structured log directory, defaults to `logs`
- `TOKEN_REPORTING_REFRESH_ASYNC`: set to `true` for published routes so refresh POSTs return a job immediately and the UI polls status.
- `TOKEN_REPORTING_NODE_BIN`: absolute Node executable pinned into macOS launchd or WSL systemd-user startup units.
- `TOKEN_REPORTING_PORT`: local production port, `8095` for the SDLCA Caddy route.
- `TOKEN_REPORTING_HOST`: bind address, normally `0.0.0.0` so Docker Desktop can reach the host service through `host.docker.internal`.
- `TOKEN_REPORTING_SDLCA_BRIDGE_URL`: SDLCA local bridge URL for forensic reviewer execution.
- `TOKEN_REPORTING_SDLCA_BRIDGE_TOKEN`: SDLCA bridge bearer token; store only in the admin env file or secret store and never print.
- `TOKEN_REPORTING_SDLCA_BRIDGE_WORKING_DIRECTORY`: working directory sent to the local bridge for forensic reviewer execution.
- `TOKEN_REPORTING_SDLCA_BRIDGE_TIMEOUT_MS`: bridge forensic execution timeout, default `120000`.

## Startup and tenancy notes

- mac-local / KDTIX operations: use `npm run startup:install:macos` and keep
  KDTIX provider Admin/API credentials only in `.env.admin.credentials` on the
  KDTIX operator host.
- WSL Ubuntu UAT: use `npm run startup:install:wsl` inside WSL with sandbox or
  mock-client credentials. Do not reuse the KDTIX admin credential file.
- Customer installs: do not expose shared hosted reports until OIDC tenant
  scoping exists. The intended shape is customer-owned local Admin/API tokens,
  a customer KDTIX App OIDC identity, and server-side report filtering so each
  tenant can only see its own snapshots.

Useful probes:

```bash
launchctl print gui/$(id -u)/com.kdtix.token-reporting
curl http://127.0.0.1:8095/tools/token-reporting/api/integration/contract
curl http://127.0.0.1:8095/tools/token-reporting/api/operational-status
curl https://dev.projectit.ai/tools/token-reporting
```

## Deployment lanes

- Local Docker: `docker compose -f deploy/local-docker/docker-compose.yml up --build`
- Hybrid Cloudflare: `docker compose -f deploy/hybrid-cloudflare/docker-compose.yml up --build`
- Cloudflare Tunnel example: `deploy/cloudflare-tunnel/config.example.yml`
- Cloudflare-native read-only scaffold: `deploy/cloudflare`
