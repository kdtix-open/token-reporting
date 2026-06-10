export interface RuntimeApiBaseUrlOptions {
  basePath?: string;
  configuredApiBaseUrl?: string;
  origin?: string;
}

export function normalizePublicBasePath(value = ""): string {
  const trimmed = value.trim();
  if (trimmed === "" || trimmed === "/") return "";

  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withLeadingSlash.replace(/\/+$/u, "");
}

export function resolveRuntimeAssetPath(relativePath: string, basePath = ""): string {
  const normalizedBasePath = normalizePublicBasePath(basePath);
  const normalizedRelativePath = relativePath.replace(/^\/+/u, "");
  return `${normalizedBasePath}/${normalizedRelativePath}`;
}

export function resolveRuntimeApiBaseUrl(options: RuntimeApiBaseUrlOptions = {}): string {
  const configuredApiBaseUrl = options.configuredApiBaseUrl?.trim();
  if (configuredApiBaseUrl) return trimTrailingSlash(configuredApiBaseUrl);

  const origin = options.origin?.trim();
  if (!origin) return "http://127.0.0.1:8788";

  return `${trimTrailingSlash(origin)}${normalizePublicBasePath(options.basePath)}`;
}

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}
