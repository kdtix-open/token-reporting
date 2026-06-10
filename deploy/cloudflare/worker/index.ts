interface Env {
  ASSETS: Fetcher;
  TOKEN_REPORTING_PUBLIC_BASE_PATH?: string;
}

const contractVersion = "sdlca-token-reporting-cloudflare-native-v0.1";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const basePath = normalizeBasePath(env.TOKEN_REPORTING_PUBLIC_BASE_PATH ?? "");
    const path = stripBasePath(url.pathname, basePath);

    if (path === "/healthz") {
      return json({
        basePath,
        mode: "cloudflare-native-read-only",
        status: "ok"
      });
    }

    if (path === "/api/integration/contract") {
      return json({
        capabilities: ["static-assets", "read-only-contract"],
        contractVersion,
        mode: "cloudflare-native-read-only",
        serviceId: "kdtix.token-reporting"
      });
    }

    if (path.startsWith("/api/")) {
      return json(
        {
          code: "cloudflare_native_refresh_not_enabled",
          message:
            "Cloudflare-native Token Reporting is read-only until stateful refresh and bridge execution are moved to approved Cloudflare bindings."
        },
        503
      );
    }

    return env.ASSETS.fetch(request);
  }
};

function stripBasePath(pathname: string, basePath: string): string {
  if (!basePath) return pathname;
  if (pathname === basePath) return "/";
  return pathname.startsWith(`${basePath}/`) ? pathname.slice(basePath.length) : pathname;
}

function normalizeBasePath(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "/") return "";
  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withLeadingSlash.replace(/\/+$/u, "");
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8"
    },
    status
  });
}
