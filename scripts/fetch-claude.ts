import {
  fetchClaudeUsageReport,
  fetchClaudeCostsReport
} from "../src/providers/claude/client";
import {
  claudeStartingAt,
  resolveFetchDayWindow
} from "../src/lib/providerHistory";
import { persistClaudeUsageReport } from "../src/providers/claude/persistence";
import type { ClaudeCostsReport } from "../src/providers/claude/types";

async function main() {
  const apiKey = process.env.ANTHROPIC_ADMIN_API_KEY;

  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_ADMIN_API_KEY is required to fetch Claude usage data. " +
        "This must be an Admin API key (sk-ant-admin...)."
    );
  }

  const dayWindow = await resolveFetchDayWindow("claude");
  const startingAt = claudeStartingAt(dayWindow);
  console.log(`Fetching Claude usage from ${dayWindow.startDay} through ${dayWindow.endDay}...`);

  const report = await fetchClaudeUsageReport({ apiKey, startingAt });

  let costs: ClaudeCostsReport | undefined;
  try {
    costs = await fetchClaudeCostsReport({ apiKey, startingAt });
    console.log("Fetched actual cost data from /v1/organizations/cost_report");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`Costs fetch failed (${msg}); proceeding with usage only.`);
  }

  const outputPath = await persistClaudeUsageReport({ report, costs });

  console.log(`Saved Claude usage data to ${outputPath}`);
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : "Unknown Claude error";

  console.error(message);
  process.exitCode = 1;
});
