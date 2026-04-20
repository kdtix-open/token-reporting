import {
  fetchCursorDailyUsage,
  fetchCursorFilteredUsageEvents,
  fetchCursorTeamSpend
} from "../src/providers/cursor/client";
import { persistCursorDailyUsageReport } from "../src/providers/cursor/persistence";
import type {
  CursorFilteredUsageEventsResponse,
  CursorTeamSpendResponse
} from "../src/providers/cursor/types";

async function main() {
  const apiKey = process.env.CURSOR_ADMIN_API_KEY;

  if (!apiKey) {
    throw new Error("CURSOR_ADMIN_API_KEY is required to fetch Cursor usage data.");
  }

  const report = await fetchCursorDailyUsage({ apiKey });

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
    events = await fetchCursorFilteredUsageEvents({ apiKey });
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

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : "Unknown Cursor error";

  console.error(message);
  process.exitCode = 1;
});
