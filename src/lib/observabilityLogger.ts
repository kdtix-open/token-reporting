import fs from "node:fs";
import path from "node:path";

export type LogLevelName = "error" | "info" | "debug" | "trace";

export interface ObservabilityLogger {
  debug(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>, error?: unknown): void;
  info(message: string, context?: Record<string, unknown>): void;
  trace(message: string, context?: Record<string, unknown>): void;
  withContext(context: Record<string, unknown>): ObservabilityLogger;
}

export interface ObservabilityLoggerConfig {
  debug: number;
  logRoot?: string;
  now?: () => Date;
  serviceName: string;
  stderr?: (line: string) => void;
  stdout?: (line: string) => void;
  verbose: number;
}

export interface ResolveLoggingConfigOptions {
  argv?: string[];
  env?: NodeJS.ProcessEnv;
  logRoot?: string;
  serviceName: string;
}

interface LogEvent {
  context?: Record<string, unknown>;
  error?: Record<string, unknown>;
  level: LogLevelName;
  message: string;
  service: string;
  timestamp: string;
}

const severityByLevel: Record<LogLevelName, number> = {
  debug: 2,
  error: 0,
  info: 1,
  trace: 3
};

const sensitiveKeyPattern =
  /(?:api[_-]?key|authorization|bearer|credential|password|secret|token)/i;

export function resolveLoggingConfig(
  options: ResolveLoggingConfigOptions
): ObservabilityLoggerConfig {
  const argv = options.argv ?? process.argv;
  const env = options.env ?? process.env;
  const cliVerbose = readCliNumericFlag(argv, "--verbose");
  const cliDebug = readCliNumericFlag(argv, "--debug");
  const rawVerbose = cliVerbose ?? readEnvNumericValue(env.VERBOSE) ?? 1;
  const rawDebug = cliDebug ?? readEnvNumericValue(env.DEBUG) ?? 0;
  const debug = clampLogLevel(rawDebug);
  const verbose = debug > 0 ? Math.max(clampLogLevel(rawVerbose), 2) : clampLogLevel(rawVerbose);

  return {
    debug,
    logRoot: options.logRoot ?? env.TOKEN_REPORTING_LOG_ROOT,
    serviceName: options.serviceName,
    verbose
  };
}

export function createObservabilityLogger(
  config: ObservabilityLoggerConfig
): ObservabilityLogger {
  const now = config.now ?? (() => new Date());
  const logRoot = path.resolve(config.logRoot ?? "logs");
  const stdout = config.stdout ?? ((line: string) => process.stdout.write(`${line}\n`));
  const stderr = config.stderr ?? ((line: string) => process.stderr.write(`${line}\n`));

  fs.mkdirSync(logRoot, { recursive: true });

  return createLogger({
    baseContext: {},
    config,
    logRoot,
    now,
    stderr,
    stdout
  });
}

function createLogger(args: {
  baseContext: Record<string, unknown>;
  config: ObservabilityLoggerConfig;
  logRoot: string;
  now: () => Date;
  stderr: (line: string) => void;
  stdout: (line: string) => void;
}): ObservabilityLogger {
  const write = (
    level: LogLevelName,
    message: string,
    context?: Record<string, unknown>,
    error?: unknown
  ): void => {
    if (!shouldEmit(level, args.config)) return;

    const timestamp = args.now().toISOString();
    const event: LogEvent = {
      level,
      message,
      service: args.config.serviceName,
      timestamp
    };
    const mergedContext = {
      ...args.baseContext,
      ...(context ?? {})
    };
    if (Object.keys(mergedContext).length > 0) {
      event.context = redactLogValue(mergedContext) as Record<string, unknown>;
    }
    if (error !== undefined) {
      event.error = normalizeError(error);
    }

    const line = JSON.stringify(event);
    writeLogFiles(args.config, args.logRoot, timestamp, level, line);
    if (level === "error") {
      args.stderr(line);
      return;
    }
    args.stdout(line);
  };

  return {
    debug: (message, context) => write("debug", message, context),
    error: (message, context, error) => write("error", message, context, error),
    info: (message, context) => write("info", message, context),
    trace: (message, context) => write("trace", message, context),
    withContext: (context) =>
      createLogger({
        ...args,
        baseContext: {
          ...args.baseContext,
          ...context
        }
      })
  };
}

function shouldEmit(level: LogLevelName, config: ObservabilityLoggerConfig): boolean {
  return severityByLevel[level] <= effectiveLogLevel(config);
}

function effectiveLogLevel(config: ObservabilityLoggerConfig): number {
  if (config.verbose >= 3 || config.debug >= 3) return 3;
  if (config.verbose >= 2 || config.debug > 0) return 2;
  return clampLogLevel(config.verbose);
}

function writeLogFiles(
  config: ObservabilityLoggerConfig,
  logRoot: string,
  timestamp: string,
  level: LogLevelName,
  line: string
): void {
  const date = timestamp.slice(0, 10);
  const serviceName = sanitizeServiceName(config.serviceName);
  const severity = severityByLevel[level];

  if (severity <= Math.min(config.verbose, 1)) {
    appendLine(path.join(logRoot, `${serviceName}-${date}.log`), line);
  }
  if (config.debug >= 1 && severity <= 2) {
    appendLine(path.join(logRoot, `${serviceName}-debug-${date}.log`), line);
  }
  if ((config.verbose >= 3 || config.debug >= 3) && severity <= 3) {
    appendLine(path.join(logRoot, `${serviceName}-trace-${date}.log`), line);
  }
}

function appendLine(filePath: string, line: string): void {
  fs.appendFileSync(filePath, `${line}\n`, "utf8");
}

function normalizeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return redactLogValue({
      message: error.message,
      name: error.name,
      stack: error.stack
    }) as Record<string, unknown>;
  }

  return redactLogValue({ message: String(error) }) as Record<string, unknown>;
}

export function redactLogValue(value: unknown): unknown {
  return redact(value, 0, new WeakSet<object>());
}

function redact(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (typeof value === "string") return truncateString(value);
  if (typeof value !== "object" || value === null) return value;
  if (seen.has(value)) return "[Circular]";
  if (depth >= 8) return "[Truncated]";

  seen.add(value);
  if (Array.isArray(value)) {
    return value.slice(0, 100).map((item) => redact(item, depth + 1, seen));
  }

  const output: Record<string, unknown> = {};
  for (const [key, childValue] of Object.entries(value)) {
    output[key] = sensitiveKeyPattern.test(key) ? "[REDACTED]" : redact(childValue, depth + 1, seen);
  }

  return output;
}

function truncateString(value: string): string {
  if (value.length <= 2_000) return value;
  return `${value.slice(0, 2_000)}...[truncated:${value.length}]`;
}

function readCliNumericFlag(argv: string[], flag: string): number | undefined {
  const inline = argv.find((entry) => entry.startsWith(`${flag}=`));
  if (inline) return readNumericValue(inline.slice(flag.length + 1));

  const index = argv.indexOf(flag);
  if (index === -1) return undefined;

  return readNumericValue(argv[index + 1]);
}

function readEnvNumericValue(value: string | undefined): number | undefined {
  return readNumericValue(value);
}

function readNumericValue(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function clampLogLevel(value: number): number {
  return Math.max(0, Math.min(3, value));
}

function sanitizeServiceName(serviceName: string): string {
  return serviceName.toLowerCase().replace(/[^a-z0-9-]+/g, "-");
}
