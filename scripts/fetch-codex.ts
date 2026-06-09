import { fetchCodexUsageReport, fetchCodexCostsReport } from "../src/providers/codex/client";
import {
  codexSecondsWindow,
  resolveFetchDayWindow
} from "../src/lib/providerHistory";
import { persistCodexUsageReport } from "../src/providers/codex/persistence";

async function main() {
  const apiKey = process.env.OPENAI_ADMIN_API_KEY;

  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is required to fetch OpenAI Codex usage data. " +
        "This must be an org admin API key with the api.usage.read scope."
    );
  }

  const dayWindow = await resolveFetchDayWindow("codex");
  const secondsWindow = codexSecondsWindow(dayWindow);
  console.log(`Fetching OpenAI Codex usage from ${dayWindow.startDay} through ${dayWindow.endDay}...`);

  const usage = await fetchCodexUsageReport({ apiKey, ...secondsWindow });

  let costs;
  try {
    costs = await fetchCodexCostsReport({ apiKey, ...secondsWindow });
    console.log("Fetched actual daily cost data from /v1/organization/costs");
  } catch (err) {
    console.warn("Could not fetch costs report (falling back to estimated):", err instanceof Error ? err.message : err);
  }

  const outputPath = await persistCodexUsageReport({ usage, costs });

  console.log(`Saved OpenAI Codex usage data to ${outputPath}`);
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : "Unknown OpenAI Codex error";

  console.error(message);
  process.exitCode = 1;
});
