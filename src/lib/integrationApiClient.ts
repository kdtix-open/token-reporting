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

const defaultApiBaseUrl = "http://127.0.0.1:8788";
const defaultTimeoutMs = 300_000;

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
  } catch (error) {
    if (timeout.didTimeout()) {
      return {
        message: `Refresh is still running after ${formatSeconds(
          timeoutMs
        )}. Check the refresh status or try a narrower provider refresh.`,
        outcome: "failed"
      };
    }

    throw error;
  } finally {
    timeout.clear();
  }

  if (response === "timeout") {
    return timeoutResult(timeoutMs);
  }

  const body = await readJsonBody(response);

  if (response.ok) {
    return {
      job: body as ReportRefreshJob,
      outcome: "accepted"
    };
  }

  return {
    httpStatus: response.status,
    message: readMessage(body) ?? `Refresh request failed with HTTP ${response.status}.`,
    outcome: response.status === 403 ? "blocked" : "failed"
  };
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
  } catch {
    return {};
  }
}

function readMessage(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return undefined;
  const raw = (body as Record<string, unknown>).message;
  return typeof raw === "string" ? raw : undefined;
}

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
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
