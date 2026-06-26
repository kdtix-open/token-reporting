# CodeGraph Token Usage Heartbeat

Use this skill when running the daily CodeGraph token/usage measurement heartbeat for the token-reporting repo.

## Contract

- Reuse the dedicated CodeGraph token-usage heartbeat thread.
- Run from `/Users/ckreager/repos/kdtix/token_reporting`.
- Run the CodeGraph gate before discovery or script execution:

```bash
cd /Users/ckreager/repos/kdtix/token_reporting
if command -v codegraph >/dev/null 2>&1; then
  if [ -d .codegraph ]; then codegraph sync . || codegraph status .; else codegraph init .; fi
  codegraph status .
fi
```

- Generate the report with:

```bash
node scripts/analyze-codegraph-token-usage.mjs --journal-issue kdtix-open/token-reporting#25
```

- Preserve the report heading shape:

```text
CodeGraph Token Usage Heartbeat - <ISO timestamp>
```

- Journal to GitHub with the script's `--journal-issue` option, which uses `gh issue comment --body-file`.
- Refresh the local automation memory under:

```text
/Users/ckreager/.codex/automations/codegraph-token-usage-heartbeat/memory.md
```

## Interpretation Rules

- Treat the data as internal monitoring evidence unless paired fresh-thread trials exist.
- Separate factual telemetry from conclusions:
  - factual: measured `token_count` turns, CodeGraph-assisted turns, shell-search/read turns, medians and deltas
  - conclusion: whether CodeGraph reduces cost for a task class
- Do not claim client-facing savings from observational history alone.
- Call out low CodeGraph sample counts or setup-heavy samples as caveats.

## Daily Output

After the run, respond briefly in-thread with:

- report path
- journal issue/comment result
- measured turn count
- CodeGraph-assisted turn count
- median total-token delta
- median billable-proxy delta
- whether the evidence is improving, neutral, or still inconclusive
