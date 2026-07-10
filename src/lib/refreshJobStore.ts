import fs from "node:fs/promises";
import path from "node:path";

export interface RefreshJobStore {
  get: (jobId: string) => Promise<Record<string, unknown> | undefined>;
  set: (jobId: string, job: Record<string, unknown>) => Promise<void>;
}

export function createMemoryRefreshJobStore(): RefreshJobStore {
  const jobs = new Map<string, Record<string, unknown>>();

  return {
    async get(jobId) {
      return jobs.get(jobId);
    },
    async set(jobId, job) {
      jobs.set(jobId, job);
    }
  };
}

export function createFileRefreshJobStore(filePath: string): RefreshJobStore {
  let writeQueue = Promise.resolve();
  const enqueueWrite = (task: () => Promise<void>): Promise<void> => {
    const nextWrite = writeQueue.then(task, task);
    writeQueue = nextWrite.catch(() => undefined);
    return nextWrite;
  };

  return {
    async get(jobId) {
      const jobs = await readJobs(filePath);
      return jobs[jobId];
    },
    async set(jobId, job) {
      await enqueueWrite(async () => {
        const jobs = await readJobs(filePath);
        jobs[jobId] = job;
        await writeJobs(filePath, jobs);
      });
    }
  };
}

async function readJobs(filePath: string): Promise<Record<string, Record<string, unknown>>> {
  try {
    const parsed = JSON.parse(await fs.readFile(filePath, "utf8")) as unknown;
    if (!isRecord(parsed) || !isRecord(parsed.jobs)) return {};

    return Object.fromEntries(
      Object.entries(parsed.jobs).filter((entry): entry is [string, Record<string, unknown>] =>
        isRecord(entry[1])
      )
    );
  } catch {
    return {};
  }
}

async function writeJobs(
  filePath: string,
  jobs: Record<string, Record<string, unknown>>
): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;

  await fs.writeFile(tempPath, `${JSON.stringify({ jobs }, null, 2)}\n`, "utf8");
  await fs.rename(tempPath, filePath);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
