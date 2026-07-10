export type ReportRefreshMode = "historical" | "incremental";

export interface ReportRefreshJob {
  jobId: string;
  status: string;
  [key: string]: unknown;
}

export type ReportRefreshResult =
  | {
      job: ReportRefreshJob;
      outcome: "accepted";
    }
  | {
      httpStatus?: number;
      message: string;
      outcome: "blocked" | "failed";
    };

export interface RequestReportRefreshOptions {
  apiBaseUrl?: string;
  defaultApiBaseUrl?: string;
  fetcher?: typeof fetch;
  includeForensicModelProfiles?: boolean;
  includeHuggingFaceRefresh?: boolean;
  mode?: ReportRefreshMode;
  providers?: string[];
  timeoutMs?: number;
}

export interface PollReportRefreshJobOptions {
  apiBaseUrl?: string;
  defaultApiBaseUrl?: string;
  fetcher?: typeof fetch;
  intervalMs?: number;
  onUpdate?: (job: ReportRefreshJob) => void;
  timeoutMs?: number;
}

const defaultApiBaseUrl = "http://127.0.0.1:8788";
const defaultTimeoutMs = 1_200_000;
const defaultPollIntervalMs = 3_000;

export async function requestReportRefresh(
  options: RequestReportRefreshOptions = {}
): Promise<ReportRefreshResult> {
  const apiBaseUrl = trimTrailingSlash(
    options.apiBaseUrl ?? options.defaultApiBaseUrl ?? defaultApiBaseUrl
  );
  const fetcher = options.fetcher ?? fetch;
  const timeoutMs = options.timeoutMs ?? defaultTimeoutMs;
  const timeout = createTimeoutController(timeoutMs);

  let response: Response | "timeout";
  let body: unknown | "timeout";
  try {
    response = await Promise.race([
      fetcher(`${apiBaseUrl}/api/refresh`, {
        body: JSON.stringify(refreshRequestBody(options)),
        headers: {
          "Content-Type": "application/json"
        },
        method: "POST",
        signal: timeout.signal
      }),
      timeout.promise
    ]);
    body = response === "timeout" ? "timeout" : await readJsonBodyWithTimeout(response, timeout);
  } catch (error) {
    if (timeout.didTimeout() || isAbortError(error)) return timeoutResult(timeoutMs);

    throw error;
  } finally {
    timeout.clear();
  }

  if (response === "timeout") {
    return timeoutResult(timeoutMs);
  }

  if (body === "timeout") {
    return timeoutResult(timeoutMs);
  }

  if (response.ok) {
    const job = parseRefreshJob(body);
    if (!job) {
      return {
        httpStatus: response.status,
        message: "Refresh request returned a malformed job payload.",
        outcome: "failed"
      };
    }
    return {
      job,
      outcome: "accepted"
    };
  }

  return {
    httpStatus: response.status,
    message: readMessage(body) ?? `Refresh request failed with HTTP ${response.status}.`,
    outcome: response.status === 403 ? "blocked" : "failed"
  };
}

export async function pollReportRefreshJob(
  jobId: string,
  options: PollReportRefreshJobOptions = {}
): Promise<ReportRefreshResult> {
  const apiBaseUrl = trimTrailingSlash(
    options.apiBaseUrl ?? options.defaultApiBaseUrl ?? defaultApiBaseUrl
  );
  const fetcher = options.fetcher ?? fetch;
  const timeoutMs = options.timeoutMs ?? defaultTimeoutMs;
  const intervalMs = Math.max(0, options.intervalMs ?? defaultPollIntervalMs);
  const startedAt = Date.now();

  while (true) {
    const requestTimeoutMs = remainingTimeoutMs(startedAt, timeoutMs);
    if (requestTimeoutMs <= 0) break;

    const timeout = createTimeoutController(Math.min(30_000, requestTimeoutMs));
    let response: Response | "timeout";
    let body: unknown | "timeout";
    try {
      response = await Promise.race([
        fetcher(`${apiBaseUrl}/api/refresh/${encodeURIComponent(jobId)}`, {
          method: "GET",
          signal: timeout.signal
        }),
        timeout.promise
      ]);
      body = response === "timeout" ? "timeout" : await readJsonBodyWithTimeout(response, timeout);
    } catch (error) {
      if (timeout.didTimeout() || isAbortError(error) || isTransientPollingError(error)) {
        response = "timeout";
        body = "timeout";
      } else {
        throw error;
      }
    } finally {
      timeout.clear();
    }

    if (response === "timeout" || body === "timeout") {
      const remainingMs = remainingTimeoutMs(startedAt, timeoutMs);
      if (remainingMs <= 0) break;
      await delay(Math.min(intervalMs, remainingMs));
      continue;
    }

    if (!response.ok) {
      return {
        httpStatus: response.status,
        message: readMessage(body) ?? `Refresh status request failed with HTTP ${response.status}.`,
        outcome: response.status === 403 ? "blocked" : "failed"
      };
    }

    const job = parseReportRefreshJob(body, jobId);
    if (!job) {
      return {
        httpStatus: response.status,
        message: refreshJobParseFailureMessage(body, jobId),
        outcome: "failed"
      };
    }
    options.onUpdate?.(job);
    if (isTerminalRefreshStatus(job.status)) {
      return {
        job,
        outcome: "accepted"
      };
    }

    const remainingMs = remainingTimeoutMs(startedAt, timeoutMs);
    if (remainingMs > 0) {
      await delay(Math.min(intervalMs, remainingMs));
    }
  }

  return timeoutResult(timeoutMs);
}

function refreshRequestBody(options: RequestReportRefreshOptions): Record<string, unknown> {
  return {
    includeForensicModelProfiles: options.includeForensicModelProfiles ?? true,
    includeHuggingFaceRefresh: options.includeHuggingFaceRefresh ?? true,
    mode: options.mode ?? "incremental",
    ...(options.providers ? { providers: options.providers } : {})
  };
}

async function readJsonBody(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch (error) {
    if (isAbortError(error)) throw error;
    return {};
  }
}

function readJsonBodyWithTimeout(
  response: Response,
  timeout: { promise: Promise<"timeout"> }
): Promise<unknown | "timeout"> {
  return Promise.race([readJsonBody(response), timeout.promise]);
}

function readMessage(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return undefined;
  const raw = (body as Record<string, unknown>).message;
  return typeof raw === "string" ? raw : undefined;
}

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function isTerminalRefreshStatus(status: string): boolean {
  return status === "completed" || status === "degraded" || status === "failed";
}

function parseRefreshJob(body: unknown): ReportRefreshJob | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
  const record = body as Record<string, unknown>;
  if (typeof record.jobId !== "string") return null;
  if (!isKnownRefreshStatus(record.status)) return null;
  return record as ReportRefreshJob;
}

function parseReportRefreshJob(body: unknown, expectedJobId: string): ReportRefreshJob | null {
  const record = parseRefreshJob(body);
  if (!record) return null;
  if (record.jobId !== expectedJobId) return null;
  return record;
}

function refreshJobParseFailureMessage(body: unknown, expectedJobId: string): string {
  if (typeof body === "object" && body !== null && !Array.isArray(body)) {
    const record = body as Record<string, unknown>;
    if (
      typeof record.jobId === "string" &&
      record.jobId !== expectedJobId &&
      isKnownRefreshStatus(record.status)
    ) {
      return "Refresh status response was invalid or did not match the requested job.";
    }
  }

  return "Refresh status request returned a malformed job payload.";
}

function isKnownRefreshStatus(status: unknown): status is string {
  return typeof status === "string" && (status === "running" || isTerminalRefreshStatus(status));
}

function isTransientPollingError(error: unknown): boolean {
  return error instanceof TypeError;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : error instanceof Error && error.name === "AbortError";
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function remainingTimeoutMs(startedAt: number, timeoutMs: number): number {
  return Math.max(0, timeoutMs - (Date.now() - startedAt));
}

function createTimeoutController(timeoutMs: number): {
  clear: () => void;
  didTimeout: () => boolean;
  promise: Promise<"timeout">;
  signal: AbortSignal;
} {
  const controller = new AbortController();
  let timedOut = false;
  let timeoutId: ReturnType<typeof setTimeout>;
  const promise = new Promise<"timeout">((resolve) => {
    timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
      resolve("timeout");
    }, timeoutMs);
  });

  return {
    clear: () => clearTimeout(timeoutId),
    didTimeout: () => timedOut,
    promise,
    signal: controller.signal
  };
}

function formatSeconds(timeoutMs: number): string {
  const seconds = timeoutMs / 1000;
  return `${seconds.toFixed(seconds < 10 ? 1 : 0)} seconds`;
}

function timeoutResult(timeoutMs: number): ReportRefreshResult {
  return {
    message: `Refresh is still running after ${formatSeconds(
      timeoutMs
    )}. Check the refresh status or try a narrower provider refresh.`,
    outcome: "failed"
  };
}
