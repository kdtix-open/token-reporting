# Local AI Infrastructure Sizing

This report turns provider token usage into a hardware-aware migration plan. It is intentionally conservative: the first server is a measurement and partial-routing target, not a full replacement for hosted providers.

The CFO/COO-safe rule is: target coverage, derived capacity, and safe initial routing are different numbers. The report must never present the first-server target as if it were measured server capability.

## How Token Usage Maps To Hardware

The sizing model normalizes provider traffic into `NormalizedProviderUsage` rows and keeps each provider's own coverage window. It does not label every row as `aggregate-28-day` when a provider actually has a different window.

The report separates:

- `inputTokens`: provider-reported input volume.
- `uncachedInputTokens`: provider-reported fresh input when available.
- `outputTokens`: generated tokens.
- `cacheCreationTokens`: prompt/cache creation that behaves like fresh inference work.
- `cacheReadTokens`: prompt-cache/KV-cache pressure, tracked separately.

Pure compute tokens are:

```text
(uncachedInputTokens or inputTokens) + outputTokens + cacheCreationTokens
```

Cache reads are excluded from pure compute, but they still matter locally. On local hardware, cache reads become KV-cache residency, memory bandwidth, context-management, and prompt-cache eviction questions.

## Why P99 Context Changes Hardware Requirements

Average tokens per request is not enough for server sizing. A first server can look adequate at p50 and still fail p95 or p99 sessions because long context drives:

- VRAM needed for model weights plus KV cache.
- System RAM needed for offloaded cache.
- Tokens/sec collapse when the KV cache spills to host memory.
- Queueing risk when multiple project lanes share the same GPUs.

The report uses local session distribution when available and carries p50, p95, p99, and max context into the route classes and hardware capacity estimates. Route-specific context stats are only shown when route-specific samples exist. Until then, short-context work is labeled a candidate and global p99 remains a fallback warning.

## Target Coverage vs Derived Capacity

`LocalCoverageSummary` separates the major operating numbers:

- `targetFirstServerCoveragePct`: migration objective, currently 30%.
- `estimatedFullWorkloadCapacityPct`: derived capacity from aggregate tokens/sec divided by current project-lane demand unless route-specific benchmark capacity exists.
- `safeInitialProductionRoutingPct`: 5%-10% by default until benchmark evidence exists.
- `shadowCoveragePct`: shadow replay can cover 100% because it does not make production decisions.
- `canaryCoveragePct`: initial bounded canary percentage after gates pass.

If derived capacity is lower than the target, the report emits:

```text
Target coverage exceeds derived server capacity; treat target as migration objective, not current server capability.
```

This warning must be preserved in the web UI and every export format.

## Route Classes And Overlays

Route classes are either:

- `additive_workload`: workload slices whose token share should sum to about 100%.
- `cross_cutting_overlay`: overlapping pressure, such as long-context tail sessions, that must not be added on top of additive shares.

`long_context_tail` is currently a cross-cutting overlay. It overlaps short-context, worker, and reviewer traffic unless a later route-specific classifier subtracts it from those classes.

The report carries `contextStatsSource` and `contextStatsWarning` so reviewers can see whether p50/p95/p99 values are route-specific, provider-specific, global fallback, or unknown.

## Workload Scopes

The default sizing scope is `repo_automation_project`. The report still compares against all-provider traffic, but Copilot CLI volume does not define one Repo Automation project lane by itself.

Rendered scopes:

- All-provider traffic sizing.
- Repo Automation project-lane sizing.
- Copilot CLI-specific sizing.
- Agentic worker sizing.
- Reviewer sizing.

## First-Server Recommendation

The default budget policy is `$100,000-$150,000`. The first quote target is selected from quoteable NVIDIA floor or pilot profiles. The report should recommend partial local migration only:

- Local shadow mode first.
- Canary low-risk short-context tasks second.
- Local worker with hosted reviewer next.
- Hosted fallback for tail-context and high-risk tasks.

Full local replacement is explicitly not recommended for the first server.

The executive recommendation language is:

- Preferred first quote: 2U dual RTX PRO 6000 if budget discipline is strict.
- Preferred first quote: 4U/5U quad RTX PRO 6000 if vendor can quote within budget or financing is approved.
- Preferred first operational path: cloud baseline -> local shadow -> 5%-10% canary -> local worker with cloud reviewer -> expand only after measured benchmark evidence.

## Hardware Profiles

Hardware profile data lives in `src/lib/hardwareProfiles.ts`. Pricing is marked `quote_required` unless a vendor quote has been captured and reviewed.

Profiles currently cover:

- Quote A: 2U dual RTX PRO 6000 Blackwell Server Edition floor prototype for shadow/canary work.
- Quote B: 4U/5U quad RTX PRO 6000 Blackwell Server Edition preferred first serious worker-pool quote.
- Quote C: 4U/6U/8U 8x RTX PRO 6000 Blackwell Server Edition production-node candidate, quote later.
- Custom WRX90 quad RTX PRO 6000 Blackwell Max-Q floor prototype.
- L40S / RTX 6000 Ada budget proof-of-concept.
- Production Node: 8x H200 or B200 NVLink / NVSwitch server, not the first $150K purchase.
- Rack Scale: GB200 NVL72, direct liquid/high-density planning only.
- Future / Unquoted: Rubin-class placeholder, never a first-server recommendation.

Every profile includes:

- `quotePriority`: `quote_now`, `quote_later`, or `do_not_quote_yet`.
- `firstServerRole`: `shadow`, `canary`, `worker_pool`, `production_lane`, or `rack_scale`.
- `maxSafeInitialRoutingPct`.
- `fullProjectLaneClaimAllowed`.
- `analystNarrative`.

## Adding Vendor Quotes

When a quote arrives, update or extend the matching hardware profile with:

- Vendor and quote SKU.
- Rack units, chassis depth, and rail compatibility.
- GPU type, GPU count, GPU memory, interconnect, and MIG support.
- System RAM, NVMe, network, and OS image.
- Power feeds, estimated kW, and cooling type.
- Support SLA, delivery time, return policy, and quote validity.
- Capex low/high values and `pricingConfidence`.

Do not replace `quote_required` with stronger confidence until the quote is stored and reviewed.

## Financial Payback

The CFO view shows two separate payback models:

- Reduced provider spend: uses only avoidable usage-based spend. Seat-based providers such as GitHub Copilot and Claude Code are not counted as directly displaced unless seat count or plan usage changes.
- Productized reserved capacity: uses configurable Reserved AI Engineering Capacity assumptions, including pilot lane price, production lane price, dedicated appliance monthly price, target lanes per server, and hardware basis.

Cloud spend alone may not justify the first server at a 5%-10% canary. Productized reserved capacity is the strategic payback path until real customer pricing and measured lane capacity are available.

## Benchmark Import

The report reserves this benchmark import path:

```text
public/data/benchmarks/local-hardware/latest.json
```

Benchmark captures should include:

- `hardwareProfileId`
- `modelId`
- `quantization`
- `servingStack`
- `contextTokens`
- `batchSize`
- `concurrency`
- `ttftMs`
- `tokensPerSecond`
- `p50LatencyMs`
- `p95LatencyMs`
- `p99LatencyMs`
- `gpuUtilizationPct`
- `vramUsedGb`

Before routing production traffic locally, replay anonymized prompts from `~/.codex` and `~/.claude/project` sessions, shadow current bridge-backed requests, and compare local worker plus cloud reviewer against cloud worker plus cloud reviewer.

## Benchmark Gates

Production routing is blocked until required gates pass:

- `shadow_replay_gate`
- `short_context_canary_gate`
- `local_worker_cloud_reviewer_gate`
- `fallback_failure_gate`
- `p95_p99_context_pressure_gate`
- `power_thermal_burn_in_gate`

Each gate records the phase, minimum sample count, required metrics, pass criteria, and fail action. Gate status values are `not_started`, `in_progress`, `passed`, or `failed`.

## Data-Quality Warnings

Keep these warning themes visible in UI and exports:

- Route-specific context distributions are not yet available; global p99 context is used as fallback.
- Token-share classes include cross-cutting overlays; do not sum overlay percentages as total workload.
- GitHub Copilot CLI dominates token volume and may not be economically displaced unless seat count or provider usage changes.
- First-server recommendation is for controlled migration and measurement, not full workload replacement.
- All RTX PRO 6000 pricing and 4-GPU server configurations require vendor quotes.

## Changing Budget Assumptions

The builder accepts budget overrides:

```ts
buildLocalInfrastructureSizing({
  budgetLowUsd: 100_000,
  budgetHighUsd: 150_000,
  summaries
});
```

Use a lower range for a short-context proof-of-concept and a higher range for a production-node quote. The route plan should still keep cloud fallback until measured benchmarks prove otherwise.
