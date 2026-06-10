# Projectit.ai Cloudflare Publish UAT

## Scenario 1: Local Docker Subpath Smoke

Goal: Verify Token Reporting runs as a standalone production container at the
same subpath used by projectit.ai.

Prerequisites:

- Docker is running.
- `public/data/**` contains at least one provider snapshot.
- Optional live refresh credentials are present in `.env.admin.credentials`.

Steps:

1. Run `docker compose -f deploy/local-docker/docker-compose.yml up --build`.
2. Open `http://127.0.0.1:8080/tools/token-reporting`.
3. Confirm the dashboard loads provider cards and report freshness metadata.
4. Click Refresh Report.
5. Download JSON and database exports.

Expected result:

- The dashboard loads from `/tools/token-reporting`.
- `/tools/token-reporting/data/**` requests return local snapshots.
- `/tools/token-reporting/api/refresh` returns completed, degraded, or blocked
  status without exposing provider credentials.
- Exports contain the same provider snapshot state shown in the dashboard.

## Scenario 2: Hybrid Caddy Route Smoke

Goal: Verify the route shape that Cloudflare Tunnel will publish.

Prerequisites:

- Docker is running.
- Port `8081` is available.

Steps:

1. Run `docker compose -f deploy/hybrid-cloudflare/docker-compose.yml up --build`.
2. Open `http://127.0.0.1:8081/tools/token-reporting`.
3. Run `curl -I http://127.0.0.1:8081/tools/token-reporting`.
4. Run `curl http://127.0.0.1:8081/tools/token-reporting/api/integration/contract`.

Expected result:

- Caddy preserves the `/tools/token-reporting` prefix.
- Static assets, data files, and API calls all resolve under the prefix.
- Unknown root paths return the Caddy 404 message instead of the dashboard.

## Scenario 3: Cloudflare Tunnel Preview Smoke

Goal: Verify `dev.projectit.ai/tools/token-reporting` reaches the local hybrid
origin.

Prerequisites:

- A Cloudflare Tunnel exists for `dev.projectit.ai`.
- The tunnel route maps `/tools/token-reporting.*` to the local Caddy service.
- `CLOUDFLARE_TUNNEL_TOKEN` is available only in the local shell or deployment
  secret store.

Steps:

1. Run the hybrid compose stack.
2. Run `docker compose -f deploy/hybrid-cloudflare/docker-compose.yml --profile tunnel up cloudflared`.
3. Open `https://dev.projectit.ai/tools/token-reporting`.
4. Click Refresh Report.
5. Confirm logs under `logs/` redact secrets.

Expected result:

- The public route returns HTTP 200 and renders the dashboard.
- Refresh calls same-origin `/tools/token-reporting/api/refresh`.
- Provider-specific failures degrade the job without crashing the site.
- No Admin/API provider token or SDLCA bridge token appears in UI, downloaded
  artifacts, or logs.

## Scenario 4: Cloudflare-Native Read-Only Preview

Goal: Verify the post-hybrid native scaffold can serve the built static app
without enabling mutating refresh.

Prerequisites:

- Wrangler is authenticated.
- The app is built with `TOKEN_REPORTING_BASE_PATH=/tools/token-reporting`.

Steps:

1. Run `TOKEN_REPORTING_BASE_PATH=/tools/token-reporting npm run build`.
2. Run `npx wrangler dev --config deploy/cloudflare/wrangler.jsonc`.
3. Open the local Wrangler URL at `/tools/token-reporting`.
4. Request `/tools/token-reporting/api/integration/contract`.
5. Request `/tools/token-reporting/api/refresh`.

Expected result:

- Static assets serve through Workers Static Assets.
- Contract endpoint reports `cloudflare-native-read-only`.
- Mutating refresh returns HTTP 503 with a clear read-only/native-lane message.
