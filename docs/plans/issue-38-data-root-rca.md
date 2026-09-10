# Issue #38: collection and served-data root invariant

Tracking: [Token Reporting #38](https://github.com/kdtix-open/token-reporting/issues/38).

## Evidence and scope

Fresh readback on 2026-09-09 distinguished service health from collection and
publication. The production service was running. Its latest observed provider
job completed all five collection subprocesses at approximately 01:19 UTC that
day, and the deployment checkout contained snapshots with corresponding capture
timestamps. Both the public mounted routes and canonical data directory still
contained snapshots captured on 2026-09-02 at approximately 17:26 UTC.

The verified source path in deployed revision
`c1f610a8c3a38210def9864b9a5e4fa029138e85` was:

1. The server honored `TOKEN_REPORTING_DATA_ROOT` for HTTP reads and job storage.
2. Refresh subprocesses inherited the deployment checkout as their working
   directory, as required to execute that released code.
3. All five provider persistence defaults wrote to `cwd/public/data`; the three
   incremental-history readers also read their cursors from that directory.
4. Subprocess success was reported even though the served snapshots had not
   advanced. HTTP 200 and a running process did not prove collection publication.

The Hugging Face candidate CLI had the same default-output mismatch and lacked
a read-only guard. This contribution covers that same refresh-chain invariant
and the [#45 pre-refresh persistence safeguards](https://github.com/kdtix-open/token-reporting/issues/45)
below, not new providers, billing semantics, or the forensic bridge.

These observations prove a read/write root split, not that a provider returned
complete, current usage. Snapshot capture time remains distinct from the source
usage window and from response-generation time. Missing-value/origin handling
in the actuals contract is a separate part of #38.

## Implemented contract, pending production activation

- `resolveDataRoot` is a filesystem-only resolver: an explicit `dataRoot` option
  takes precedence over `TOKEN_REPORTING_DATA_ROOT`; otherwise local development
  retains `cwd/public/data`. Relative paths resolve against the code working
  directory. Explicit empty/whitespace values fail closed instead of falling
  back to the code directory. Production must use an absolute, durable root.
- The five provider writers use this root for both latest and accumulated
  snapshots. Explicit `outputPath` remains the highest-precedence override.
- Incremental-history readers use the same configured root and retain their
  existing lookback overlap and deduplication semantics.
- The production server passes its resolved root into the refresh executor;
  that root overrides a conflicting child environment value without changing
  the code working directory or mutating the caller's environment object.
- The standalone integration server uses the same root resolver and propagation.
- The candidate CLI delegates persistence to a guarded helper and refuses a
  read-only refresh before any network request. The existing explicit candidate
  path override remains supported; operators must align it with the reader if
  they intentionally use it.

No historical records are copied, overwritten, reconciled, or fetched by this
development activity. No service is restarted. The existing deployed snapshots
must be backed up and reconciled separately under the
[Token Reporting-only recovery procedure](../deployment/projectit-ai-cloudflare-runbook.md#token-reporting-only-durable-deployment).

## Copilot pre-refresh safeguards (#45)

The prior persistence key included request and interaction counts. A provider
correction to either mutable count therefore appended another user/day row
instead of replacing the original observation. The corrected key is the day and
stable user ID, with a case-normalized identified login as a fallback. When a
same-day login maps unambiguously to an ID already present in the observed
records, that ID is retained on the replacement. Anonymous observations and
ambiguous login-to-ID mappings fail before either snapshot is written.

Both initial and accumulated reports deduplicate by this identity and recompute
usage summaries. Distinct days and IDs remain distinct; identical replay is
idempotent. This does not allocate enterprise billing or invent missing tokens.

Signed download URLs are needed only while the client fetches the usage files.
New persistence writes store `download_links: []` and `download_link_count`,
preserving the count from current links or an already-redacted replay. They do
not re-publish signed URLs inherited from prior accumulated snapshots. The
companion #45 schema/service change preserves the UI download count, and the
client change sanitizes download errors. Existing private backup files remain
untouched; this code change alone does not sanitize the currently deployed data.

## Regression evidence

Baseline from `f15973f98009e41786e4934c4287635abf57b2bc`:
`npm test` passed 35 files and 297 tests, with no skips or failures. Coverage was
84.44% statements, 70.83% branches, 86.34% functions, and 85.89% lines.

The first failing regression run reproduced all five misplaced writes and all
three misplaced incremental cursor reads. Further failing cases verified that
explicit root options were ignored and that successful fixture refreshes left
the HTTP-served `generatedAt` unchanged. The candidate CLI's failing regression
used an in-process fake fetch to prove read-only mode reached the network layer
and that a separate code directory received the output instead of the data root.

Tests use temporary directories and mocked provider collection only:

- `src/lib/__tests__/dataRoot.test.ts`: default, environment, explicit option,
  relative-path, process-environment precedence, and fail-closed blank values.
- `src/lib/__tests__/providerDataRoot.test.ts`: all five latest/accumulated
  writers, direct path overrides, root overrides, read-only behavior, and all
  three incremental cursor readers.
- `src/server/__tests__/productionDataRoot.test.ts`: the real server, refresh
  executor, and provider persistence with only the external subprocess replaced;
  verify the HTTP-served snapshot changes after successful fixture refresh.
- `src/lib/__tests__/huggingFaceCandidatePersistence.test.ts`: guarded
  persistence, legacy path overrides, and the actual CLI with fake fetch.
- `src/lib/__tests__/providerDataRootCli.test.ts`: all five actual `fetch-*`
  entrypoints run with fixture-only process environments, fake fetch, and
  isolated code/data directories. The Claude Code child stubs `os.homedir` and
  guards session reads outside its temporary fixture; it does not change `HOME`
  or inspect real sessions. The three incremental CLI calls verify the request
  window came from the configured history root.
- `src/providers/githubCopilot/__tests__/persistence.test.ts`: revised counts,
  initial duplicates, replay, distinct users/days, renamed and fallback logins,
  fail-closed identities, signed-link removal, and safe download counts. Twelve
  regressions failed before the fix; all fourteen cases then passed.

Final isolated Node 24 validation passed 41 files / 359 tests with no skips or
failures. Coverage was 85.95% statements, 72.34% branches, 88.46% functions, and
87.49% lines: increases of 1.51, 1.51, 2.12, and 1.60 percentage points over the
recorded baseline. GitHub persistence reached 100% statement, function, and line
coverage; its total branch coverage was 87.27%, including legacy merge paths.
Typecheck, ESLint, Markdown lint, and whitespace validation passed. This worktree
predates the security/build prerequisite; final audit and warning-free mounted
build gates must run on the combined current-main integration, not this old
dependency baseline.

The durable capability is the separate-code-root/data-root regression matrix.
Do not replace it with a same-directory fixture: that conceals the entire class
of deployment defect. Future provider writers must join this invariant.

## Ownership and outstanding acceptance

Token Reporting maintainers own detection, diagnosis, remediation, and the
regression capability. The Operator retains production activation and recovery
authority; bridge and APQ owners are not required to recycle their services for
this repair. Security prerequisite #41 must clear before committing/publishing.

Production completion requires a newly authorized, backed-up activation followed
by comparison of capture identity and usage-window metadata between collection
output, the configured served directory, local mounted routes, and public
mounted routes. A successful build or the offline tests do not close that gate.
