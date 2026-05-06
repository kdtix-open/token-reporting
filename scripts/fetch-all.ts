/**
 * Orchestrates all provider data-fetch scripts in parallel.
 *
 * Usage:
 *   source .env.admin.credentials && npm run report:all
 */
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

interface Script {
  name: string;
  cmd: string;
  requiredEnv: string | null;
}

const SCRIPTS: Script[] = [
  { name: "Claude (Anthropic)",  cmd: "tsx scripts/fetch-claude.ts",           requiredEnv: "ANTHROPIC_ADMIN_API_KEY" },
  { name: "Claude Code",         cmd: "tsx scripts/fetch-claude-code.ts",      requiredEnv: null },
  { name: "GitHub Copilot",      cmd: "tsx scripts/fetch-github-copilot.ts",   requiredEnv: "GITHUB_ADMIN_TOKEN" },
  { name: "Cursor",              cmd: "tsx scripts/fetch-cursor.ts",           requiredEnv: "CURSOR_ADMIN_API_KEY" },
  { name: "OpenAI Codex",        cmd: "tsx scripts/fetch-codex.ts",            requiredEnv: "OPENAI_ADMIN_API_KEY" },
  { name: "Local Sessions",      cmd: "tsx scripts/analyze-local-sessions.ts", requiredEnv: null },
];

interface ScriptResult {
  name: string;
  ok: boolean;
  skipped: boolean;
}

async function runScript(script: Script): Promise<ScriptResult> {
  if (script.requiredEnv && !process.env[script.requiredEnv]) {
    console.warn(`⚠  Skipping ${script.name}: ${script.requiredEnv} not set`);
    return { name: script.name, ok: false, skipped: true };
  }

  try {
    const { stdout, stderr } = await execAsync(script.cmd);
    const out = (stdout + stderr).trim();
    const preview = out.split("\n").slice(0, 3).join("\n   ");
    console.log(`✓  ${script.name}\n   ${preview}`);
    return { name: script.name, ok: true, skipped: false };
  } catch (err: unknown) {
    const e = err as { stderr?: string; message?: string };
    const msg = (e.stderr ?? e.message ?? String(err)).trim();
    console.error(`✗  ${script.name}\n   ${msg.split("\n").slice(0, 3).join("\n   ")}`);
    return { name: script.name, ok: false, skipped: false };
  }
}

async function main(): Promise<void> {
  console.log("▶  Fetching all provider data in parallel…\n");
  const results = await Promise.all(SCRIPTS.map(runScript));

  const succeeded = results.filter((r) => r.ok);
  const failed    = results.filter((r) => !r.ok && !r.skipped);
  const skipped   = results.filter((r) => r.skipped);

  console.log("\n── Summary ──────────────────────────────────────────");
  console.log(`   ✓ ${succeeded.length} succeeded: ${succeeded.map((r) => r.name).join(", ") || "none"}`);
  if (skipped.length)
    console.log(`   ⚠ ${skipped.length} skipped:   ${skipped.map((r) => r.name).join(", ")}`);
  if (failed.length)
    console.log(`   ✗ ${failed.length} failed:    ${failed.map((r) => r.name).join(", ")}`);
  console.log("─────────────────────────────────────────────────────");

  if (failed.length > 0) process.exit(1);
}

void main();
