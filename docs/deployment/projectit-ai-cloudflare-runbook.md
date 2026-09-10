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

## Token Reporting-only durable deployment

Ordinary Token Reporting publication or rollback changes only its service.
Do not recycle APQ, Caddy, or Cloudflare Tunnel. A shared-route incident requires
separate explicit authority from its owner. The commands below are procedures,
not authority to change a running installation.

Before activation, verify the approved release SHA and retain a private,
recoverable backup of the canonical served data, the previous deployment's
snapshot directory, and the installed LaunchAgent plist. Record checksums and
the prior release identity. Preserve credential-file references and permissions;
never publish credential contents or private backup paths. If the two snapshot
directories diverge, reconcile them by provider identity, schema, period, and
deduplication keys after backup. Do not blindly overwrite richer history with a
newer file, and do not infer completeness solely from `generatedAt`.

Use a reviewed durable release checkout under the configured local deployment
store (`deploy-<approved-sha>`), never a disposable `/tmp` worktree or the dirty
canonical working tree. Keep data, logs, and admin-environment references on the
canonical installation. Substitute the quoted placeholders with validated
absolute paths; the Node executable must be independently verified.

```bash
cd "<durable-deploy-checkout>"
export PATH="<verified-node-lts-bin>:$PATH"
node --version
npm --version
(
  unset TOKEN_REPORTING_DATA_ROOT TOKEN_REPORTING_LOG_ROOT
  unset TOKEN_REPORTING_ADMIN_ENV_FILE TOKEN_REPORTING_HF_CANDIDATES_PATH
  unset TOKEN_REPORTING_REFRESH_JOB_STORE_PATH TOKEN_REPORTING_FORENSIC_RUN_STORE_PATH
  npm ci
  npm test
  npm run typecheck
  npm run lint
  npm run build:projectit
  npm run verify:projectit-build
)
# Only after the fresh deployment authorization and backup gates pass:
export TOKEN_REPORTING_DATA_ROOT="<canonical-checkout>/public/data"
export TOKEN_REPORTING_LOG_ROOT="<canonical-checkout>/logs"
export TOKEN_REPORTING_ADMIN_ENV_FILE="<canonical-checkout>/.env.admin.credentials"
export TOKEN_REPORTING_NODE_BIN="<verified-node-lts-bin>/node"
npm run startup:install:macos
```

Run preflight in a clean environment without production credentials. The scoped
unsets keep tests from inheriting live-data destinations; the canonical runtime
paths are introduced only for installation. Selecting `TOKEN_REPORTING_NODE_BIN`
alone does not select the Node/npm used during preflight: choose and verify the
LTS runtime in `PATH` as well. Do not suppress loader or build warnings.

The installer derives its code directory from its own script, so invoke it from
the approved durable checkout. `TOKEN_REPORTING_DATA_ROOT` must be used by both
provider persistence/history readers and the server. Do not fix a split by
running a released service's collectors from an unreviewed canonical checkout.
See [the #38 root-split RCA](../plans/issue-38-data-root-rca.md).

Bridge-environment repair is **not** a deployment prerequisite. Run it only
under a separate bridge-configuration assignment after verifying the existing
bridge configuration is actually missing or incorrect.

After activation, verify mounted API/data/refresh URLs and compare sanitized
snapshot identity (`generatedAt`, source origin, schema/version where present,
and source window) between collection output, canonical served files, local
`/tools/token-reporting/data/` routes, and public routes. Use a separately
authorized collection if new collection is needed for this check. A process
start, HTTP 200, or the client re-render timestamp is insufficient evidence of
fresh usage. Local/public metadata must agree with the intended collection
output; report incomplete provider windows honestly.

## Alternative deployment commands

These Docker/tunnel lanes are alternatives, not steps in a routine LaunchAgent
republication. Shared infrastructure changes require their own named authority.

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
  docker compose -f deploy/hybrid-cloudflare/docker-compose.yml \
  --profile tunnel up
```

Cloudflare-native read-only scaffold:

```bash
npm run build:projectit
npm run verify:projectit-build
npx wrangler dev --config deploy/cloudflare/wrangler.jsonc
```

## Configuration

- `TOKEN_REPORTING_PUBLIC_BASE_PATH`: runtime mount path;
  use `/tools/token-reporting` for projectit.ai.
- `TOKEN_REPORTING_BASE_PATH`: Vite asset base; use the same mount path.
- `TOKEN_REPORTING_DATA_ROOT`: canonical provider snapshot root, shared by
  collection, incremental history, and HTTP reads. Empty values are invalid.
- `TOKEN_REPORTING_LOG_ROOT`: canonical logs retained across release checkouts.
- `TOKEN_REPORTING_DIST_ROOT`: built Vite asset root in the release checkout.
- `TOKEN_REPORTING_ADMIN_ENV_FILE`: local provider Admin/API credential file.
- `TOKEN_REPORTING_REFRESH_ASYNC`: use `true` for published routes so long
  forensic refreshes run as background jobs.
- `TOKEN_REPORTING_NODE_BIN`: absolute Node executable pinned in startup units.
- `TOKEN_REPORTING_PORT`: use `8095` for the existing SDLCA Caddy route.
- `TOKEN_REPORTING_HOST`: use `0.0.0.0` when Docker Desktop Caddy reaches the
  host through `host.docker.internal`; assess the installation's access boundary.
- `TOKEN_REPORTING_SDLCA_BRIDGE_URL`: optional forensic-reviewer bridge URL.
- `TOKEN_REPORTING_SDLCA_BRIDGE_TOKEN`: optional bearer token; never log it.
- `TOKEN_REPORTING_SDLCA_BRIDGE_WORKING_DIRECTORY`: forensic working directory.
- `TOKEN_REPORTING_SDLCA_BRIDGE_TIMEOUT_MS`: timeout, default `120000`.
- `DEBUG` / `VERBOSE`: `0` to `3`; use only approved, redacted diagnostic output.

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

- **Public mounted route returns 502:** inspect whether Token Reporting is
  listening with `lsof -nP -iTCP:8095 -sTCP:LISTEN`. Verify route and upstream
  evidence before following the authorized durable-deployment procedure.
- **LaunchAgent exits quickly:** verify the Node executable and mounted build.
  Rebuild only the approved release; reinstall after the stated gates pass.
- **Browser requests root `/api` or `/data`:** a bare build may have overwritten
  the mounted bundle. Use the projectit build and verifier before activation.
- **`npm_not_found_or_path_missing`:** verify the startup unit's `PATH` and
  absolute Node executable. The installer persists the runtime's bin directory
  and standard system paths; do not assume an interactive shell matches launchd.
- **Forensics says `not_configured`:** coordinate separately with the bridge
  owner. Repair configuration or restart only after explicit authorization.
  A configured status alone does not prove successful reviewer execution.
- **Scripts complete but served timestamps stay old:** compare collection and
  served identities. Follow backed-up #38 reconciliation; do not change collector
  cwd to dirty canonical code.
- **Refresh is blocked:** inspect read-only mode and the credential-file
  reference without printing its contents. Do not clear a permission gate merely
  to make the error disappear.
- **WSL UAT shows production data:** treat this as a tenant-boundary incident.
  Obtain authority to isolate the WSL service and use sandbox credentials/data;
  do not affect the production installation or publish the exposed data.

## Publication Checklist

- `npm test -- --run`
- `npm run typecheck`
- `npm run lint`
- `npm run build:projectit`
- `npm run verify:projectit-build`
- Private backups of served data, prior deployment snapshots, and LaunchAgent
  plist verified
- Approved durable code checkout with canonical data/log/admin references verified
- Explicit deployment authorization checked before `npm run startup:install:macos`
- `curl http://127.0.0.1:8095/tools/token-reporting/api/integration/contract`
- `curl http://127.0.0.1:8095/tools/token-reporting/api/operational-status`
- Cloudflare Tunnel route returns HTTP 200 at
  `https://dev.projectit.ai/tools/token-reporting`
- Intended collection, served files, local mounted routes, and public mounted
  routes have matching snapshot identities and honestly reported usage windows
- No APQ/Caddy/tunnel recycle or automatic bridge-configuration repair performed
- UAT scenarios in `docs/uat/projectit-ai-cloudflare-publish-uat.md` pass

## Rollback

1. Preserve the failed release's evidence and current data before rollback.
2. Under fresh authorization, reinstall only Token Reporting from the prior
   verified durable release, retaining canonical data/log/admin paths.
3. Do not restore an older data archive merely to roll back code. A data restore
   is a separate backed-up reconciliation with explicit scope and validation.
4. Verify mounted routes and snapshot identities against the retained data.

Stopping the tunnel, removing the published route, or changing the Caddy route
table is reserved for an explicitly authorized **shared-route incident**, not
ordinary Token Reporting rollback. An alternative Docker installation may roll
back its Token Reporting image only within that installation's approved scope.
