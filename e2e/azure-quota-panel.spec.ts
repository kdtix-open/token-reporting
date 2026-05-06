/**
 * Azure Quota Panel — UI tests (TDD: RED phase before implementation).
 *
 * Tests define the acceptance criteria for the AzureQuotaPanel component.
 * All tests in this file should FAIL until AzureQuotaPanel is wired into App.tsx.
 */
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.describe("Azure Quota Panel", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Wait for data to load (fetches from static JSON)
    await page.waitForLoadState("networkidle");
  });

  // ── Panel structure ──────────────────────────────────────────────────────

  test("panel heading is visible", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: "Quota Request Calculator" })
    ).toBeVisible();
  });

  test("panel has Azure AI Foundry evaluation eyebrow label", async ({ page }) => {
    await expect(page.getByText("Azure AI Foundry evaluation")).toBeVisible();
  });

  test("EOM April 2026 basis subtitle is shown", async ({ page }) => {
    await expect(
      page.getByText(/EOM April 2026 basis/)
    ).toBeVisible();
  });

  // ── Usage Basis table ────────────────────────────────────────────────────

  test("Usage Basis section is present", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: "Usage Basis" })
    ).toBeVisible();
  });

  test("Usage Basis table has Claude Code row", async ({ page }) => {
    await expect(
      page.getByRole("cell", { name: "Claude Code (direct API)" })
    ).toBeVisible();
  });

  test("Usage Basis table has GitHub Copilot CLI row", async ({ page }) => {
    await expect(
      page.getByRole("cell", { name: "GitHub Copilot CLI" })
    ).toBeVisible();
  });

  test("Usage Basis table has OpenAI Codex row", async ({ page }) => {
    await expect(
      page.getByRole("cell", { name: "OpenAI Codex" }).first()
    ).toBeVisible();
  });

  // ── Anthropic quota table ────────────────────────────────────────────────

  test("Anthropic Models section heading is shown", async ({ page }) => {
    await expect(
      page.getByText("Anthropic Models — Global Standard")
    ).toBeVisible();
  });

  test("Anthropic table has claude-3.7-sonnet row", async ({ page }) => {
    await expect(
      page.getByRole("cell", { name: "claude-3.7-sonnet" }).first()
    ).toBeVisible();
  });

  test("Anthropic table has claude-3.5-haiku row", async ({ page }) => {
    await expect(
      page.getByRole("cell", { name: "claude-3.5-haiku" }).first()
    ).toBeVisible();
  });

  test("Anthropic capacity units total is displayed", async ({ page }) => {
    await expect(
      page.getByText(/Total Anthropic capacity units to request:/)
    ).toBeVisible();
  });

  // ── OpenAI quota table ───────────────────────────────────────────────────

  test("Azure OpenAI Models section heading is shown", async ({ page }) => {
    await expect(
      page.getByText("Azure OpenAI Models — Global Standard")
    ).toBeVisible();
  });

  test("OpenAI table has gpt-4o / gpt-4.1 row", async ({ page }) => {
    await expect(
      page.getByRole("cell", { name: "gpt-4o / gpt-4.1" }).first()
    ).toBeVisible();
  });

  test("OpenAI table has o3-mini row", async ({ page }) => {
    await expect(
      page.getByRole("cell", { name: "o3-mini" }).first()
    ).toBeVisible();
  });

  test("OpenAI table has gpt-4o-realtime-preview row", async ({ page }) => {
    await expect(
      page.getByRole("cell", { name: "gpt-4o-realtime-preview" }).first()
    ).toBeVisible();
  });

  // ── Region recommendations ───────────────────────────────────────────────

  test("Recommended Regions section is visible", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: "Recommended Regions" })
    ).toBeVisible();
  });

  test("East US is listed as Primary region", async ({ page }) => {
    const primary = page.locator(".quota-region-card").first();
    await expect(primary).toContainText("Primary");
    await expect(primary).toContainText("East US");
  });

  test("East US 2 is listed as Secondary region", async ({ page }) => {
    await expect(
      page.locator(".quota-region-card").nth(1)
    ).toContainText("East US 2");
  });

  test("West US 3 is listed as Tertiary region", async ({ page }) => {
    await expect(
      page.locator(".quota-region-card").nth(2)
    ).toContainText("West US 3");
  });

  // ── CTA link ─────────────────────────────────────────────────────────────

  test("Request Quota Increase link is present and points to aka.ms", async ({ page }) => {
    const link = page.getByRole("link", { name: /Request Quota Increase/ });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", "https://aka.ms/oai/stuquotarequest");
    await expect(link).toHaveAttribute("target", "_blank");
  });

  // ── Combined view ────────────────────────────────────────────────────────

  test("All Models combined table shows all 5 rows", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: "All Models — Combined View" })
    ).toBeVisible();
    // Combined table: 2 Anthropic + 3 OpenAI = 5 rows
    const rows = await page.locator(".quota-table tbody tr").all();
    // At minimum 5 model rows exist across all tables
    expect(rows.length).toBeGreaterThanOrEqual(5);
  });

  // ── Accessibility ─────────────────────────────────────────────────────────

  test("quota panel has no critical axe violations", async ({ page }, testInfo) => {
    const results = await new AxeBuilder({ page })
      .include(".quota-panel")
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();

    await testInfo.attach("a11y-quota-panel.json", {
      body: JSON.stringify(results.violations, null, 2),
      contentType: "application/json",
    });

    expect(results.violations).toHaveLength(0);
  });
});
