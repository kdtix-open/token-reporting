# Token Reporting

> **License**: [MIT](./LICENSE) — public, community-contributed.
> **Origin**: Bootstrapped inside `kdtix-open` as a reference implementation that later
> moved to its own repository so community contributors can fork, extend, and host
> independently.
> **Role in the KDTIX ecosystem**: Token Reporting is the **canonical first external
> extension** for the private KDTIX Repo Orchestrator (`dev.projectit.ai/tools/repo-orchestrator`).
> It validates the **hybrid extension registry** pattern described in the Orchestrator's
> Platform Budgets & Extension Runtime plan: any extension that conforms to the
> `ProviderAdapter` + manifest contract can be installed into the Orchestrator via the
> "Add Extension" UX without modifying the Orchestrator's core BSL 1.1 codebase.
> A separate public-facing site (modeled on <https://skills.projectit.ai/>, which is
> the public home for the companion `kdtix-open/skill-plan-to-project` extension) will
> present this project to Early Access and Insider Access supporters on Patreon.

Token Reporting is also useful on its own: clone it, point it at the admin APIs you
already have, and you get a self-contained multi-provider token-consumption dashboard
without needing the private Orchestrator at all.

## Current scope

- TypeScript + React multi-provider dashboard with a typed provider registry
- Provider adapters for:
  - **GitHub Copilot** — `GET /orgs/{org}/copilot/metrics/reports/users-28-day/latest`
  - **Cursor** — `POST https://api.cursor.com/teams/daily-usage-data` (Basic Auth)
  - **Claude (Anthropic)** — `GET https://api.anthropic.com/v1/organizations/usage_report/messages` (Admin API key)
  - **OpenAI Codex** — `GET https://api.openai.com/v1/organization/usage/completions` (org admin key)
- Persist the latest report snapshot into `public/data/{provider}/latest-metadata.json`
- Dashboard card per registered provider, seeded with representative local fixtures

## Quick start

```bash
npm install
npm run dev
```

Seeded dashboard data lives under `public/data/`.

## Production and projectit.ai preview

The MVP publication lane is hybrid local Docker plus Cloudflare Tunnel. The app
is built and served under `/tools/token-reporting` so it can sit beside the
existing projectit.ai tools without changing browser-owned secrets or SDLCA
bridge credential boundaries.

```bash
# Local production wrapper at http://127.0.0.1:8080/tools/token-reporting
docker compose -f deploy/local-docker/docker-compose.yml up --build

# Caddy route shape used by Cloudflare Tunnel
docker compose -f deploy/hybrid-cloudflare/docker-compose.yml up --build

# Build only, with projectit.ai asset paths
npm run build:projectit

# macOS LaunchAgent on the port SDLCA Caddy already proxies
npm run startup:install:macos

# WSL/systemd-user service on the port SDLCA Caddy already proxies
npm run startup:install:wsl
```

The macOS and WSL startup installers pin the exact `node` binary resolved on the
local machine and run Token Reporting on `TOKEN_REPORTING_PORT=8095` by default,
which matches the current SDLCA Caddy upstream at `host.docker.internal:8095`.
They also remove the stale production PID file before each start. The macOS
LaunchAgent persists a launchd-safe `PATH` so provider refresh scripts can find
`npm` after reboot. The startup unit stores only non-secret runtime settings;
provider Admin/API credentials stay in `TOKEN_REPORTING_ADMIN_ENV_FILE`,
normally `.env.admin.credentials` on the operator host.

For bridge-backed local model forensics, repair the Token Reporting bridge
connection from the SDLCA local bridge env without printing the token:

```bash
npm run startup:repair-bridge-env
TOKEN_REPORTING_NODE_BIN=/opt/homebrew/bin/node npm run startup:install:macos
curl http://127.0.0.1:8095/tools/token-reporting/api/operational-status
```

The repair command only updates `.env.admin.credentials`; restart the macOS
LaunchAgent before probing because the production process reads that file at
startup.

For the KDTIX `mac-local` bridge, `dev.projectit.ai/tools/token-reporting` is an
operator view over KDTIX-owned provider Admin/API credentials and KDTIX paid
provider usage. For WSL Ubuntu UAT, run a separate local Token Reporting service
inside the WSL environment with sandbox/mock credentials. Do not point WSL UAT at
the KDTIX admin credential file. Customer-facing installs must add an OIDC-backed
tenant boundary before exposing hosted reports: customers authenticate with their
own KDTIX App identity, see only their tenant reports, and provider admin tokens
remain local to the customer's installation.

The post-hybrid Cloudflare-native scaffold is in `deploy/cloudflare`. It is
read-only until stateful provider refresh, artifact storage, scheduling, and
bridge ownership are explicitly moved to approved Cloudflare bindings.

See `docs/deployment/projectit-ai-cloudflare-runbook.md` and
`docs/uat/projectit-ai-cloudflare-publish-uat.md` for the deployment checklist
and UAT scenarios.

## Fetching live data

### GitHub Copilot

```bash
set -a
source .env.admin.credentials
set +a
npm run report:copilot
```

Requires `GITHUB_ADMIN_TOKEN` in `.env.admin.credentials` with `read:org`
scope (classic token) or fine-grained `Organization Copilot metrics` read
permission. `GITHUB_ORG` defaults to `kdtix-open`.
Endpoint: `GET https://api.github.com/orgs/{org}/copilot/metrics/reports/users-28-day/latest`
Recommended header: `X-GitHub-Api-Version: 2026-03-10`

### Cursor

```bash
set -a
source .env.admin.credentials
set +a
npm run report:cursor
```

Requires `CURSOR_ADMIN_API_KEY` in `.env.admin.credentials`. Create one in
your Cursor team settings.
Endpoint: `POST https://api.cursor.com/teams/daily-usage-data` (Basic Auth, 28-day window)

### Claude (Anthropic)

```bash
set -a
source .env.admin.credentials
set +a
npm run report:claude
```

Requires `ANTHROPIC_ADMIN_API_KEY` in `.env.admin.credentials`. It must be an
**Admin API key** (starts with `sk-ant-admin...`). Standard API keys will not
work.
Only organization admins can provision Admin API keys via the Claude Console → Settings → Admin Keys.
Endpoint: `GET https://api.anthropic.com/v1/organizations/usage_report/messages`

> **Note on `cost_report` units:** Anthropic's `/v1/organizations/cost_report` returns
> `amount` in **cents** (1/100 USD), even though the response advertises
> `currency: "USD"`. The Claude provider divides by 100 internally so reported
> spend reconciles to the figures shown on console.anthropic.com.

> **Out of scope:** Usage from the **Claude.ai consumer app** (Pro / Max / Team
> plans on claude.ai or the desktop/Chrome apps) is **not exposed** through the
> Admin API and therefore cannot be ingested here. Those plans have no admin
> credential — usage is only visible inside the app at Settings → Usage.
> Capturing that data would require an alternative mechanism (web-session
> scraping or a future first-party export) and is intentionally not implemented.

### OpenAI Codex

```bash
set -a
source .env.admin.credentials
set +a
npm run report:codex
```

Requires `OPENAI_ADMIN_API_KEY` in `.env.admin.credentials`, using an org
admin API key with the `api.usage.read` scope enabled.
Endpoint: `GET https://api.openai.com/v1/organization/usage/completions`

---

If `TOKEN_REPORTING_READ_ONLY=true`, snapshot persistence is blocked by design.

## Quality commands

```bash
npm test
npm run lint
npm run typecheck
npm run build
```
