import {
  claudeUsageReportSchema,
  claudeCostsReportSchema,
  type ClaudeUsageReport,
  type ClaudeCostsReport
} from "./types";

export interface ClaudeClientOptions {
  apiKey: string;
}

type FetchLike = typeof fetch;

const ANTHROPIC_API_BASE = "https://api.anthropic.com";
const WINDOW_DAYS = 28;
/** Safety guard for pagination (Anthropic returns 7-day pages). */
const MAX_PAGES = 50;

function buildStartingAt(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - WINDOW_DAYS);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString().replace(".000Z", "Z");
}

function decodeNextPage(cursor: string): string {
  const base64 = cursor.startsWith("page_") ? cursor.slice(5) : cursor;
  return Buffer.from(base64, "base64").toString("utf8");
}

async function fetchJson<T>(
  url: URL,
  apiKey: string,
  fetchImpl: FetchLike,
  parse: (raw: unknown) => T,
  errorLabel: string
): Promise<T> {
  const response = await fetchImpl(url, {
    method: "GET",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    }
  });
  if (!response.ok) {
    throw new Error(
      `${errorLabel} request failed with ${response.status} ${response.statusText}`
    );
  }
  return parse(await response.json());
}

function buildUsageUrl(startingAt: string): URL {
  const url = new URL(
    `${ANTHROPIC_API_BASE}/v1/organizations/usage_report/messages`
  );
  url.searchParams.set("starting_at", startingAt);
  // Enriched dimensions — gives per-model, per-tier, per-context-window breakdown.
  url.searchParams.append("group_by[]", "model");
  url.searchParams.append("group_by[]", "service_tier");
  url.searchParams.append("group_by[]", "context_window");
  url.searchParams.append("group_by[]", "workspace_id");
  return url;
}

function buildCostsUrl(startingAt: string): URL {
  const url = new URL(`${ANTHROPIC_API_BASE}/v1/organizations/cost_report`);
  url.searchParams.set("starting_at", startingAt);
  url.searchParams.append("group_by[]", "description");
  url.searchParams.append("group_by[]", "workspace_id");
  return url;
}

export async function fetchClaudeUsageReport(
  { apiKey }: ClaudeClientOptions,
  fetchImpl: FetchLike = fetch
): Promise<ClaudeUsageReport> {
  let page = await fetchJson(
    buildUsageUrl(buildStartingAt()),
    apiKey,
    fetchImpl,
    (raw) => claudeUsageReportSchema.parse(raw),
    "Claude usage report"
  );
  const allBuckets = [...page.data];
  let pageCount = 1;

  while (page.has_more && page.next_page && pageCount < MAX_PAGES) {
    const nextStartingAt = decodeNextPage(page.next_page);
    page = await fetchJson(
      buildUsageUrl(nextStartingAt),
      apiKey,
      fetchImpl,
      (raw) => claudeUsageReportSchema.parse(raw),
      "Claude usage report"
    );
    allBuckets.push(...page.data);
    pageCount += 1;
  }

  return { data: allBuckets, has_more: false, next_page: null };
}

export async function fetchClaudeCostsReport(
  { apiKey }: ClaudeClientOptions,
  fetchImpl: FetchLike = fetch
): Promise<ClaudeCostsReport> {
  let page = await fetchJson(
    buildCostsUrl(buildStartingAt()),
    apiKey,
    fetchImpl,
    (raw) => claudeCostsReportSchema.parse(raw),
    "Claude cost report"
  );
  const allBuckets = [...page.data];
  let pageCount = 1;

  while (page.has_more && page.next_page && pageCount < MAX_PAGES) {
    const nextStartingAt = decodeNextPage(page.next_page);
    page = await fetchJson(
      buildCostsUrl(nextStartingAt),
      apiKey,
      fetchImpl,
      (raw) => claudeCostsReportSchema.parse(raw),
      "Claude cost report"
    );
    allBuckets.push(...page.data);
    pageCount += 1;
  }

  return { data: allBuckets, has_more: false, next_page: null };
}
