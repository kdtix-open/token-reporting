import fs from "node:fs/promises";
import path from "node:path";

export interface ForensicRunStore {
  get: (runId: string) => Promise<Record<string, unknown> | undefined>;
  latest: () => Promise<Record<string, unknown> | undefined>;
  set: (runId: string, run: Record<string, unknown>) => Promise<void>;
}

export function createMemoryForensicRunStore(): ForensicRunStore {
  const runs = new Map<string, Record<string, unknown>>();
  let latestRunId: string | undefined;

  return {
    async get(runId) {
      return runs.get(runId);
    },
    async latest() {
      return latestRunId ? runs.get(latestRunId) : undefined;
    },
    async set(runId, run) {
      runs.set(runId, run);
      latestRunId = runId;
    }
  };
}

export function createFileForensicRunStore(filePath: string): ForensicRunStore {
  return {
    async get(runId) {
      const state = await readState(filePath);
      return state.runs[runId];
    },
    async latest() {
      const state = await readState(filePath);
      return state.latestRunId ? state.runs[state.latestRunId] : undefined;
    },
    async set(runId, run) {
      const state = await readState(filePath);
      state.runs[runId] = run;
      state.latestRunId = runId;
      await writeState(filePath, state);
    }
  };
}

interface ForensicRunState {
  latestRunId?: string;
  runs: Record<string, Record<string, unknown>>;
}

async function readState(filePath: string): Promise<ForensicRunState> {
  try {
    const parsed = JSON.parse(await fs.readFile(filePath, "utf8")) as unknown;
    if (!isRecord(parsed) || !isRecord(parsed.runs)) return { runs: {} };

    const latestRunId = typeof parsed.latestRunId === "string" ? parsed.latestRunId : undefined;
    return {
      latestRunId,
      runs: Object.fromEntries(
        Object.entries(parsed.runs).filter((entry): entry is [string, Record<string, unknown>] =>
          isRecord(entry[1])
        )
      )
    };
  } catch {
    return { runs: {} };
  }
}

async function writeState(filePath: string, state: ForensicRunState): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;

  await fs.writeFile(tempPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  await fs.rename(tempPath, filePath);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
