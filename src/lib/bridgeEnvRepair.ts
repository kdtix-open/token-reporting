export interface BridgeEnvRepairOptions {
  adminEnvText: string;
  bridgeEnvText: string;
  bridgeUrl: string;
  timeoutMs: number;
  workingDirectory: string;
}

export interface BridgeEnvRepairResult {
  redactedSummary: {
    bridgeToken: "[REDACTED]";
    bridgeUrl: string;
    changed: boolean;
    timeoutMs: number;
    workingDirectory: string;
    writtenKeys: string[];
  };
  updatedAdminEnvText: string;
}

const bridgeTokenKey = "SDLCA_LOCAL_EXECUTION_BRIDGE_TOKEN";

const tokenReportingBridgeKeys = [
  "TOKEN_REPORTING_SDLCA_BRIDGE_URL",
  "TOKEN_REPORTING_SDLCA_BRIDGE_TOKEN",
  "TOKEN_REPORTING_SDLCA_BRIDGE_WORKING_DIRECTORY",
  "TOKEN_REPORTING_SDLCA_BRIDGE_TIMEOUT_MS"
] as const;

type TokenReportingBridgeKey = (typeof tokenReportingBridgeKeys)[number];

export function buildBridgeEnvRepair(options: BridgeEnvRepairOptions): BridgeEnvRepairResult {
  const bridgeToken = readDotenvKey(options.bridgeEnvText, bridgeTokenKey)?.trim();
  if (!bridgeToken) {
    throw new Error(`${bridgeTokenKey} was not found in the SDLCA bridge env file.`);
  }

  const desired: Record<TokenReportingBridgeKey, string> = {
    TOKEN_REPORTING_SDLCA_BRIDGE_TIMEOUT_MS: String(options.timeoutMs),
    TOKEN_REPORTING_SDLCA_BRIDGE_TOKEN: bridgeToken,
    TOKEN_REPORTING_SDLCA_BRIDGE_URL: options.bridgeUrl,
    TOKEN_REPORTING_SDLCA_BRIDGE_WORKING_DIRECTORY: options.workingDirectory
  };

  const updatedAdminEnvText = writeDotenvKeys(options.adminEnvText, desired);

  return {
    redactedSummary: {
      bridgeToken: "[REDACTED]",
      bridgeUrl: options.bridgeUrl,
      changed: updatedAdminEnvText !== options.adminEnvText,
      timeoutMs: options.timeoutMs,
      workingDirectory: options.workingDirectory,
      writtenKeys: [...tokenReportingBridgeKeys]
    },
    updatedAdminEnvText
  };
}

export function readDotenvKey(text: string, key: string): string | undefined {
  for (const line of text.split(/\r?\n/u)) {
    const parsed = parseDotenvLine(line);
    if (parsed?.key === key) return parsed.value;
  }

  return undefined;
}

function writeDotenvKeys(text: string, values: Record<TokenReportingBridgeKey, string>): string {
  const seen = new Set<string>();
  const lines = text.split(/\r?\n/u);
  const output = lines.map((line) => {
    const parsed = parseDotenvLine(line);
    if (!parsed || !isTokenReportingBridgeKey(parsed.key)) return line;

    seen.add(parsed.key);
    return `${parsed.key}=${escapeDotenvValue(values[parsed.key])}`;
  });

  const missingLines = tokenReportingBridgeKeys
    .filter((key) => !seen.has(key))
    .map((key) => `${key}=${escapeDotenvValue(values[key])}`);

  const trimmedOutput = output.join("\n").replace(/\n*$/u, "");
  return `${trimmedOutput}${trimmedOutput ? "\n" : ""}${missingLines.join("\n")}\n`;
}

function parseDotenvLine(line: string): { key: string; value: string } | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;

  const withoutExport = trimmed.startsWith("export ") ? trimmed.slice(7).trim() : trimmed;
  const equalsIndex = withoutExport.indexOf("=");
  if (equalsIndex <= 0) return null;

  const key = withoutExport.slice(0, equalsIndex).trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(key)) return null;

  return {
    key,
    value: stripQuotes(withoutExport.slice(equalsIndex + 1).trim())
  };
}

function stripQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function escapeDotenvValue(value: string): string {
  return /^[A-Za-z0-9_./:-]+$/u.test(value) ? value : JSON.stringify(value);
}

function isTokenReportingBridgeKey(key: string): key is TokenReportingBridgeKey {
  return tokenReportingBridgeKeys.includes(key as TokenReportingBridgeKey);
}
