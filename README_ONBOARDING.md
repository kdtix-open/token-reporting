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

## Environment variables

- `GITHUB_TOKEN`: required for live GitHub Copilot report fetches
- `GITHUB_ORG`: defaults to `kdtix-open`
- `CURSOR_API_KEY`: required for live Cursor usage fetches (team Admin API key)
- `ANTHROPIC_API_KEY`: required for live Claude usage fetches (Admin API key, `sk-ant-admin...`)
- `OPENAI_API_KEY`: required for live OpenAI Codex usage fetches (org admin key with `api.usage.read` scope)
- `TOKEN_REPORTING_READ_ONLY`: set to `true` or `1` to block file-writing operations
- `TOKEN_REPORTING_PUBLIC_BASE_PATH`: runtime mount path, normally `/tools/token-reporting`
- `TOKEN_REPORTING_BASE_PATH`: Vite build base path, normally `/tools/token-reporting`
- `TOKEN_REPORTING_DATA_ROOT`: accumulated provider data root, defaults to `public/data`
- `TOKEN_REPORTING_DIST_ROOT`: Vite build output root, defaults to `dist`
- `TOKEN_REPORTING_ADMIN_ENV_FILE`: optional local env file, defaults to `.env.admin.credentials`
- `TOKEN_REPORTING_LOG_ROOT`: structured log directory, defaults to `logs`

## Deployment lanes

- Local Docker: `docker compose -f deploy/local-docker/docker-compose.yml up --build`
- Hybrid Cloudflare: `docker compose -f deploy/hybrid-cloudflare/docker-compose.yml up --build`
- Cloudflare Tunnel example: `deploy/cloudflare-tunnel/config.example.yml`
- Cloudflare-native read-only scaffold: `deploy/cloudflare`
