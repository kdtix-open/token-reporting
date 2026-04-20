import {
  fetchGitHubCopilotBillingSeats,
  fetchGitHubCopilotLatestUsersReportMetadata,
  fetchGitHubCopilotUsageFiles
} from "../src/providers/githubCopilot/client";
import { aggregateGitHubCopilotUsageRecords } from "../src/providers/githubCopilot/service";
import { persistGitHubCopilotLatestUsersReportMetadata } from "../src/providers/githubCopilot/persistence";

async function main() {
  const organization = process.env.GITHUB_ORG ?? "kdtix-open";
  const token = process.env.GITHUB_ADMIN_TOKEN;

  if (!token) {
    throw new Error("GITHUB_TOKEN is required to fetch GitHub Copilot reports.");
  }

  const report = await fetchGitHubCopilotLatestUsersReportMetadata({
    organization,
    token
  });

  console.log(
    `Downloading ${report.download_links.length} signed usage file(s) for ${organization}...`
  );

  const usageRecords = await fetchGitHubCopilotUsageFiles(report.download_links);
  const usage_summary = aggregateGitHubCopilotUsageRecords(usageRecords);

  console.log(
    `Parsed ${usageRecords.length} usage records — ${usage_summary.activeUserCount} active users, ${usage_summary.totalInteractions.toLocaleString()} interactions`
  );

  const billing_seats = await fetchGitHubCopilotBillingSeats({ organization, token });
  if (billing_seats) {
    console.log(`Billing seats: ${billing_seats.total_seats} (${billing_seats.plan})`);
  } else {
    console.warn("Warning: billing seats unavailable — token may lack 'manage_billing:copilot' scope");
  }

  const outputPath = await persistGitHubCopilotLatestUsersReportMetadata({
    organization,
    report: { ...report, usage_summary, ...(billing_seats ? { billing_seats } : {}) }
  });

  console.log(
    `Saved GitHub Copilot metadata for ${organization} to ${outputPath}`
  );
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : "Unknown GitHub Copilot error";

  console.error(message);
  process.exitCode = 1;
});
