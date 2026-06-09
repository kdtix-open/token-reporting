import { readFile } from "node:fs/promises";
import path from "node:path";

export function accumulatedPathForLatest(latestPath: string): string {
  return path.join(path.dirname(latestPath), "accumulated-metadata.json");
}

export async function readJsonIfExists<T>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as T;
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      return null;
    }
    throw error;
  }
}

export function mergeByKey<T>(
  existing: readonly T[],
  incoming: readonly T[],
  keyFor: (value: T) => string
): T[] {
  const byKey = new Map<string, T>();
  for (const value of existing) byKey.set(keyFor(value), value);
  for (const value of incoming) byKey.set(keyFor(value), value);
  return Array.from(byKey.values());
}

export function isoDayFromEpochMs(epochMs: number): string {
  return new Date(epochMs).toISOString().slice(0, 10);
}

export function startOfUtcDayMs(day: string): number {
  return Date.parse(`${day}T00:00:00.000Z`);
}

export function startOfUtcDaySeconds(day: string): number {
  return Math.floor(startOfUtcDayMs(day) / 1000);
}

export function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function defaultHistoricalStartDay(env: NodeJS.ProcessEnv = process.env): string {
  if (env.TOKEN_REPORTING_HISTORICAL_START) {
    return env.TOKEN_REPORTING_HISTORICAL_START;
  }

  const days = Number(env.TOKEN_REPORTING_LOOKBACK_DAYS ?? 365);
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - (Number.isFinite(days) ? days : 365));
  start.setUTCHours(0, 0, 0, 0);
  return start.toISOString().slice(0, 10);
}

export function incrementalStartDay(
  lastStoredDay: string | null,
  env: NodeJS.ProcessEnv = process.env
): string {
  if (env.TOKEN_REPORTING_FETCH_MODE === "historical") {
    return defaultHistoricalStartDay(env);
  }
  if (lastStoredDay) {
    return addDays(lastStoredDay, -1);
  }
  return defaultHistoricalStartDay({
    ...env,
    TOKEN_REPORTING_LOOKBACK_DAYS: env.TOKEN_REPORTING_LOOKBACK_DAYS ?? "28"
  });
}
