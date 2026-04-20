import {
  cursorDailyUsageResponseSchema,
  cursorFilteredUsageEventsResponseSchema,
  cursorTeamSpendResponseSchema,
  type CursorDailyUsageResponse,
  type CursorFilteredUsageEventsResponse,
  type CursorTeamSpendResponse
} from "./types";

export interface CursorClientOptions {
  apiKey: string;
}

type FetchLike = typeof fetch;

const CURSOR_API_BASE = "https://api.cursor.com";
const WINDOW_DAYS = 28;
const EVENTS_PAGE_SIZE = 100;
const MAX_EVENTS_PAGES = 50; // hard cap to avoid runaway loops

function buildDateWindow(): { startDate: number; endDate: number } {
  const endDate = Date.now();
  const startDate = endDate - WINDOW_DAYS * 24 * 60 * 60 * 1000;
  return { startDate, endDate };
}

export function buildBasicAuthHeader(apiKey: string): string {
  return `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`;
}

async function postJson<T>(
  fetchImpl: FetchLike,
  url: string,
  apiKey: string,
  body: unknown,
  endpointLabel: string
): Promise<T> {
  const response = await fetchImpl(url, {
    method: "POST",
    headers: {
      Authorization: buildBasicAuthHeader(apiKey),
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(
      `Cursor ${endpointLabel} request failed with ${response.status} ${response.statusText}`
    );
  }

  return (await response.json()) as T;
}

export async function fetchCursorDailyUsage(
  { apiKey }: CursorClientOptions,
  fetchImpl: FetchLike = fetch
): Promise<CursorDailyUsageResponse> {
  const { startDate, endDate } = buildDateWindow();
  const payload = await postJson<unknown>(
    fetchImpl,
    `${CURSOR_API_BASE}/teams/daily-usage-data`,
    apiKey,
    { startDate, endDate },
    "daily usage"
  );
  return cursorDailyUsageResponseSchema.parse(payload);
}

/**
 * Per-member spend snapshot for the *current* subscription cycle.
 * Note: this endpoint does NOT accept a date window — it always returns
 * cycle-to-date. We surface `subscriptionCycleStart` so callers can interpret it.
 */
export async function fetchCursorTeamSpend(
  { apiKey }: CursorClientOptions,
  fetchImpl: FetchLike = fetch
): Promise<CursorTeamSpendResponse> {
  const payload = await postJson<unknown>(
    fetchImpl,
    `${CURSOR_API_BASE}/teams/spend`,
    apiKey,
    {},
    "team spend"
  );
  return cursorTeamSpendResponseSchema.parse(payload);
}

/**
 * Per-event usage feed for the 28-day window. Pages until either the API
 * reports no further pages or `MAX_EVENTS_PAGES` is reached.
 */
export async function fetchCursorFilteredUsageEvents(
  { apiKey }: CursorClientOptions,
  fetchImpl: FetchLike = fetch
): Promise<CursorFilteredUsageEventsResponse> {
  const { startDate, endDate } = buildDateWindow();
  const allEvents: CursorFilteredUsageEventsResponse["usageEvents"] = [];
  let firstPage: CursorFilteredUsageEventsResponse | null = null;
  let page = 1;

  while (page <= MAX_EVENTS_PAGES) {
    const raw = await postJson<unknown>(
      fetchImpl,
      `${CURSOR_API_BASE}/teams/filtered-usage-events`,
      apiKey,
      { startDate, endDate, page, pageSize: EVENTS_PAGE_SIZE },
      "filtered usage events"
    );
    const parsed = cursorFilteredUsageEventsResponseSchema.parse(raw);
    if (!firstPage) firstPage = parsed;
    allEvents.push(...parsed.usageEvents);

    const numPages = parsed.pagination?.numPages ?? 1;
    const hasNext = parsed.pagination?.hasNextPage ?? page < numPages;
    if (!hasNext || page >= numPages) break;
    page += 1;
  }

  // Return a merged response keeping the first-page metadata but with
  // the full concatenated event list.
  return {
    totalUsageEventsCount: firstPage?.totalUsageEventsCount ?? allEvents.length,
    pagination: firstPage?.pagination,
    usageEvents: allEvents,
    period: firstPage?.period
  };
}
