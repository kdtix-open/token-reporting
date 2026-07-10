# CodeGraph Token Usage Heartbeat

This heartbeat measures whether CodeGraph materially reduces token/usage pressure for repository discovery and implementation work.

The goal is to build a factual, longitudinal evidence set before making a project-to-client recommendation.

## Daily Schedule

- Cadence: daily
- Intended runner: a dedicated Codex thread, not an ad hoc implementation thread
- Workspace: `/Users/ckreager/repos/kdtix/token_reporting`
- Journal destination: `kdtix-open/token-reporting#25`
- Local memory/output directory:

```text
/Users/ckreager/.codex/automations/codegraph-token-usage-heartbeat
```

## Run Command

```bash
cd /Users/ckreager/repos/kdtix/token_reporting
node scripts/analyze-codegraph-token-usage.mjs --journal-issue kdtix-open/token-reporting#25
```

The script writes timestamped JSON and Markdown reports, refreshes `latest-*` aliases, refreshes `memory.md`, and posts the Markdown report to the backlog issue using `gh issue comment --body-file`.

## Measurement Basis

The script reads Codex JSONL session logs from:

```text
/Users/ckreager/.codex/sessions
```

It measures:

- total measured `token_count` turns
- CodeGraph-assisted turns
- shell-search/read-heavy turns
- first and last observed CodeGraph tool call timestamps
- median total tokens
- median uncached input tokens
- median billable proxy tokens
- median output and reasoning tokens

`billableProxyTokens` is:

```text
input + output
```

This is an analysis proxy, not an official invoice field. Codex reports `input_tokens` as uncached input, and `reasoning_output_tokens` is already included in `output_tokens`.

## Recommendation Guardrail

Use this heartbeat for internal monitoring immediately.

Do not make a client-facing savings claim until paired fresh-thread trials show repeatable improvement for specific task classes. A defensible claim should name:

- number of paired tasks
- task class
- median total-token delta
- median billable-proxy delta
- tool-call delta
- evidence-quality result

## Daily Thread Prompt

```text
Run the CodeGraph token usage heartbeat for token_reporting.

Use /Users/ckreager/repos/kdtix/token_reporting and load .agents/skills/codegraph-token-usage-heartbeat/SKILL.md first. Run the CodeGraph gate for that repo, then run:

node scripts/analyze-codegraph-token-usage.mjs --journal-issue kdtix-open/token-reporting#25

Journal the generated report to the backlog issue, refresh the local automation memory, and reply with a concise status: report path, journal result, measured turn count, CodeGraph-assisted turn count, median total-token delta, median billable-proxy delta, and whether the evidence remains inconclusive or is trending toward a recommendation.
```
