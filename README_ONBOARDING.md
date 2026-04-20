# Onboarding

## Preferred environment

Use the devcontainer in `.devcontainer/devcontainer.json` for a reproducible Node 20 setup.

## Local setup

1. Use Node 20 or later.
2. Run `npm install`.
3. Run `npm test` to confirm the local baseline.
4. Run `npm run dev` to start the dashboard.

## Environment variables

- `GITHUB_TOKEN`: required for live GitHub Copilot report fetches
- `GITHUB_ORG`: defaults to `kdtix-open`
- `CURSOR_API_KEY`: required for live Cursor usage fetches (team Admin API key)
- `ANTHROPIC_API_KEY`: required for live Claude usage fetches (Admin API key, `sk-ant-admin...`)
- `OPENAI_API_KEY`: required for live OpenAI Codex usage fetches (org admin key with `api.usage.read` scope)
- `TOKEN_REPORTING_READ_ONLY`: set to `true` or `1` to block file-writing operations
