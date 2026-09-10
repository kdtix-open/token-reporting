# Provider actuals contract v0.2

Status: implementation candidate for [issue #38](https://github.com/kdtix-open/token-reporting/issues/38).
This is a source contract, not a claim that the candidate is currently deployed.
Deployment needs independent mounted-route readback.

## Purpose and compatibility

SDLCA needs observable usage and cost evidence without mistaking missing records,
demonstration seeds, or estimates for actual bills or available capacity.
`sdlca-token-reporting-dynamic-v0.2` retains these routes:

- `GET /api/integration/contract`
- `GET /api/providers/:providerId/usage`
- `GET /api/providers/:providerId/budget-status`
- `GET /api/budgets`

The version is returned in `X-Token-Reporting-Contract`; the contract and budget
list also identify it in their bodies. Production mounts routes under
`/tools/token-reporting`. Consumers must handle nullable fields and the `unknown`
threshold. This is a semantic change from v0.1, not numeric backward compatibility.
Refresh/forensic routes are retained. This change neither collects new data nor
authorizes a refresh or deployment.

## Source selection and identity

The shared `resolveDataRoot` chooses an explicit root, then
`TOKEN_REPORTING_DATA_ROOT`, then the unconfigured local `public/data` default.
An explicit empty/whitespace setting fails closed. Readers and collectors must
use the same resolved root; see the
[deployment runbook](../deployment/projectit-ai-cloudflare-runbook.md).

For each registered provider, independently attempt:

1. `accumulated-metadata.json`: file read, JSON parse, provider schema transform.
2. `latest-metadata.json`: the same complete validation sequence.
3. Registry seed, explicitly labeled `seed`.

A failed read, malformed JSON, or schema-invalid accumulated file cannot prevent
valid latest data or other providers from loading. Parse errors and private
filesystem paths are not exposed in the response.

`origin` is `accumulated`, `latest`, `seed`, or `unknown`. Validated file bytes
produce `snapshotId: sha256:<digest>`. Identity is not completeness. Injected
summaries without provenance are `unknown`, not relabeled as accumulated data.
Seed usage/cost totals and dates are null in this API; dashboard seeds remain
available internally.

## Time and coverage

| Field | Meaning |
| --- | --- |
| `observedAt` | API response time, never collection time. |
| `snapshotGeneratedAt` | Persisted generation timestamp, else null. |
| `lastFetchedAt` | Explicit persisted top-level `fetchedAt`, else null. |
| `freshness` | `timestamp_known` or `unknown`, not a freshness guarantee. |
| `coverage.status` | `unknown`: complete coverage is not proven. |

Timestamps must be valid timezone-bearing ISO calendar timestamps, not later
than `observedAt`. Invalid/impossible dates, missing timestamps, and future
timestamps are not replaced with response time. Legacy generatedAt-only snapshots
therefore have `lastFetchedAt: null`.

`reportStartDay` and `reportEndDay` retain observed provider summary boundaries.
No-bucket Codex/Claude snapshots and empty Claude Code histories return null
instead of the adapters' synthesized or empty dates. Both endpoints must also be
valid ISO calendar days in ascending order; impossible or reversed windows
return null boundaries even when the native schema accepts those strings. Endpoint
inclusivity and timezone can differ; these do not certify every day was collected.
Budget-list `generatedAt` remains a response-time compatibility field equal to
`observedAt`, not collection time. No collection metadata is fabricated or written.

## Usage, units, and cost basis

Missing metrics are null; observed zero remains zero. `observedMetricValue`
retains its `observedMetricUnit`; requests are not tokens. `units` identifies
tokens, requests, and USD. Negative/non-finite usage counts and non-finite costs
are unknown. Finite cost credits remain negative in the usage response.

`costSource` is `actual`, `estimated`, `seat_based`, or null. `totalCostUsd` prefers
a finite provider `actualCostUsd`, including explicit zero charges and credits,
over a projection fallback. Otherwise it retains the labeled period estimate,
not a forecast or invoice total. Missing GitHub seat estimates and empty
projection windows remain unknown instead of looking free. USD-budget admission
requires actual cost, not an estimate. Cost-feed scope/window can differ from
usage-feed boundaries; complete reconciliation is not asserted.
Token-price estimates also require known additive inputs. Missing native cost
amounts cannot become actual zero through schema defaults.
Codex/Claude cost rows also require an explicit USD currency (case-insensitive).
Missing currency and non-USD amounts are unknown, not converted or relabeled.
Native numeric strings remain valid amounts; null, blank, and boolean values
cannot acquire a zero amount through coercion.

| Provider channel | Additive token components | Limitation |
| --- | --- | --- |
| OpenAI Codex | Input + output | Cache read is already inside input. |
| Claude API | Input + output + cache read + creation | Scope not proven. |
| Claude Code | Input + output + cache read + creation | May overlap API. |
| Cursor | Input + output + cache read + write | Write maps to cache creation. |
| GitHub Copilot | Unknown provider-wide total | CLI tokens are only a subset. |

`inputTokenSemantics` is `includes_cache_read`, `separate_cache_components`, or
`unknown`. `totalTokens` is null unless every required additive summary component
is known. `observedTokenSubtotal` sums only known additive components, remaining
null when none are known or their additive semantics are unproven.
`tokenComponentsComplete` describes component
availability in the summary, **not** complete daily/account coverage. Overflowed
totals stay unknown. Never add cache columns to Codex's input-inclusive total
again or sum provider responses as a proven unique cross-provider bill.

Cursor availability is checked against raw events before schema defaults can
erase the distinction. Missing/empty event feeds, absent/null token usage, and
empty token-usage objects do not prove four zero components. A component is
unknown if any event lacks that component, even when another event supplies it.
Explicitly supplied zero fields remain zero. This changes actuals serialization,
not the underlying provider summaries or existing dashboard calculations.
Cursor's interaction aggregate also requires all four contributing counters
(`cmdkUsages`, `composerRequests`, `chatRequests`, `agentRequests`) on every daily
row. Missing counters make requests and the comparison metric unknown; explicit
zeros and a validated empty daily response with a period retain zero.

The loader also preserves native Codex/Claude token, request, and cost-field
availability before their schema defaults are applied. Missing fields and no
reported buckets remain unknown. A valid time bucket with an explicit empty
`results` array is a reported zero for that bucket, distinct from no bucket
evidence. Explicit zero fields and explicit zero costs remain known. Claude cache
creation is unknown if either native cache-duration component is absent; this
conservative interpretation avoids inventing a missing component.
Claude Code requires counts on each dated daily bucket. An entirely empty
`dailyBuckets` array has no observed interval, so its token and request totals
remain unknown; a dated bucket containing explicit zero counts retains zero.
GitHub's interaction summary already requires its count fields; an absent
summary stays unknown, while its explicit zero interaction count stays zero.

## Native-to-serialized field audit

The following matrix covers every serialized usage/cost field for the five
registered adapters, traced through each provider's `types.ts`, `service.ts`,
the registry transform, and `providerActuals.ts`. Here, **presence guard** means
the loader preserves raw absence in `unavailableMetrics` before schema defaults
erase it; serialization then returns null for that field. A mixed set of rows
is incomplete when any contributing row lacks the required field.

### OpenAI Codex

| Field | Native requirement | Adapter default | Actuals guard |
| --- | --- | --- | --- |
| Input / output | `input_tokens` / `output_tokens` | 0 | Presence |
| Cache read | `input_cached_tokens` | Partial sum | Presence |
| Cache create | No provider field | Absent | Null; never added |
| Requests / metric | `num_model_requests` | 0 | Presence |
| Actual cost | `amount.value` + `amount.currency` | 0, USD | Amount + USD |
| Estimated cost | Input + output | Token defaults yield 0 | Known inputs |

The token total is input plus output; cache read is a subset, not another term.
No usage buckets means unknown counts/boundaries; explicit empty result buckets
mean reported zero. Cost amounts accept finite numbers or nonblank numeric
strings. Explicit empty cost result buckets retain zero.

### Claude Admin API

| Field | Native requirement | Adapter default | Actuals guard |
| --- | --- | --- | --- |
| Input | `uncached_input_tokens` | 0 | Presence |
| Output / metric | `output_tokens` | 0 | Presence |
| Cache read | `cache_read_input_tokens` | 0 | Presence |
| Cache create | Both native duration counters | 0 | Presence |
| Requests | No request-count field | Absent | Null; output metric is tokens |
| Actual cost | `amount` + `currency` | 0, USD | Amount + USD |
| Estimated cost | All four components | Token defaults yield 0 | Known inputs |

Amounts are interpreted in the adapter's native cents-to-USD scale, not the
Codex dollar scale. Empty-bucket rules match Codex. Actual zero/credit values
take precedence over a positive estimate that the adapter may otherwise select.

### Cursor

| Field | Native requirement | Adapter default | Actuals guard |
| --- | --- | --- | --- |
| Input / output | Each event's `tokenUsage` | 0 | Presence |
| Cache read / create | `cacheReadTokens` / `cacheWriteTokens` | 0 | Presence |
| Requests / metric | Four daily counters listed above | 0 | Presence |
| Event actual cost | Each event's `chargedCents` | 0 | Active-feed presence |
| Spend actual cost | Each member's `spendCents` | 0 | Active-feed presence |
| Seat estimate | User ID + `usageBasedReqs` | Variable usage 0 | Known inputs |

The adapter selects events over spend whenever the events object exists. The
actuals guard follows that selection; it does not silently substitute another
feed or combine feeds. Empty active event/member cost feeds have no bounded
charge evidence here and remain unknown, even if another feed contains amounts.
An explicit zero charge on an event/member remains observed zero. The adapter
defines these cents fields as USD cents; there is no raw currency field to default.
Empty token event feeds remain unknown. Empty daily activity with its required
period may report zero requests; it does not establish token/cost coverage.

### Claude Code

| Field | Native requirement | Adapter default | Actuals guard |
| --- | --- | --- | --- |
| All tokens | Required dated counts | Empty sums as 0 | Require bucket |
| Requests / metric | `requestCount` | Empty sums as 0 | Require bucket |
| Seat cost | `monthlySeatCost` + dates | Empty totals 0 | Require window |

The schema rejects missing per-bucket counts; explicit zero buckets remain zero.
Raw negative counts are rejected before aggregation, so they cannot cancel
positive counts into an apparently valid total.
This cost is a labeled seat estimate, not a provider invoice. Empty history has
neither an observed interval nor a measured zero total.

### GitHub Copilot

| Field | Native requirement | Adapter default | Actuals guard |
| --- | --- | --- | --- |
| All tokens | No provider-wide fields | CLI-only subset | Null |
| Requests / metric | `usage_summary.totalInteractions` | Null | Preserve 0 |
| Seat cost | Seats + monthly estimate | Missing prices as 0 | Presence |

Interaction counts are not native token counts. CLI request/token fields and
enterprise billing expansion are not silently substituted into this contract.
Known zero billed seats retain a zero seat estimate. Negative seat/price estimates
are invalid, not credits; only observed actual costs can represent credits.
Upstream billing-seat
boundary validation is a separate client safeguard, not proof of billed scope.

Across all adapters, `observedTokenSubtotal` only sums proven additive components;
`totalTokens` additionally requires every additive component. `requestsCount`
never falls back to a token-denominated metric. Unknown-origin injected summaries
cannot recover raw presence evidence and remain ineligible for budget admission.
These guards do not establish collection completeness or authorize activation.

## Budget behavior

Limits must be explicit, finite, and nonnegative. There is no `used × 1.25`
fallback. Missing/invalid limits are null; an explicit zero limit is exhausted.
Supported kinds: `tokens`, `tokens_per_window`, `requests`, `requests_per_window`,
`usd`, `usd_per_window`, and `cost_usd`. Unrecognized kinds have unknown usage.

`used` is the matching complete token total, request count, or actual USD cost.
`remaining` is null when either operand is unknown. These missing facts block
dispatch with `threshold: unknown`:

- Non-seed provenance: `seed_data` or `source_unknown`.
- Valid, non-future generation timestamp: `freshness_unknown`.
- Matching usage: `usage_unknown`.
- Explicit limit: `budget_limit_unknown`.

When prerequisites are present, the existing threshold policy remains: green
below 70%, amber from 70%, red from 90%, exhausted at the limit.
The budget list is
degraded if any provider is unknown or exhausted. These are heuristics on a
snapshot, not proof of upstream capacity or worker-completion probability.
No stale-age threshold or authoritative reset-window alignment is established
here. Admission consumers must additionally validate required age, window,
scope, and upstream capacity before an irreversible operation.

`confidence`, `forecastWindowMinutes`, and both `estimatedDispatchesRemaining`
values are null: there is no calibrated confidence or per-dispatch usage model.
Daily averages do not imply job capacity. Configured `resetAt` remains
configuration evidence, not an independently verified provider reset.

## Verification and ownership

`src/lib/providerActuals.ts` implements the domain contract;
`src/lib/integrationContractDynamic.ts` delegates the routes. Fixtures in
`src/lib/__tests__/providerActuals.test.ts` execute actual handlers and provider
transforms against isolated temporary roots, without API calls or credentials.
Existing dynamic tests retain refresh and forensic behavior checks.

```bash
npx vitest run src/lib/__tests__/providerActuals.test.ts \
  src/lib/__tests__/integrationContractDynamic.test.ts --coverage.enabled=false
npm run typecheck
```

Independent UAT scenario:

- Goal: verify fallback and honest actuals on a mounted API before any refresh.
- Prerequisites: candidate build, isolated fixtures, fixed clock, no credentials.
- Steps: place invalid accumulated and valid latest fixtures; read usage and
  budgets; remove latest and repeat; restore zero usage; supply/remove a
  limit; repeat with missing, invalid, and future generation timestamps.
- Expected: correct latest/seed provenance, unknowns distinct from zero, null
  unknown capacity with dispatch blocked, no response timestamp called fetched,
  Codex cache counted once, and identity tied to exact snapshot bytes.

Token Reporting owns Detect (route regressions), Diagnose (source reconciliation),
Remediate (serialization and shared-root wiring), and Learn (nullable contracts
and regression tests). The Operator retains deployment authority. Independent
review, durable shared-data continuity, and actual collection/coverage evidence
remain separate issue #38 obligations. Passing fixtures is not operational
closure.
