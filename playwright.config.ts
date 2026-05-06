import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  retries: 1,
  fullyParallel: true,
  reporter: [["list"], ["html", { open: "never" }]],

  use: {
    baseURL: "http://localhost:5173",
    screenshot: "only-on-failure",
    trace: "on-first-retry",
  },

  expect: {
    toHaveScreenshot: { maxDiffPixels: 100 },
  },

  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],

  // Assumes `npm run dev` is already running. For standalone:
  // webServer: { command: "npm run dev", url: "http://localhost:5173", reuseExistingServer: true },
});
