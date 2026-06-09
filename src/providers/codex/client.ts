import {
  codexUsageReportSchema,
  codexCostsReportSchema,
  codexSnapshotSchema,
  type CodexUsageReport,
  type CodexCostsReport
} from "./types";

export interface CodexClientOptions {
  apiKey: string;
  startTime?: number;
  endTime?: number;
}

type FetchLike = typeof fetch;

const OPENAI_API_BASE = "https://api.openai.com";
const WINDOW_DAYS = 28;
/** Max page size the API allows for `bucket_width=1d` is 31. */
const PAGE_LIMIT = 31;
/** Safety guard for pagination loops (covers >2 years of daily buckets). */
const MAX_PAGES = 50;

function buildTimeWindow(options: Pick<CodexClientOptions, "startTime" | "endTime"> = {}): { startTime: number; endTime: number } {
  const nowSec = Math.floor(Date.now() / 1000);
  return {
    startTime: options.startTime ?? nowSec - WINDOW_DAYS * 24 * 60 * 60,
    endTime: options.endTime ?? nowSec
  };
}

async function fetchAllPages<T extends { data: unknown[]; has_more: boolean; next_page: string | null }>(
  initialUrl: URL,
  apiKey: string,
  fetchImpl: FetchLike,
  parse: (payload: unknown) => T,
  errorLabel: string
): Promise<T> {
  const aggregated: { data: unknown[]; has_more: boolean; next_page: string | null } = {
    data: [],
    has_more: false,
    next_page: null
  };

  let nextUrl: URL | null = initialUrl;
  let pages = 0;
  while (nextUrl && pages < MAX_PAGES) {
    const response = await fetchImpl(nextUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      }
    });
    if (!response.ok) {
      throw new Error(
        `${errorLabel} request failed with ${response.status} ${response.statusText}`
      );
    }
    const parsed = parse(await response.json());
    aggregated.data.push(...parsed.data);
    aggregated.has_more = parsed.has_more;
    aggregated.next_page = parsed.next_page;
    pages += 1;
    if (!parsed.has_more || !parsed.next_page) break;
    nextUrl = nextPageUrl(nextUrl, parsed.next_page);
  }

  return parse(aggregated);
}

function nextPageUrl(currentUrl: URL, nextPage: string): URL {
  try {
    return new URL(nextPage);
  } catch {
    const url = new URL(currentUrl.toString());
    url.searchParams.set("page", nextPage);
    return url;
  }
}

export async function fetchCodexUsageReport(
  { apiKey, startTime, endTime }: CodexClientOptions,
  fetchImpl: FetchLike = fetch
): Promise<CodexUsageReport> {
  const window = buildTimeWindow({ startTime, endTime });

  const url = new URL(`${OPENAI_API_BASE}/v1/organization/usage/completions`);
  url.searchParams.set("start_time", String(window.startTime));
  url.searchParams.set("end_time", String(window.endTime));
  url.searchParams.set("bucket_width", "1d");
  url.searchParams.set("limit", String(PAGE_LIMIT));
  // group_by enables per-model + per-project breakdown in `results[]`.
  url.searchParams.append("group_by", "model");
  url.searchParams.append("group_by", "project_id");

  return fetchAllPages(
    url,
    apiKey,
    fetchImpl,
    (payload) => codexUsageReportSchema.parse(payload),
    "OpenAI Codex usage report"
  );
}

export async function fetchCodexCostsReport(
  { apiKey, startTime, endTime }: CodexClientOptions,
  fetchImpl: FetchLike = fetch
): Promise<CodexCostsReport> {
  const window = buildTimeWindow({ startTime, endTime });

  const url = new URL(`${OPENAI_API_BASE}/v1/organization/costs`);
  url.searchParams.set("start_time", String(window.startTime));
  url.searchParams.set("end_time", String(window.endTime));
  url.searchParams.set("bucket_width", "1d");
  url.searchParams.set("limit", String(PAGE_LIMIT));
  // line_item exposes per-model, per-tier cost components.
  url.searchParams.append("group_by", "line_item");
  url.searchParams.append("group_by", "project_id");

  return fetchAllPages(
    url,
    apiKey,
    fetchImpl,
    (payload) => codexCostsReportSchema.parse(payload),
    "OpenAI Codex costs report"
  );
}

export { codexSnapshotSchema };
