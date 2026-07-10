import { createHmac } from "node:crypto";
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
  const redactionSalt = cursorRedactionSalt(env);
  const redactedSnapshot = redactCursorSnapshot(snapshot, redactionSalt);

  const accumulatedPath = accumulatedPathForLatest(outputPath);
  const existing = await readJsonIfExists<typeof snapshot>(accumulatedPath);
  const accumulated = existing
    ? mergeCursorSnapshots(redactCursorSnapshot(existing, redactionSalt), redactedSnapshot)
    : redactedSnapshot;

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(redactedSnapshot, null, 2)}\n`, "utf8");
  await writeFile(accumulatedPath, `${JSON.stringify(accumulated, null, 2)}\n`, "utf8");
  return outputPath;
}

function redactCursorSnapshot(snapshot: CursorSnapshot, redactionSalt: string): CursorSnapshot {
  return {
    ...snapshot,
    daily: {
      ...snapshot.daily,
      data: snapshot.daily.data.map((item) => ({
        ...item,
        email: redactCursorEmail(item.email, redactionSalt),
        userId: redactCursorUserId(item.userId, redactionSalt)
      }))
    },
    ...(snapshot.spend
      ? {
          spend: {
            ...snapshot.spend,
            teamMemberSpend: snapshot.spend.teamMemberSpend.map((item) => ({
              ...item,
              email: redactCursorEmail(item.email, redactionSalt),
              name: redactCursorName(item.name, redactionSalt),
              userId: redactCursorUserId(item.userId, redactionSalt)
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
              userEmail: redactCursorEmail(event.userEmail, redactionSalt)
            }))
          }
        }
      : {})
  };
}

function cursorRedactionSalt(env: NodeJS.ProcessEnv): string {
  const salt =
    env.TOKEN_REPORTING_CURSOR_REDACTION_SALT ??
    env.TOKEN_REPORTING_REDACTION_SALT ??
    env.CURSOR_ADMIN_API_KEY;
  if (!salt) {
    throw new Error(
      "TOKEN_REPORTING_CURSOR_REDACTION_SALT or CURSOR_ADMIN_API_KEY is required to persist redacted Cursor identity fields."
    );
  }
  return salt;
}

function redactCursorUserId(value: string, redactionSalt: string): string {
  if (/^user_redacted_(?:hmac_[a-f0-9]{16}|[a-f0-9]{12})$/u.test(value)) return value;
  return `user_redacted_hmac_${stableCursorHash(value, redactionSalt)}`;
}

function redactCursorEmail(value: string, redactionSalt: string): string;
function redactCursorEmail(value: null, redactionSalt: string): null;
function redactCursorEmail(value: undefined, redactionSalt: string): undefined;
function redactCursorEmail(value: string | undefined, redactionSalt: string): string | undefined;
function redactCursorEmail(value: string | null | undefined, redactionSalt: string): string | null | undefined;
function redactCursorEmail(value: string | null | undefined, redactionSalt: string): string | null | undefined {
  if (value === null || value === undefined) return value;
  if (/^redacted-(?:hmac_[a-f0-9]{16}|[a-f0-9]{12})@redacted\.local$/u.test(value)) {
    return value;
  }
  return `redacted-hmac_${stableCursorHash(value, redactionSalt)}@redacted.local`;
}

function redactCursorName(value: string | undefined, redactionSalt: string): string | undefined {
  if (value === undefined) return value;
  if (/^Redacted user (?:hmac_[a-f0-9]{16}|[a-f0-9]{12})$/u.test(value)) return value;
  return `Redacted user hmac_${stableCursorHash(value, redactionSalt)}`;
}

function stableCursorHash(value: string, redactionSalt: string): string {
  return createHmac("sha256", redactionSalt)
    .update("cursor-identity-redaction-v1")
    .update("\0")
    .update(value)
    .digest("hex")
    .slice(0, 16);
}

function mergeCursorSnapshots<T extends {
  daily: CursorDailyUsageResponse;
  spend?: CursorTeamSpendResponse;
  events?: CursorFilteredUsageEventsResponse;
}>(existing: T, incoming: T): T {
  if (shouldResetCursorAccumulatedHistoryForRedactionMigration(existing, incoming)) {
    return incoming;
  }

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

function shouldResetCursorAccumulatedHistoryForRedactionMigration(
  existing: Pick<CursorSnapshot, "daily" | "events">,
  incoming: Pick<CursorSnapshot, "daily" | "events">
): boolean {
  return hasLegacyCursorAlias(existing) && hasHmacCursorAlias(incoming);
}

function hasLegacyCursorAlias(snapshot: Pick<CursorSnapshot, "daily" | "events">): boolean {
  return (
    snapshot.daily.data.some((item) => /^user_redacted_[a-f0-9]{12}$/u.test(item.userId)) ||
    (snapshot.events?.usageEvents ?? []).some((event) =>
      /^redacted-[a-f0-9]{12}@redacted\.local$/u.test(event.userEmail ?? "")
    )
  );
}

function hasHmacCursorAlias(snapshot: Pick<CursorSnapshot, "daily" | "events">): boolean {
  return (
    snapshot.daily.data.some((item) => /^user_redacted_hmac_[a-f0-9]{16}$/u.test(item.userId)) ||
    (snapshot.events?.usageEvents ?? []).some((event) =>
      /^redacted-hmac_[a-f0-9]{16}@redacted\.local$/u.test(event.userEmail ?? "")
    )
  );
}
