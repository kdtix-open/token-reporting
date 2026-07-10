import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { assertWritableOperationAllowed } from "../../lib/permissions";
import {
  accumulatedPathForLatest,
  mergeByKey,
  readJsonIfExists
} from "../../lib/snapshotHistory";
import type {
  CursorDailyUsageResponse,
  CursorFilteredUsageEventsResponse,
  CursorSnapshot,
  CursorTeamSpendResponse
} from "./types";

interface PersistReportArgs {
  /** Daily usage response (legacy) — wrapped under `daily` in the new snapshot. */
  report: CursorDailyUsageResponse;
  /** Optional per-member spend snapshot. */
  spend?: CursorTeamSpendResponse;
  /** Optional per-event usage feed. */
  events?: CursorFilteredUsageEventsResponse;
  outputPath?: string;
  env?: NodeJS.ProcessEnv;
}

export async function persistCursorDailyUsageReport({
  report,
  spend,
  events,
  outputPath = path.join(
    process.cwd(),
    "public",
    "data",
    "cursor",
    "latest-metadata.json"
  ),
  env = process.env
}: PersistReportArgs): Promise<string> {
  assertWritableOperationAllowed("Persisting Cursor usage data", env);

  const snapshot: CursorSnapshot = {
    generatedAt: new Date().toISOString(),
    daily: report
  };
  if (spend) snapshot.spend = spend;
  if (events) snapshot.events = events;
  const redactedSnapshot = redactCursorSnapshot(snapshot);

  const accumulatedPath = accumulatedPathForLatest(outputPath);
  const existing = await readJsonIfExists<typeof snapshot>(accumulatedPath);
  const accumulated = existing
    ? mergeCursorSnapshots(redactCursorSnapshot(existing), redactedSnapshot)
    : redactedSnapshot;

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(redactedSnapshot, null, 2)}\n`, "utf8");
  await writeFile(accumulatedPath, `${JSON.stringify(accumulated, null, 2)}\n`, "utf8");
  return outputPath;
}

function redactCursorSnapshot(snapshot: CursorSnapshot): CursorSnapshot {
  return {
    ...snapshot,
    daily: {
      ...snapshot.daily,
      data: snapshot.daily.data.map((item) => ({
        ...item,
        email: redactCursorEmail(item.email),
        userId: redactCursorUserId(item.userId)
      }))
    },
    ...(snapshot.spend
      ? {
          spend: {
            ...snapshot.spend,
            teamMemberSpend: snapshot.spend.teamMemberSpend.map((item) => ({
              ...item,
              email: redactCursorEmail(item.email),
              name: redactCursorName(item.name),
              userId: redactCursorUserId(item.userId)
            }))
          }
        }
      : {}),
    ...(snapshot.events
      ? {
          events: {
            ...snapshot.events,
            usageEvents: snapshot.events.usageEvents.map((event) => ({
              ...event,
              userEmail: redactCursorEmail(event.userEmail)
            }))
          }
        }
      : {})
  };
}

function redactCursorUserId(value: string): string {
  return `user_redacted_${stableCursorHash(value)}`;
}

function redactCursorEmail(value: string): string;
function redactCursorEmail(value: null): null;
function redactCursorEmail(value: undefined): undefined;
function redactCursorEmail(value: string | undefined): string | undefined;
function redactCursorEmail(value: string | null | undefined): string | null | undefined;
function redactCursorEmail(value: string | null | undefined): string | null | undefined {
  if (value === null || value === undefined) return value;
  return `redacted-${stableCursorHash(value)}@redacted.local`;
}

function redactCursorName(value: string | undefined): string | undefined {
  if (value === undefined) return value;
  return `Redacted user ${stableCursorHash(value)}`;
}

function stableCursorHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function mergeCursorSnapshots<T extends {
  daily: CursorDailyUsageResponse;
  spend?: CursorTeamSpendResponse;
  events?: CursorFilteredUsageEventsResponse;
}>(existing: T, incoming: T): T {
  const dailyData = mergeByKey(
    existing.daily.data,
    incoming.daily.data,
    (item) => `${item.userId}:${item.day}`
  ).sort((a, b) => a.day.localeCompare(b.day) || a.userId.localeCompare(b.userId));

  const existingEvents = existing.events?.usageEvents ?? [];
  const incomingEvents = incoming.events?.usageEvents ?? [];
  const usageEvents = mergeByKey(
    existingEvents,
    incomingEvents,
    (event) =>
      [
        event.timestamp,
        event.userEmail ?? "",
        event.model ?? "",
        event.kind ?? "",
        event.requestsCosts,
        event.chargedCents
      ].join(":")
  ).sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));

  const period = {
    startDate: Math.min(existing.daily.period.startDate, incoming.daily.period.startDate),
    endDate: Math.max(existing.daily.period.endDate, incoming.daily.period.endDate)
  };

  const eventPeriod =
    existing.events?.period || incoming.events?.period
      ? {
          startDate: Math.min(
            existing.events?.period?.startDate ?? incoming.events?.period?.startDate ?? period.startDate,
            incoming.events?.period?.startDate ?? existing.events?.period?.startDate ?? period.startDate
          ),
          endDate: Math.max(
            existing.events?.period?.endDate ?? incoming.events?.period?.endDate ?? period.endDate,
            incoming.events?.period?.endDate ?? existing.events?.period?.endDate ?? period.endDate
          )
        }
      : undefined;

  return {
    ...incoming,
    daily: { data: dailyData, period },
    ...(incoming.spend ?? existing.spend ? { spend: incoming.spend ?? existing.spend } : {}),
    ...(usageEvents.length > 0
      ? {
          events: {
            ...(incoming.events ?? existing.events),
            totalUsageEventsCount: usageEvents.length,
            usageEvents,
            ...(eventPeriod ? { period: eventPeriod } : {})
          }
        }
      : {})
  } as T;
}
