# Project Scope: PS-001 Publish Token Reporting to projectit.ai on Cloudflare
Priority: P0
Size: XL

#### Vision

Token Reporting is available as a standalone projectit.ai tool and as the
canonical suite extension for token usage, budget health, forecasts, exports,
local infrastructure sizing, and SDLCA forensic recommendations.

#### Business Problem

Token Reporting has dynamic provider refresh and SDLCA bridge integration, but
it did not yet have a deployable projectit.ai lane. Users need a reproducible
local Docker deployment, a Cloudflare Tunnel preview at
`dev.projectit.ai/tools/token-reporting`, a tracked Project 16 backlog, and a
clear path to a future Cloudflare-native deployment without mixing provider
Admin/API credentials with SDLCA provider CLI credentials.

#### Success Criteria

- Project 16 contains a seeded, type-correct backlog for the publish effort.
- The app builds and serves under `/tools/token-reporting`.
- Static assets, data files, and API calls resolve under the subpath.
- Docker, Caddy, and Cloudflare Tunnel templates are committed.
- UAT scenarios cover local Docker, hybrid Caddy, Cloudflare Tunnel, and native
  read-only preview.
- Cloudflare-native dynamic refresh is explicitly scoped as a future lane until
  storage, scheduling, secrets, and bridge boundaries are approved.

#### In-Scope Capabilities

- Project 16 backlog seeding using `plan-to-project`.
- Hybrid local Docker to Cloudflare Tunnel publication.
- Same-origin production API under `/tools/token-reporting/api`.
- Runtime base path support for report data and refresh calls.
- Deployment runbook and UAT scenarios.
- Cloudflare-native read-only scaffold.

#### Assumptions

- Project 16 belongs to `kdtix-open/token-reporting`.
- Provider Admin/API tokens remain Token Reporting server-side.
- Provider CLI forensic tokens remain SDLCA local-bridge-side.
- `dev.projectit.ai` is already managed by Cloudflare.
- The first public lane uses Cloudflare Tunnel before Workers-native dynamic
  refresh.

#### Out of Scope

- Moving provider Admin/API secrets into browser code.
- Moving SDLCA provider CLI tokens into Token Reporting.
- Implementing full Workers-native dynamic refresh before the hybrid lane passes
  UAT.
- Replacing the SDLCA local bridge.

#### MoSCoW

**Must Have**:
- Seed Project 16 from this plan.
- Serve the app and API under `/tools/token-reporting`.
- Provide local Docker and hybrid Cloudflare Tunnel assets.
- Add UAT and runbook documentation.

**Should Have**:
- Add Cloudflare-native read-only scaffold.
- Add CI verification for tests, lint, typecheck, and build.
- Preserve debug and verbose observability controls.

**Could Have**:
- Add automated Docker image publishing.
- Add scheduled Cloudflare-native refresh design spikes.

**Won't Have**:
- Full Cloudflare-native mutating refresh in this release.

#### I Know I Am Done When

- All P0 stories in this plan are implemented, tested, and linked in Project 16.
- `npm test -- --run`, `npm run typecheck`, `npm run lint`, and
  `npm run build:projectit` pass.
- Local production server smoke verifies `/tools/token-reporting`.
- Docker and Caddy configuration can be run from the repo.
- The Cloudflare Tunnel route can be validated once the operator provides or
  confirms the tunnel token/route.

## Initiative: INIT-001 Project 16 Backlog and Governance
Priority: P0
Size: M

#### Objective

Turn the draft publication plan into a durable GitHub Project 16 backlog that
can be self-maintained by future agent sessions.

#### Release Value

Operators and agent sessions can see the remaining publish work, ownership
boundaries, readiness state, and deferred Cloudflare-native work without relying
on chat context.

#### Success Criteria

- `plan-to-project` preflight passes for Project 16.
- Plan parsing succeeds from a committed markdown plan.
- Created issues use the expected Project Scope, Initiative, Epic, Story, and
  Task issue types.
- Project fields are populated.

#### Feature Scope

- Structured plan file.
- Project 16 issue creation.
- Compliance report and queue-order artifacts.

#### Assumptions

- GitHub CLI is authenticated with `repo`, `project`, and `read:org` scopes.
- Project 16 contains required fields and issue types.

#### Dependencies

| Ticket | Description | Status |
|--------|-------------|--------|
| #1244 | Cross-project SDLCA integration journal remains the coordination journal for bridge/API contract updates. | Open |

#### I Know I Am Done When

- Project 16 has the publish backlog.
- Any plan-to-project artifacts are reviewed and only useful committed artifacts
  remain in the repo.

### Epic: EP-001 Project 16 Backlog Seed
Priority: P0
Size: M

#### Objective

Create an idempotent project backlog from the publish plan.

#### Release Value

The work becomes visible and trackable outside the chat thread.

#### Success Criteria

- Preflight, parse, create, relationship, project-field, compliance, and queue
  phases complete or produce actionable findings.

#### Feature Scope

- Plan file authoring.
- GitHub issue creation.
- Project V2 field updates.

#### Assumptions

- Project 16 is the target project for `kdtix-open/token-reporting`.

#### Dependencies

| Ticket | Description | Status |
|--------|-------------|--------|
| (none) | No project-level dependency blocks initial seeding. | - |

#### I Know I Am Done When

- Project 16 contains the seeded backlog.

#### Code Areas

- `docs/plans/projectit-ai-cloudflare-publish-project-plan.md`
- `manifest.json`
- `manifest-config.json`
- `compliance-report.json`
- `queue-order.json`

#### Questions for Tech Lead

- Should future amendments target this Project Scope or a broader suite-level
  publishing Project Scope?

#### Security/Compliance

- No secrets are included in issue bodies or generated artifacts.

#### Story: Seed Project 16 with the publish plan
Priority: P0
Size: S

##### User Story

As the operator, I want Project 16 populated from the publish plan so every
remaining publication task is visible and independently trackable.

##### TL;DR

Run the `plan-to-project` workflow against this plan and Project 16.

##### Why This Matters

Chat context is not a reliable project management system; Project 16 should be
the durable coordination surface.

##### MoSCoW

**Must Have**:
- Preflight passes.
- Issues are created in `kdtix-open/token-reporting`.
- Project fields and issue types are set.

**Should Have**:
- Compliance report is clean or clearly documented.

**Could Have**:
- Queue order is posted as a project note.

**Won't Have**:
- Manual issue creation outside `plan-to-project`.

##### Acceptance Criteria

- `python3 .../create_issues.py preflight --org kdtix-open --repo kdtix-open/token-reporting --project 16` passes.
- `python3 .../create_issues.py parse --plan docs/plans/projectit-ai-cloudflare-publish-project-plan.md` passes.
- Project 16 contains the created scope, initiative, epic, story, and task items.

##### Constraints

- Do not duplicate existing Project 16 issues on rerun.

##### Implementation Notes

- Use the committed plan file as the source of truth.

##### Security/Compliance

- Do not place Admin/API provider tokens, SDLCA bridge tokens, or tunnel tokens
  in issue bodies.

##### Subtasks Needed

- Run preflight.
- Parse plan.
- Create issues.
- Set relationships.
- Set project fields and issue types.
- Run compliance check.
- Generate queue order.

##### Task: Run plan-to-project workflow
Priority: P0
Size: XS

###### Summary

Execute the plan-to-project phases for Project 16.

###### Context

Project 16 is empty and should become the durable publish backlog.

###### I Know I Am Done When

- Plan-to-project phases complete and artifacts are reviewed.

###### Implementation Notes

- Keep generated local artifacts out of the final commit unless they are useful
  handoff artifacts.

###### Security/Compliance

- Confirm generated bodies are secret-free.

## Initiative: INIT-002 Hybrid Local Docker to Cloudflare MVP
Priority: P0
Size: L

#### Objective

Ship the deployable MVP lane for `dev.projectit.ai/tools/token-reporting`.

#### Release Value

The operator can run Token Reporting locally, expose it through the existing
projectit.ai Cloudflare pattern, and perform UAT without waiting for a
Cloudflare-native rewrite.

#### Success Criteria

- Production server serves the Vite build and dynamic API under the configured
  base path.
- Docker Compose starts the app with mounted data and logs.
- Caddy preserves `/tools/token-reporting` and proxies to the app.
- Cloudflare Tunnel config example maps the public route to Caddy.

#### Feature Scope

- Runtime path helpers.
- Production Node server.
- Dockerfile and compose.
- Caddy and Cloudflare Tunnel templates.
- UAT documentation.

#### Assumptions

- Local filesystem state remains the source of truth for accumulated snapshots
  during the hybrid MVP.
- Cloudflare Tunnel is the publication bridge for the first projectit.ai lane.

#### Dependencies

| Ticket | Description | Status |
|--------|-------------|--------|
| #1244 | SDLCA bridge/API contract remains the forensic execution boundary. | Open |

#### I Know I Am Done When

- Local production and hybrid Caddy smoke tests pass.
- Public Cloudflare Tunnel smoke can be run once the route token is available.

### Epic: EP-002 Production Subpath Runtime
Priority: P0
Size: M

#### Objective

Make the app production-safe under `/tools/token-reporting`.

#### Release Value

The same build can run locally, behind Caddy, and behind Cloudflare Tunnel.

#### Success Criteria

- Browser data fetches use the configured base path.
- Refresh uses same-origin API in production.
- Static files and SPA fallback work under the subpath.

#### Feature Scope

- Runtime path helper.
- App fetch path updates.
- Production server API and static routing.

#### Assumptions

- The production server can reuse the existing dynamic integration handler.

#### Dependencies

| Ticket | Description | Status |
|--------|-------------|--------|
| (none) | Runtime implementation is internal to this repo. | - |

#### I Know I Am Done When

- Unit tests cover subpath data and API routing.

#### Code Areas

- `src/lib/runtimePaths.ts`
- `src/server/productionServer.ts`
- `scripts/serve-production.ts`
- `src/App.tsx`
- `vite.config.ts`

#### Questions for Tech Lead

- Should the production wrapper later move from `tsx` to emitted JavaScript for
  smaller production images?

#### Security/Compliance

- API routes must not expose raw secrets.
- Static routing must reject path traversal.

#### Story: Serve app and API under `/tools/token-reporting`
Priority: P0
Size: M

##### User Story

As a projectit.ai user, I want Token Reporting to load under
`/tools/token-reporting` so it can coexist with the rest of the suite.

##### TL;DR

Add a production Node wrapper that serves `dist`, `public/data`, and the dynamic
API under the configured base path.

##### Why This Matters

The existing Vite dev shape is not enough for projectit.ai publication.

##### MoSCoW

**Must Have**:
- Subpath static assets.
- Subpath data files.
- Subpath API routes.

**Should Have**:
- Root redirect to the configured base path.

**Could Have**:
- Immutable caching for hashed assets.

**Won't Have**:
- Native Workers dynamic refresh in this story.

##### Acceptance Criteria

- `GET /tools/token-reporting/data/claude/latest-metadata.json` returns JSON.
- `POST /tools/token-reporting/api/refresh` reaches the dynamic API handler.
- Unknown app routes return `index.html`.
- `GET /` redirects to `/tools/token-reporting/`.

##### Constraints

- Preserve read-only guard behavior for mutating APIs.

##### Implementation Notes

- Use Node built-ins rather than adding an Express dependency.

##### Security/Compliance

- Reject path traversal when serving static files.

##### Subtasks Needed

- Add production server module.
- Add serve script.
- Add focused tests.
- Add Vite base path support.

##### Task: Add subpath production server tests
Priority: P0
Size: XS

###### Summary

Add failing tests before production server implementation.

###### Context

The constitution requires Red-Green-Refactor for new behavior.

###### I Know I Am Done When

- Tests fail before implementation and pass after implementation.

###### Implementation Notes

- Use a temporary dist/data root.

###### Security/Compliance

- Include static path traversal coverage in follow-up if not in first slice.

### Epic: EP-003 Docker, Caddy, and Tunnel Publication
Priority: P0
Size: M

#### Objective

Package the hybrid MVP so the operator can run and publish it reproducibly.

#### Release Value

The app can move from local dev to projectit.ai preview without hand-built host
state.

#### Success Criteria

- Dockerfile builds the projectit.ai subpath app.
- Local Docker compose starts the app.
- Hybrid compose starts app plus Caddy.
- Tunnel config example documents the public route.

#### Feature Scope

- `.dockerignore`
- `deploy/local-docker`
- `deploy/hybrid-cloudflare`
- `deploy/cloudflare-tunnel`

#### Assumptions

- Tunnel credentials are supplied outside git.

#### Dependencies

| Ticket | Description | Status |
|--------|-------------|--------|
| EP-002 | Production subpath runtime must exist before Docker/Caddy is useful. | In Progress |

#### I Know I Am Done When

- Compose files are committed and documented.

#### Code Areas

- `deploy/local-docker`
- `deploy/hybrid-cloudflare`
- `deploy/cloudflare-tunnel`

#### Questions for Tech Lead

- Should the final production image be published to GHCR or only built locally
  for the MVP?

#### Security/Compliance

- Do not commit tunnel tokens or provider credentials.

#### Story: Add Docker, Caddy, and Cloudflare Tunnel templates
Priority: P0
Size: S

##### User Story

As the operator, I want deploy templates committed so I can run the same
publication lane repeatedly.

##### TL;DR

Commit Docker, compose, Caddy, and tunnel examples.

##### Why This Matters

Deployment instructions without executable assets drift quickly.

##### MoSCoW

**Must Have**:
- Dockerfile.
- Local Docker compose.
- Hybrid Caddy compose.
- Tunnel config example.

**Should Have**:
- Mounted data and logs.

**Could Have**:
- Optional tunnel profile in compose.

**Won't Have**:
- Committed secrets.

##### Acceptance Criteria

- `docker compose -f deploy/local-docker/docker-compose.yml config` succeeds.
- `docker compose -f deploy/hybrid-cloudflare/docker-compose.yml config` succeeds.
- Tunnel example includes a catch-all 404 rule.

##### Constraints

- `.env.admin.credentials` remains gitignored.

##### Implementation Notes

- Preserve the path prefix through Caddy.

##### Security/Compliance

- Use comments for optional secret mounts instead of requiring a local secret
  file to exist.

##### Subtasks Needed

- Add Dockerfile.
- Add compose files.
- Add Caddyfile.
- Add tunnel config example.

## Initiative: INIT-003 Cloudflare-Native Lane and UAT
Priority: P1
Size: L

#### Objective

Document and scaffold the Cloudflare-native future lane while completing MVP
UAT coverage.

#### Release Value

The project can publish now through the hybrid lane and evolve later toward
Workers Static Assets, D1/R2, Queues/Workflows, and Cron without hiding the
credential and bridge-boundary work.

#### Success Criteria

- Cloudflare-native scaffold serves read-only assets and contract endpoint.
- Mutating refresh is disabled with a clear response in the native lane.
- UAT scenarios cover local Docker, hybrid, tunnel, and native read-only
  preview.

#### Feature Scope

- Cloudflare Worker scaffold.
- Wrangler config.
- Deployment runbook.
- UAT scenarios.

#### Assumptions

- Cloudflare-native dynamic refresh requires a follow-up architecture decision.

#### Dependencies

| Ticket | Description | Status |
|--------|-------------|--------|
| INIT-002 | Hybrid MVP should land before dynamic Workers-native refresh work starts. | In Progress |

#### I Know I Am Done When

- The native lane is explicit, safe, and not confused with the hybrid production
  lane.

### Epic: EP-004 Cloudflare-Native Read-Only Scaffold
Priority: P1
Size: M

#### Objective

Create a safe Workers Static Assets starting point.

#### Release Value

Future Cloudflare-native work starts from a committed scaffold rather than a new
blank design.

#### Success Criteria

- Wrangler config exists.
- Worker health and contract endpoints exist.
- Mutating API routes return a clear disabled response.

#### Feature Scope

- `deploy/cloudflare/wrangler.jsonc`
- `deploy/cloudflare/worker/index.ts`
- `deploy/cloudflare/README.md`

#### Assumptions

- Dynamic refresh stays hybrid until Cloudflare bindings are approved.

#### Dependencies

| Ticket | Description | Status |
|--------|-------------|--------|
| EP-002 | Build output and base path support are required. | In Progress |

#### I Know I Am Done When

- Native lane files are committed and documented.

#### Code Areas

- `deploy/cloudflare`

#### Questions for Tech Lead

- Should D1 or Hyperdrive be preferred for normalized historical snapshots?

#### Security/Compliance

- Native lane must not accept mutating refresh until secret and state strategy is
  approved.

#### Story: Add Cloudflare-native read-only scaffold
Priority: P1
Size: S

##### User Story

As a future maintainer, I want a Cloudflare-native scaffold so I can evolve the
app toward Workers without confusing it with the current hybrid production lane.

##### TL;DR

Add Wrangler config and a read-only Worker.

##### Why This Matters

It keeps path 6 visible without creating an unsafe partial production refresh
implementation.

##### MoSCoW

**Must Have**:
- Static assets config.
- Health endpoint.
- Contract endpoint.
- Disabled mutating APIs.

**Should Have**:
- README explaining future D1/R2/Queues/Workflows/Cron decisions.

**Could Have**:
- Local Wrangler preview instructions.

**Won't Have**:
- Provider Admin/API credential storage in this slice.

##### Acceptance Criteria

- `deploy/cloudflare/wrangler.jsonc` exists.
- `/api/integration/contract` returns read-only native metadata.
- `/api/refresh` returns HTTP 503 in the native lane.

##### Constraints

- Do not import Node-only provider refresh code into the Worker.

##### Implementation Notes

- Keep the Worker small and explicit.

##### Security/Compliance

- No secrets in Wrangler vars.

##### Subtasks Needed

- Add Wrangler config.
- Add Worker entry point.
- Add README.

### Epic: EP-005 Publication UAT and Runbook
Priority: P0
Size: M

#### Objective

Make the publish lane testable by the operator and future agents.

#### Release Value

UAT is repeatable and observable instead of dependent on memory.

#### Success Criteria

- UAT scenarios are committed.
- Runbook includes commands, variables, checklist, and rollback.
- Logging guidance keeps DEBUG and VERBOSE at 3 for troubleshooting sessions.

#### Feature Scope

- UAT document.
- Deployment runbook.
- README and onboarding updates.

#### Assumptions

- Operator executes public tunnel UAT once Cloudflare route credentials are
  available.

#### Dependencies

| Ticket | Description | Status |
|--------|-------------|--------|
| EP-003 | Docker/Caddy/Tunnel templates must exist before UAT can be executed. | In Progress |

#### I Know I Am Done When

- The operator can follow the runbook from clone to local/hybrid smoke.

#### Code Areas

- `docs/uat/projectit-ai-cloudflare-publish-uat.md`
- `docs/deployment/projectit-ai-cloudflare-runbook.md`
- `README.md`
- `README_ONBOARDING.md`

#### Questions for Tech Lead

- Should production route promotion require a separate operator-signed UAT issue?

#### Security/Compliance

- Runbook must explicitly keep secrets out of git and logs.

#### Story: Add publish UAT and runbook docs
Priority: P0
Size: S

##### User Story

As the operator, I want repeatable UAT and rollback instructions so I can safely
publish Token Reporting at projectit.ai.

##### TL;DR

Document local Docker, hybrid Caddy, Cloudflare Tunnel, and native read-only
preview tests.

##### Why This Matters

The publishing lane is not done until a realistic user can verify it.

##### MoSCoW

**Must Have**:
- Local Docker UAT.
- Hybrid Caddy UAT.
- Cloudflare Tunnel UAT.
- Rollback instructions.

**Should Have**:
- Native read-only UAT.

**Could Have**:
- Screenshots after operator UAT.

**Won't Have**:
- Public route assertion before route credentials are available.

##### Acceptance Criteria

- UAT doc includes goal, prerequisites, steps, and expected results.
- Runbook includes commands and rollback.
- README links to both documents.

##### Constraints

- Do not include raw secrets or tokens.

##### Implementation Notes

- Keep commands copy/paste friendly.

##### Security/Compliance

- Include log redaction expectations.

##### Subtasks Needed

- Add UAT doc.
- Add runbook.
- Update README.
- Update onboarding.
