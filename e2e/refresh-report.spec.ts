/**
 * Refresh Report button — UI tests (TDD: RED phase before implementation).
 *
 * Tests define acceptance criteria for the "Refresh Report" hero button
 * that re-fetches all provider data with cache-busting.
 */
import { test, expect } from "@playwright/test";

test.describe("Refresh Report button", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
  });

  // ── Presence & accessibility ─────────────────────────────────────────────

  test("Refresh Report button exists in the hero section", async ({ page }) => {
    const hero = page.locator(".hero");
    const btn = hero.getByRole("button", { name: /Refresh Report/i });
    await expect(btn).toBeVisible();
  });

  test("button is not disabled on initial load", async ({ page }) => {
    const btn = page.getByRole("button", { name: /Refresh Report/i });
    await expect(btn).toBeEnabled();
  });

  // ── Interaction ──────────────────────────────────────────────────────────

  test("clicking Refresh Report shows loading state", async ({ page }) => {
    // Block all data fetches using Playwright's native route interception.
    // By never calling route.continue() or route.fulfill(), the requests hang
    // indefinitely, keeping loading=true until the test page tears down.
    await page.route(/\/data\//, () => {
      /* intentionally never fulfilled — keeps setLoading(true) active */
    });

    // Use CSS class selector: stable even when button text changes from
    // "↻ Refresh Report" → "Refreshing…" (which breaks name-based locators).
    const btn = page.locator("button.hero__refresh-btn");
    await expect(btn).toBeVisible();

    await Promise.all([
      btn.click(),
      expect(btn).toBeDisabled({ timeout: 5_000 }),
    ]);
    await expect(btn).toHaveText(/Refreshing/i);
  });

  test("button re-enables after refresh completes", async ({ page }) => {
    const btn = page.getByRole("button", { name: /Refresh Report/i });
    await btn.click();

    // Wait for loading to finish
    await expect(btn).toBeEnabled({ timeout: 10_000 });
    await expect(btn).toHaveText(/Refresh Report/i);
  });

  test("last refreshed timestamp appears after clicking Refresh Report", async ({
    page,
  }) => {
    const btn = page.getByRole("button", { name: /Refresh Report/i });
    await btn.click();

    // Wait for refresh to complete
    await expect(btn).toBeEnabled({ timeout: 10_000 });

    // Timestamp should appear (format: "Updated HH:MM:SS AM/PM")
    await expect(page.getByText(/Updated \d+:\d+/i)).toBeVisible();
  });

  // ── Network behavior ─────────────────────────────────────────────────────

  test("Refresh Report sends cache-busting requests with ?t= param", async ({
    page,
  }) => {
    const cacheBustRequests: string[] = [];

    page.on("request", (req) => {
      if (req.url().includes("/data/") && req.url().includes("?t=")) {
        cacheBustRequests.push(req.url());
      }
    });

    const btn = page.getByRole("button", { name: /Refresh Report/i });
    await btn.click();
    await expect(btn).toBeEnabled({ timeout: 10_000 });

    // Should have sent cache-busted requests for all 5 providers
    expect(cacheBustRequests.length).toBeGreaterThanOrEqual(5);
    expect(cacheBustRequests.every((u) => /[?&]t=\d+/.test(u))).toBe(true);
  });

  // ── Accessibility ─────────────────────────────────────────────────────────

  test("hero section has no critical axe violations", async ({ page }, testInfo) => {
    const AxeBuilder = (await import("@axe-core/playwright")).default;
    const results = await new AxeBuilder({ page })
      .include(".hero")
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();

    await testInfo.attach("a11y-hero.json", {
      body: JSON.stringify(results.violations, null, 2),
      contentType: "application/json",
    });

    expect(results.violations).toHaveLength(0);
  });
});
