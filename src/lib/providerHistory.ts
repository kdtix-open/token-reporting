import path from "node:path";

import {
  addDays,
  defaultHistoricalStartDay,
  incrementalStartDay,
  readJsonIfExists,
  startOfUtcDayMs,
  startOfUtcDaySeconds
} from "./snapshotHistory";

export type HistoryProviderId = "cursor" | "claude" | "codex";

export interface FetchDayWindow {
  startDay: string;
  endDay: string;
}

export function accumulatedSnapshotPath(providerId: string): string {
  return path.join(
    process.cwd(),
    "public",
    "data",
    providerId,
    "accumulated-metadata.json"
  );
}

export async function resolveFetchDayWindow(
  providerId: HistoryProviderId,
  env: NodeJS.ProcessEnv = process.env
): Promise<FetchDayWindow> {
  const lastDay = await readLastStoredDay(providerId);
  const startDay = incrementalStartDay(lastDay, env);
  const endDay = new Date().toISOString().slice(0, 10);
  return { startDay, endDay };
}

export function cursorMsWindow(window: FetchDayWindow): {
  startDate: number;
  endDate: number;
} {
  return {
    startDate: startOfUtcDayMs(window.startDay),
    endDate: startOfUtcDayMs(addDays(window.endDay, 1))
  };
}

export function codexSecondsWindow(window: FetchDayWindow): {
  startTime: number;
  endTime: number;
} {
  return {
    startTime: startOfUtcDaySeconds(window.startDay),
    endTime: startOfUtcDaySeconds(addDays(window.endDay, 1))
  };
}

export function claudeStartingAt(window: FetchDayWindow): string {
  return `${window.startDay}T00:00:00Z`;
}

export function historicalStartDay(env: NodeJS.ProcessEnv = process.env): string {
  return defaultHistoricalStartDay(env);
}

async function readLastStoredDay(providerId: HistoryProviderId): Promise<string | null> {
  const raw = await readJsonIfExists<Record<string, unknown>>(
    accumulatedSnapshotPath(providerId)
  );
  if (!raw) return null;

  if (providerId === "cursor") {
    const daily = raw.daily as { data?: Array<{ day?: string }> } | undefined;
    return maxString(daily?.data?.map((item) => item.day).filter(isString) ?? []);
  }

  if (providerId === "claude") {
    const usage = raw.usage as { data?: Array<{ ending_at?: string }> } | undefined;
    const last = maxString(
      usage?.data?.map((bucket) => bucket.ending_at?.slice(0, 10)).filter(isString) ?? []
    );
    return last ? addDays(last, -1) : null;
  }

  const usage = raw.usage as { data?: Array<{ end_time?: number }> } | undefined;
  const lastEpoch = Math.max(
    ...(
      usage?.data
        ?.map((bucket) => bucket.end_time)
        .filter((value): value is number => typeof value === "number") ?? []
    )
  );
  if (!Number.isFinite(lastEpoch)) return null;
  return addDays(new Date(lastEpoch * 1000).toISOString().slice(0, 10), -1);
}

function maxString(values: string[]): string | null {
  return values.length > 0 ? values.sort()[values.length - 1] : null;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}
