import {
  gitHubCopilotLatestUsersReportSchema,
  githubCopilotUsageRecordSchema,
  type GitHubCopilotLatestUsersReport,
  type GitHubCopilotUsageRecord
} from "./types";

export const GITHUB_API_VERSION = "2026-03-10";

export interface GitHubCopilotRequest {
  url: URL;
  init: RequestInit & {
    headers: Record<string, string>;
  };
}

export interface GitHubCopilotClientOptions {
  organization: string;
  token: string;
}

type FetchLike = typeof fetch;

export function buildGitHubCopilotLatestUsersReportRequest({
  organization,
  token
}: GitHubCopilotClientOptions): GitHubCopilotRequest {
  return {
    url: new URL(
      `https://api.github.com/orgs/${organization}/copilot/metrics/reports/users-28-day/latest`
    ),
    init: {
      method: "GET",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": GITHUB_API_VERSION
      }
    }
  };
}

export async function fetchGitHubCopilotLatestUsersReportMetadata(
  options: GitHubCopilotClientOptions,
  fetchImpl: FetchLike = fetch
): Promise<GitHubCopilotLatestUsersReport> {
  const request = buildGitHubCopilotLatestUsersReportRequest(options);
  const response = await fetchImpl(request.url, request.init);

  if (!response.ok) {
    throw new Error(
      `GitHub Copilot report request failed with ${response.status} ${response.statusText}`
    );
  }

  const payload = await response.json();
  return gitHubCopilotLatestUsersReportSchema.parse(payload);
}

/**
 * Fetches the number of billed Copilot seats for the organization.
 * Returns null if the endpoint is unavailable or the token lacks permission.
 */
export async function fetchGitHubCopilotBillingSeats(
  { organization, token }: GitHubCopilotClientOptions,
  fetchImpl: FetchLike = fetch
): Promise<{ total_seats: number; plan: "business" | "enterprise" } | null> {
  const url = new URL(
    `https://api.github.com/orgs/${organization}/copilot/billing/seats`
  );

  const response = await fetchImpl(url, {
    method: "GET",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": GITHUB_API_VERSION
    }
  });

  if (!response.ok) {
    return null;
  }

  const payload = await response.json();
  const total = typeof payload.total_seats === "number" ? payload.total_seats : 0;
  return { total_seats: total, plan: "business" };
}

/**
 * Parses a newline-delimited JSON (NDJSON) string from a GitHub Copilot
 * signed usage file into an array of typed usage records. Blank lines are
 * ignored so trailing newlines do not produce parse errors.
 */
export function parseGitHubCopilotNdjson(text: string): GitHubCopilotUsageRecord[] {
  return text
    .split("\n")
    .filter(line => line.trim().length > 0)
    .map(line => githubCopilotUsageRecordSchema.parse(JSON.parse(line)));
}

/**
 * Downloads each signed URL from a GitHub Copilot usage report and returns
 * the concatenated list of per-user per-day usage records. The signed URLs
 * are pre-authenticated and require no additional headers.
 */
export async function fetchGitHubCopilotUsageFiles(
  downloadLinks: string[],
  fetchImpl: FetchLike = fetch
): Promise<GitHubCopilotUsageRecord[]> {
  const allRecords: GitHubCopilotUsageRecord[] = [];

  for (const link of downloadLinks) {
    const response = await fetchImpl(link);

    if (!response.ok) {
      throw new Error(
        `GitHub Copilot usage file download failed with ${response.status} ${response.statusText}: ${link}`
      );
    }

    const text = await response.text();
    allRecords.push(...parseGitHubCopilotNdjson(text));
  }

  return allRecords;
}
