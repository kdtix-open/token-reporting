import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

const tokenReportingBasePath = normalizeBasePath(process.env.TOKEN_REPORTING_BASE_PATH ?? "/");
const apiProxyTarget =
  process.env.TOKEN_REPORTING_INTEGRATION_API_PROXY ?? "http://127.0.0.1:8788";

export default defineConfig({
  base: tokenReportingBasePath === "" ? "/" : `${tokenReportingBasePath}/`,
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        changeOrigin: true,
        target: apiProxyTarget
      }
    }
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    exclude: ["node_modules", "e2e/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/main.tsx"]
    }
  }
});

function normalizeBasePath(value: string): string {
  const trimmed = value.trim();
  if (trimmed === "" || trimmed === "/") return "";
  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withLeadingSlash.replace(/\/+$/u, "");
}
