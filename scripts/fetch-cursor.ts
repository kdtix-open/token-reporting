import {
  fetchCursorDailyUsage,
  fetchCursorFilteredUsageEvents,
  fetchCursorTeamSpend
} from "../src/providers/cursor/client";
import {
  cursorMsWindow,
  resolveFetchDayWindow
} from "../src/lib/providerHistory";
import { mergeByKey } from "../src/lib/snapshotHistory";
import { persistCursorDailyUsageReport } from "../src/providers/cursor/persistence";
import type {
  CursorDailyUsageResponse,
  CursorFilteredUsageEventsResponse,
  CursorTeamSpendResponse
} from "../src/providers/cursor/types";

const CURSOR_MAX_DAILY_RANGE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

async function main() {
  const apiKey = process.env.CURSOR_ADMIN_API_KEY;

  if (!apiKey) {
    throw new Error("CURSOR_ADMIN_API_KEY is required to fetch Cursor usage data.");
  }

  const dayWindow = await resolveFetchDayWindow("cursor");
  const msWindow = cursorMsWindow(dayWindow);
  console.log(`Fetching Cursor usage from ${dayWindow.startDay} through ${dayWindow.endDay}...`);

  const report = await fetchCursorDailyUsageInChunks(apiKey, msWindow);

  // Enriched data — best-effort; tolerate failure so daily usage still persists.
  let spend: CursorTeamSpendResponse | undefined;
  try {
    spend = await fetchCursorTeamSpend({ apiKey });
    console.log(
      `Fetched team spend (${spend.teamMemberSpend.length} member${spend.teamMemberSpend.length === 1 ? "" : "s"})`
    );
  } catch (e) {
    console.warn(
      `Skipped /teams/spend: ${e instanceof Error ? e.message : "unknown error"}`
    );
  }

  let events: CursorFilteredUsageEventsResponse | undefined;
  try {
    events = await fetchCursorFilteredUsageEvents({ apiKey, ...msWindow });
    console.log(
      `Fetched ${events.usageEvents.length} usage event${events.usageEvents.length === 1 ? "" : "s"} from /teams/filtered-usage-events`
    );
  } catch (e) {
    console.warn(
      `Skipped /teams/filtered-usage-events: ${e instanceof Error ? e.message : "unknown error"}`
    );
  }

  const outputPath = await persistCursorDailyUsageReport({ report, spend, events });

  console.log(`Saved Cursor usage data to ${outputPath}`);
}

async function fetchCursorDailyUsageInChunks(
  apiKey: string,
  window: { startDate: number; endDate: number }
): Promise<CursorDailyUsageResponse> {
  const reports: CursorDailyUsageResponse[] = [];
  let startDate = window.startDate;

  while (startDate < window.endDate) {
    const endDate = Math.min(
      window.endDate,
      startDate + CURSOR_MAX_DAILY_RANGE_DAYS * DAY_MS
    );
    try {
      reports.push(await fetchCursorDailyUsage({ apiKey, startDate, endDate }));
    } catch (error) {
      const start = new Date(startDate).toISOString().slice(0, 10);
      const end = new Date(endDate).toISOString().slice(0, 10);
      console.warn(
        `Skipped Cursor daily usage chunk ${start} → ${end}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
    startDate = endDate;
  }

  const data = mergeByKey(
    [],
    reports.flatMap((report) => report.data),
    (item) => `${item.userId}:${item.day}`
  ).sort((a, b) => a.day.localeCompare(b.day) || a.userId.localeCompare(b.userId));

  return {
    data,
    period: {
      startDate: window.startDate,
      endDate: window.endDate
    }
  };
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : "Unknown Cursor error";

  console.error(message);
  process.exitCode = 1;
});
