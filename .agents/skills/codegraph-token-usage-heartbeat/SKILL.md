---
name: codegraph-token-usage-heartbeat
description: Run the daily CodeGraph token/usage measurement heartbeat for the token-reporting repo.
---

# CodeGraph Token Usage Heartbeat

Use this skill when running the daily CodeGraph token/usage measurement heartbeat for the token-reporting repo.

## Contract

- Reuse the dedicated CodeGraph token-usage heartbeat thread.
- Run from the `token_reporting` repository root. Resolve it dynamically with
  `git rev-parse --show-toplevel` when the current directory may be nested.
- Stop before the CodeGraph gate or script execution when `TOKEN_REPORTING_READ_ONLY` is `1` or `true`; the gate can update `.codegraph`.
- Run the read-only guard and then the CodeGraph gate before discovery or script execution:

```bash
set -euo pipefail
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"
case "$(printf '%s' "${TOKEN_REPORTING_READ_ONLY:-}" | tr '[:upper:]' '[:lower:]')" in
  1|true)
    echo "CodeGraph token usage heartbeat is disabled while TOKEN_REPORTING_READ_ONLY is enabled." >&2
    exit 1
    ;;
esac
if command -v codegraph >/dev/null 2>&1; then
  if [ -d .codegraph ]; then codegraph sync .; else codegraph init .; fi
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
$HOME/.codex/automations/codegraph-token-usage-heartbeat/memory.md
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
