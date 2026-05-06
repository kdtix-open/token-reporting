/**
 * API-level tests: verify all provider JSON data files are served correctly.
 * TDD: these tests should pass as long as the dev server is running and data files exist.
 */
import { test, expect } from "@playwright/test";

const DATA_FILES = [
  { provider: "claude",         path: "/data/claude/latest-metadata.json" },
  { provider: "claude-code",    path: "/data/claude-code/latest-metadata.json" },
  { provider: "github-copilot", path: "/data/github-copilot/latest-metadata.json" },
  { provider: "cursor",         path: "/data/cursor/latest-metadata.json" },
  { provider: "codex",          path: "/data/codex/latest-metadata.json" },
];

for (const { provider, path } of DATA_FILES) {
  test(`GET ${path} → 200 with valid JSON`, async ({ request }) => {
    const res = await request.get(path);
    expect(res.status(), `${provider} data file not found`).toBe(200);

    const contentType = res.headers()["content-type"] ?? "";
    expect(contentType, "response should be JSON").toContain("application/json");

    const body = await res.json();
    expect(body, "response body should be an object").toBeTruthy();
    expect(typeof body, "response body should be an object").toBe("object");
  });
}

test("claude-code data file has token data in dailyBuckets", async ({ request }) => {
  const res = await request.get("/data/claude-code/latest-metadata.json");
  const body = await res.json();

  expect(body).toHaveProperty("dailyBuckets");
  expect(Array.isArray(body.dailyBuckets)).toBe(true);
  expect(body.dailyBuckets.length).toBeGreaterThan(0);

  const bucket = body.dailyBuckets[0];
  expect(bucket).toHaveProperty("inputTokens");
  expect(typeof bucket.inputTokens).toBe("number");
});

test("github copilot data has CLI token fields in usage_summary", async ({ request }) => {
  const res = await request.get("/data/github-copilot/latest-metadata.json");
  const body = await res.json();

  expect(body).toHaveProperty("usage_summary");
  expect(body.usage_summary).toHaveProperty("totalCliInputTokens");
  expect(body.usage_summary).toHaveProperty("totalCliOutputTokens");
  expect(typeof body.usage_summary.totalCliInputTokens).toBe("number");
});
