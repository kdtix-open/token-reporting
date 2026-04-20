#!/usr/bin/env -S npx tsx
/**
 * Analyze locally-cached provider sessions to extract real per-turn token
 * distributions, augmenting the cloud admin-API data which only exposes
 * window aggregates (Codex) or no request count at all (Claude).
 *
 * Sources scanned (all read-only):
 *   ~/.codex/archived_sessions/rollout-*.jsonl
 *     → event_msg.token_count events with last_token_usage{input,output,reasoning,cached}
 *       and model_context_window per turn
 *   ~/.claude/projects/<proj>/<sid>.jsonl
 *     → per-message usage{input_tokens, cache_creation_input_tokens,
 *       cache_read_input_tokens, output_tokens}
 *
 * Output: public/data/local-sessions/distribution.json
 *
 * Honours TOKEN_REPORTING_READ_ONLY — exits before writing if true.
 */
import { readdir, readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

interface PerTurnSample {
  /** input + cacheRead + output + reasoning  — the full prompt+response footprint */
  totalTokens: number;
  /** Just input + cacheRead — what counts against context window. */
  contextTokens: number;
  /** Observed model_context_window, when reported by the runtime. */
  observedContextWindow: number | null;
  model: string | null;
  source: "codex" | "claude";
}

interface ProviderDistribution {
  source: "codex" | "claude";
  sampleCount: number;
  /** Per-turn context tokens — the relevant value for sizing local model windows. */
  contextTokens: { mean: number; p50: number; p95: number; p99: number; max: number };
  /** Per-turn total compute (input+cacheRead+output+reasoning). */
  totalTokens: { mean: number; p50: number; p95: number; p99: number; max: number };
  /** Distinct observed model_context_window values, descending. */
  observedContextWindows: number[];
  /** Distinct models seen, sorted. */
  modelsSeen: string[];
}

interface LocalSessionDistributionReport {
  generatedAt: string;
  sources: ProviderDistribution[];
  /** Combined p95/p99 across all providers — used to size the on-prem context window. */
  combined: ProviderDistribution["contextTokens"] & { sampleCount: number };
}

function pct(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

function summarize(values: number[]): {
  mean: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
} {
  if (values.length === 0) return { mean: 0, p50: 0, p95: 0, p99: 0, max: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return {
    mean,
    p50: pct(sorted, 50),
    p95: pct(sorted, 95),
    p99: pct(sorted, 99),
    max: sorted[sorted.length - 1]
  };
}

async function readJsonlLines(path: string): Promise<unknown[]> {
  try {
    const raw = await readFile(path, "utf8");
    const out: unknown[] = [];
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        out.push(JSON.parse(trimmed));
      } catch {
        // skip malformed line
      }
    }
    return out;
  } catch {
    return [];
  }
}

// ── Codex archived_sessions ───────────────────────────────────────────────

interface CodexTokenCount {
  input_tokens?: number;
  cached_input_tokens?: number;
  output_tokens?: number;
  reasoning_output_tokens?: number;
}

async function scanCodex(samples: PerTurnSample[]): Promise<void> {
  const dir = join(homedir(), ".codex", "archived_sessions");
  if (!existsSync(dir)) return;
  const files = (await readdir(dir)).filter((f) => f.endsWith(".jsonl"));
  for (const f of files) {
    const lines = await readJsonlLines(join(dir, f));
    let model: string | null = null;
    let lastTotal = 0; // tracks cumulative to derive per-turn delta
    for (const entry of lines) {
      const e = entry as Record<string, unknown>;
      if (e.type === "session_meta") {
        const payload = e.payload as Record<string, unknown> | undefined;
        const m = payload?.["model"];
        if (typeof m === "string") model = m;
      }
      if (e.type !== "event_msg") continue;
      const payload = e.payload as Record<string, unknown> | undefined;
      if (!payload || payload["type"] !== "token_count") continue;
      const info = payload["info"] as Record<string, unknown> | undefined;
      if (!info) continue;
      const last = info["last_token_usage"] as CodexTokenCount | undefined;
      const total = info["total_token_usage"] as CodexTokenCount | undefined;
      const usage = last ?? total;
      if (!usage) continue;
      const ctx =
        (usage.input_tokens ?? 0) + (usage.cached_input_tokens ?? 0);
      const totalTok =
        ctx + (usage.output_tokens ?? 0) + (usage.reasoning_output_tokens ?? 0);
      // Skip degenerate zeros
      if (totalTok <= 0) continue;
      const window = info["model_context_window"];
      // Codex's last_token_usage is per-turn already; total is cumulative.
      // Prefer last; fall back to delta from total when last missing.
      let contextTokens = ctx;
      let totalTokens = totalTok;
      if (!last && total) {
        const delta = totalTok - lastTotal;
        if (delta > 0) {
          totalTokens = delta;
          contextTokens = Math.round(delta * (ctx / Math.max(totalTok, 1)));
        }
        lastTotal = totalTok;
      }
      samples.push({
        totalTokens,
        contextTokens,
        observedContextWindow: typeof window === "number" ? window : null,
        model,
        source: "codex"
      });
    }
  }
}

// ── Claude project sessions ───────────────────────────────────────────────

interface ClaudeUsage {
  input_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  output_tokens?: number;
}

async function scanClaude(samples: PerTurnSample[]): Promise<void> {
  const root = join(homedir(), ".claude", "projects");
  if (!existsSync(root)) return;
  const projects = await readdir(root);
  for (const proj of projects) {
    const projPath = join(root, proj);
    let entries: string[];
    try {
      const s = await stat(projPath);
      if (!s.isDirectory()) continue;
      entries = await readdir(projPath);
    } catch {
      continue;
    }
    for (const f of entries.filter((x) => x.endsWith(".jsonl"))) {
      const lines = await readJsonlLines(join(projPath, f));
      for (const entry of lines) {
        const e = entry as Record<string, unknown>;
        // Per-message usage lives on assistant/message entries.
        const msg = (e["message"] as Record<string, unknown> | undefined) ?? e;
        const usage = msg?.["usage"] as ClaudeUsage | undefined;
        if (!usage) continue;
        const input = usage.input_tokens ?? 0;
        const cacheRead = usage.cache_read_input_tokens ?? 0;
        const cacheCreate = usage.cache_creation_input_tokens ?? 0;
        const output = usage.output_tokens ?? 0;
        const contextTokens = input + cacheRead + cacheCreate;
        const totalTokens = contextTokens + output;
        if (totalTokens <= 0) continue;
        const model =
          typeof msg?.["model"] === "string" ? (msg["model"] as string) : null;
        samples.push({
          totalTokens,
          contextTokens,
          observedContextWindow: null,
          model,
          source: "claude"
        });
      }
    }
  }
}

// ── Aggregation ───────────────────────────────────────────────────────────

function aggregate(samples: PerTurnSample[]): LocalSessionDistributionReport {
  const bySource = new Map<"codex" | "claude", PerTurnSample[]>();
  for (const s of samples) {
    if (!bySource.has(s.source)) bySource.set(s.source, []);
    bySource.get(s.source)!.push(s);
  }

  const sources: ProviderDistribution[] = [];
  for (const [source, ss] of bySource) {
    const ctx = ss.map((s) => s.contextTokens);
    const tot = ss.map((s) => s.totalTokens);
    const windows = [
      ...new Set(
        ss.map((s) => s.observedContextWindow).filter((w): w is number => w !== null)
      )
    ].sort((a, b) => b - a);
    const models = [
      ...new Set(ss.map((s) => s.model).filter((m): m is string => m !== null))
    ].sort();
    sources.push({
      source,
      sampleCount: ss.length,
      contextTokens: summarize(ctx),
      totalTokens: summarize(tot),
      observedContextWindows: windows,
      modelsSeen: models
    });
  }

  const allCtx = samples.map((s) => s.contextTokens);
  return {
    generatedAt: new Date().toISOString(),
    sources,
    combined: { ...summarize(allCtx), sampleCount: samples.length }
  };
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  if (process.env.TOKEN_REPORTING_READ_ONLY === "true") {
    console.log("[local-sessions] read-only mode set, skipping write");
    return;
  }

  const samples: PerTurnSample[] = [];
  await scanCodex(samples);
  await scanClaude(samples);

  if (samples.length === 0) {
    console.warn("[local-sessions] no samples found in ~/.codex or ~/.claude");
    return;
  }

  const report = aggregate(samples);
  const outDir = join(process.cwd(), "public", "data", "local-sessions");
  await mkdir(outDir, { recursive: true });
  await writeFile(
    join(outDir, "distribution.json"),
    JSON.stringify(report, null, 2),
    "utf8"
  );

  console.log(
    `[local-sessions] wrote ${samples.length} samples (${report.sources
      .map((s) => `${s.source}=${s.sampleCount}`)
      .join(", ")}) → public/data/local-sessions/distribution.json`
  );
  console.log(
    `[local-sessions] context tokens p95=${report.combined.p95.toLocaleString()}, p99=${report.combined.p99.toLocaleString()}, max=${report.combined.max.toLocaleString()}`
  );
}

main().catch((err) => {
  console.error("[local-sessions] failed:", err);
  process.exit(1);
});
