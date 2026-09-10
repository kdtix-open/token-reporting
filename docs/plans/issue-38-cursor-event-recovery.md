# Conservative Cursor event recovery plan

Tracking: [runtime freshness #38](https://github.com/kdtix-open/token-reporting/issues/38)
and [historical conflicts #46](https://github.com/kdtix-open/token-reporting/issues/46).

This is an offline recovery capability, not a collection result or complete
billing-history certification. The implementation has no file, network,
environment, clock, deployment, or refresh side effects. Its output must be
independently inspected as a private candidate before any separately authorized
canonical write. Do not invoke provider persistence against live data to create
that candidate: those writers also replace latest snapshots and capture metadata.

## Verified read-only preflight

At 2026-09-09 23:55 UTC, all 20 latest/accumulated snapshots across the five
providers and both approved data roots passed the combined schemas. Every source
file hash remained unchanged. No provider call, credential read, or data write
was performed. Counts below identify records, not token or monetary totals.

The Cursor accumulated snapshots had:

| Check | Canonical | Previous deployment |
| --- | ---: | ---: |
| Event records and unique production event keys | 1,832 | 5,419 |
| Unique core event identities, excluding mutable cost fields | 1,832 | 5,419 |
| Daily user/day identities | 30 | 65 |

Both nonempty redaction fingerprints and scheme versions matched. All 1,832
shared **event** payloads were identical. The deployment contributed 3,587
additional events, including 3,257 dated July 8–29 outside the then-current
incremental window starting September 2. An event-only union therefore has
**5,419 unique events**, with no duplicate or replaced canonical observations.

Daily history is deliberately excluded: one shared September 3 user/day payload
differs in `agentRequests` and `subscriptionIncludedReqs`. A combined daily/event
recovery requiring identical overlaps would correctly refuse this input.

Raw source-file SHA-256 values from that readback:

- Canonical Cursor accumulated snapshot:
  `4d45ae62c5d1938f286012382903e1820bd0316473282153ad4bf8ada3e2b9fd`
- Previous deployment Cursor accumulated snapshot:
  `65f3760922aa166dfbbd7f47e6f11012c1200a0fa773f163891cc286867a2328`
- Canonical generation timestamp to preserve:
  `2026-09-02T17:25:59.274Z`

These are historical preflight assertions. Revalidate the exact private inputs
before planning/applying recovery; changed hashes require a fresh review.

## Pure helper contract

`planCursorEventRecovery(canonical, deployment)` returns an in-memory
`{ snapshot, manifest }`. It:

1. Validates both snapshot schemas and requires both event feeds. Missing feeds
   are unknown, not fabricated empty observations.
2. Requires equal, nonempty redaction scheme and fingerprint values.
3. Keys events by normalized epoch-millisecond timestamp, user, model, and kind.
   Cost fields are excluded so changing a cost cannot masquerade as a new event.
   Missing/null core fields use the same identity as an empty string; payload
   differences still cause refusal instead of becoming additional observations.
   Duplicate core identities within either input are rejected, even when the
   duplicate payloads happen to match.
4. Requires identical shared event payloads, apart from equivalent numeric/string
   timestamp representation. Any upward, downward, or token-only correction
   causes refusal; there is no maximum-value or newer-is-better heuristic.
5. Retains every canonical event and adds only deployment-only identities.
   Canonical event order is retained; added events use deterministic timestamp
   and code-unit identity ordering. The resulting union is checked for uniqueness.
6. Changes only `events.usageEvents`, `events.totalUsageEventsCount`, and the union
   of existing event-period bounds. If either feed lacks bounds, the candidate's
   period is omitted as unknown, including any inherited canonical bounds.
   Periods describe supplied bounds, not proof of complete daily coverage.
7. Preserves canonical `daily`, `spend`, `generatedAt`, redaction fields, unknown
   extensions, and all other metadata. It does not mutate either input.

The sanitized manifest includes record counts and three SHA-256 hashes. The
`sha256-canonical-json-v1` algorithm recursively orders object keys by JavaScript
code-unit comparison, retains array order, serializes as JSON, then hashes UTF-8
bytes. These semantic hashes are **not raw file-byte hashes**; retain the raw
input hashes alongside the manifest. No event IDs, identities, model names,
fingerprint values, token amounts, or costs appear in the manifest.

Expected counts for the verified input pair are: canonical 1,832; deployment
5,419; shared 1,832; added 3,587; candidate 5,419. A second application adds zero
and produces the same candidate hash. A plan is not a write authorization.

## Explicitly deferred conflicts and refresh hold

Canonical remains the retained copy for unresolved historical overlaps; that is
an evidence-preservation policy, not a claim that its disputed values are proven
correct. Both alternatives remain in private backups. Do not sum overlapping
observations or choose the largest/newest values to make the report look complete.

- Cursor daily: the September 3 conflict and 35 deployment-only daily identities
  are excluded from this event-only capability.
- Claude: 13 normalized shared cost-bucket differences from July 6–24 require
  accounting disposition; the incremental window would not revisit them.
- OpenAI Codex: August 25 usage and cost buckets differ; the deployment copy has
  lower usage/request dimensions. Incremental collection would not revisit them.
- Claude Code: four older shared days (August 2, 4, 8, and 9) have lower values
  in the deployment scan, September 2 differs upward, and canonical alone retains
  July 9. The existing full-scan collector replaces whole same-date buckets, so
  replaying the observed deployment scan would overwrite disputed canonical days.
- GitHub Copilot: canonical retains 73 identities absent from deployment while
  deployment has four newer identities. A wholesale replacement would lose history.

**Do not deploy or trigger live refresh while the known Claude Code replacement
could choose disputed values without disposition.** Track these decisions in
Issue #46. A later approved guard or per-identity disposition must preserve evidence
and explicitly authorize any downward correction; a permanent maximum-value
rule would conceal legitimate corrections and is not acceptable.

Issue #38 freshness recovery needs separate downstream collection/served-identity
proof. Even after that proof, unresolved historical coverage remains disclosed;
neither a new generation timestamp nor this event union closes #46.

## Regression evidence

The unchanged source worktree baseline passed 41 files / 359 tests before this
capability. The new contract first failed 25 fixture tests, then passed after
implementation. Further failing locale-dependence and nullable-identity
regressions required locale-independent ordering and prevented missing-to-empty
field changes from becoming duplicate observations. Two missing-period-side
regressions failed before making union bounds explicitly unknown whenever either
feed lacks bounds. Fixtures cover conflicting/duplicate identities,
upward and downward corrections, missing metadata, invalid timestamps and periods,
input preservation, deterministic hashes, and idempotence. Tests use no live
snapshots, providers, credentials, or filesystem writes.

Final source-worktree validation: 42 files / 390 tests passed, including all
31 recovery cases. Typecheck, ESLint, Markdown lint, and `git diff --check` passed.
Overall statement/branch/function/line coverage changed from
85.95/72.34/88.46/87.49% to 86.14/72.67/88.65/87.66%; the helper reached
100% statement/function/line and 97.91% branch coverage.

Security/build prerequisite changes are integrated separately by the root owner;
do not commit this older-dependency worktree or certify its audit as current.
