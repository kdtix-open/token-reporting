import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

const capture = "2026-09-09T12:00:00.000Z";
const start = Date.parse("2026-09-08T00:00:00.000Z");
const end = Date.parse("2026-09-09T00:00:00.000Z");
const fixtureBootstrap = `
import os from "node:os";
import { syncBuiltinESMExports } from "node:module";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
const fixtureHome = process.env.TOKEN_REPORTING_TEST_HOME;
if (!fixtureHome) throw new Error("Missing isolated fixture home");
os.homedir = () => fixtureHome;
const guardSessionPath = (target) => {
  const value = String(target);
  if (!value.split(path.sep).includes(".claude")) return;
  const relative = path.relative(fixtureHome, value);
  if (relative === ".." || relative.startsWith(".." + path.sep) || path.isAbsolute(relative)) {
    throw new Error("Refusing non-fixture Claude session read");
  }
};
for (const method of ["readdir", "readFile", "stat"]) {
  const original = fsp[method].bind(fsp);
  fsp[method] = (target, ...args) => { guardSessionPath(target); return original(target, ...args); };
}
const originalExists = fs.existsSync;
fs.existsSync = (target) => { guardSessionPath(target); return originalExists(target); };
syncBuiltinESMExports();
const OriginalDate = Date;
globalThis.Date = class extends OriginalDate {
  constructor(...args) { super(...(args.length ? args : [${JSON.stringify(capture)}])); }
  static now() { return ${Date.parse(capture)}; }
};
globalThis.fetch = async (input, init) => {
  const url = new URL(input);
  const empty = { data: [], has_more: false, next_page: null };
  const expectedStart = ${Date.parse("2026-09-06T00:00:00.000Z")};
  if (url.hostname === "api.anthropic.com") {
    if (url.searchParams.get("starting_at") !== "2026-09-06T00:00:00Z") throw new Error("Wrong Claude history root");
    return Response.json({ ...empty, data: [{ starting_at: "2026-09-08T00:00:00Z", ending_at: "2026-09-09T00:00:00Z", results: [] }] });
  }
  if (url.hostname === "api.openai.com") {
    if (Number(url.searchParams.get("start_time")) !== expectedStart / 1000) throw new Error("Wrong Codex history root");
    return Response.json({ ...empty, data: [{ start_time: ${start / 1000}, end_time: ${end / 1000}, results: [] }] });
  }
  if (url.hostname === "api.cursor.com") {
    const body = JSON.parse(init.body);
    if (url.pathname.endsWith("/spend")) return Response.json({ teamMemberSpend: [] });
    if (body.startDate !== expectedStart) throw new Error("Wrong Cursor history root");
    if (url.pathname.endsWith("/daily-usage-data")) return Response.json({ data: [], period: { startDate: body.startDate, endDate: body.endDate } });
    if (url.pathname.endsWith("/filtered-usage-events")) return Response.json({ usageEvents: [] });
  }
  if (url.hostname === "api.github.com") {
    if (url.pathname.endsWith("/latest")) return Response.json({ download_links: [], report_start_day: "2026-09-01", report_end_day: "2026-09-08" });
    if (url.pathname.endsWith("/seats")) return Response.json({ total_seats: 0 });
  }
  throw new Error("Unexpected fixture upstream request");
};
`;

const histories = {
  claude: { usage: { data: [{ starting_at: "2026-09-07T00:00:00Z", ending_at: "2026-09-08T00:00:00Z", results: [] }] } },
  codex: { usage: { data: [{ start_time: Date.parse("2026-09-07T00:00:00Z") / 1000, end_time: start / 1000, results: [] }] } },
  cursor: { daily: { data: [{ userId: "fixture-user", day: "2026-09-07", date: start - 86400000 }], period: { startDate: start - 86400000, endDate: start } } }
};
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))); });

describe("actual provider CLI configured-root wiring", () => {
  it.each([
    { id: "claude", script: "fetch-claude.ts", history: histories.claude },
    { id: "codex", script: "fetch-codex.ts", history: histories.codex },
    { id: "cursor", script: "fetch-cursor.ts", history: histories.cursor },
    { id: "github-copilot", script: "fetch-github-copilot.ts", history: null },
    { id: "claude-code", script: "fetch-claude-code.ts", history: null }
  ])("$id / actualCli_SeparateCodeAndDataRoots_PersistsToServedRoot", async ({ id, script, history }) => {
    const repoRoot = process.cwd();
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "token-reporting-provider-cli-test-"));
    roots.push(root);
    const codeRoot = path.join(root, "deploy-code");
    const dataRoot = path.join(root, "served-data");
    const fixtureHome = path.join(root, "isolated-session-source");
    await fs.mkdir(codeRoot);
    const sessions = path.join(fixtureHome, ".claude", "projects", "fixture-project");
    await fs.mkdir(sessions, { recursive: true });
    await fs.writeFile(path.join(sessions, "fixture.jsonl"), JSON.stringify({
      sessionId: "fixture-session", timestamp: "2026-09-08T12:00:00Z",
      message: { model: "fixture-model", usage: { input_tokens: 1, output_tokens: 1 } }
    }));
    if (history) {
      await fs.mkdir(path.join(dataRoot, id), { recursive: true });
      await fs.writeFile(path.join(dataRoot, id, "accumulated-metadata.json"), JSON.stringify(history));
    }
    const result = await promisify(execFile)(process.execPath, [
      "--import", path.join(repoRoot, "node_modules", "tsx", "dist", "loader.mjs"),
      "--import", `data:text/javascript,${encodeURIComponent(fixtureBootstrap)}`,
      path.join(repoRoot, "scripts", script)
    ], { cwd: codeRoot, env: {
      PATH: process.env.PATH, TOKEN_REPORTING_DATA_ROOT: dataRoot, TOKEN_REPORTING_TEST_HOME: fixtureHome,
      ANTHROPIC_ADMIN_API_KEY: "fixture-only", OPENAI_ADMIN_API_KEY: "fixture-only",
      CURSOR_ADMIN_API_KEY: "fixture-only", TOKEN_REPORTING_CURSOR_REDACTION_SALT: "fixture-only",
      GITHUB_ADMIN_TOKEN: "fixture-only", GITHUB_ORG: "fixture-org"
    } });
    expect(result.stderr).not.toMatch(/Wrong .* history root|Unexpected fixture/);
    for (const filename of ["latest-metadata.json", "accumulated-metadata.json"]) {
      const saved = JSON.parse(await fs.readFile(path.join(dataRoot, id, filename), "utf8"));
      expect(saved.generatedAt).toBe(capture);
    }
    expect(await fs.readdir(codeRoot)).toEqual([]);
  });
});
