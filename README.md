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

## Fetching live data

### GitHub Copilot

```bash
export GITHUB_TOKEN=your-token
export GITHUB_ORG=kdtix-open
npm run report:copilot
```

Requires `read:org` scope (classic token) or fine-grained `Organization Copilot metrics` read permission.
Endpoint: `GET https://api.github.com/orgs/{org}/copilot/metrics/reports/users-28-day/latest`
Recommended header: `X-GitHub-Api-Version: 2026-03-10`

### Cursor

```bash
export CURSOR_API_KEY=your-cursor-api-key
npm run report:cursor
```

Requires a Cursor team Admin API key. Create one in your Cursor team settings.
Endpoint: `POST https://api.cursor.com/teams/daily-usage-data` (Basic Auth, 28-day window)

### Claude (Anthropic)

```bash
export ANTHROPIC_API_KEY=sk-ant-admin-...
npm run report:claude
```

Requires an **Admin API key** (starts with `sk-ant-admin...`). Standard API keys will not work.
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
export OPENAI_API_KEY=your-openai-org-admin-key
npm run report:codex
```

Requires an org admin API key with the `api.usage.read` scope enabled.
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
