import { describe, expect, it } from "vitest";
import { buildSpendProjection } from "../projections";
import type { DailySpend } from "../types";

function days(n: number, costUsd: number): DailySpend[] {
  return Array.from({ length: n }, (_, i) => ({
    date: `2026-03-${String(i + 1).padStart(2, "0")}`,
    costUsd
  }));
}

describe("buildSpendProjection", () => {
  it("computes totals and flat projections from uniform daily spend", () => {
    const breakdown = days(28, 10);
    const proj = buildSpendProjection(breakdown, "actual");

    expect(proj.windowDays).toBe(28);
    expect(proj.totalUsd).toBeCloseTo(280, 4);
    expect(proj.dailyAvgUsd).toBeCloseTo(10, 4);
    expect(proj.projectedMonthlyUsd).toBeCloseTo(300, 4);
    expect(proj.projectedAnnualUsd).toBeCloseTo(3650, 4);
    expect(proj.costSource).toBe("actual");
    expect(proj.trend).toBe("flat");
    expect(proj.dailyBreakdown).toHaveLength(28);
  });

  it("detects ramp trend when second half spend is >10% higher than first half", () => {
    const firstHalf = days(14, 5);
    const secondHalf = Array.from({ length: 14 }, (_, i) => ({
      date: `2026-03-${String(i + 15).padStart(2, "0")}`,
      costUsd: 10
    }));
    const breakdown = [...firstHalf, ...secondHalf];
    const proj = buildSpendProjection(breakdown, "estimated");

    expect(proj.trend).toBe("ramp");
    expect(proj.trendedMonthlyUsd).not.toBeNull();
    expect(proj.trendedAnnualUsd).not.toBeNull();
    // Trended projections should be higher than flat
    expect(proj.trendedMonthlyUsd!).toBeGreaterThan(proj.projectedMonthlyUsd);
  });

  it("detects decline trend when second half spend is >10% lower than first half", () => {
    const firstHalf = days(14, 10);
    const secondHalf = Array.from({ length: 14 }, (_, i) => ({
      date: `2026-03-${String(i + 15).padStart(2, "0")}`,
      costUsd: 5
    }));
    const proj = buildSpendProjection([...firstHalf, ...secondHalf], "actual");

    expect(proj.trend).toBe("decline");
    expect(proj.trendedMonthlyUsd).not.toBeNull();
    expect(proj.trendedAnnualUsd).not.toBeNull();
    expect(proj.trendedMonthlyUsd!).toBeLessThan(proj.projectedMonthlyUsd);
  });

  it("returns null trended projections for flat trend", () => {
    const proj = buildSpendProjection(days(28, 10), "seat_based");

    expect(proj.trendedMonthlyUsd).toBeNull();
    expect(proj.trendedAnnualUsd).toBeNull();
  });

  it("returns insufficient_data when fewer than 7 data points", () => {
    const proj = buildSpendProjection(days(5, 10), "actual");

    expect(proj.trend).toBe("insufficient_data");
    expect(proj.trendedMonthlyUsd).toBeNull();
    expect(proj.trendedAnnualUsd).toBeNull();
  });

  it("handles empty breakdown gracefully", () => {
    const proj = buildSpendProjection([], "actual");

    expect(proj.totalUsd).toBe(0);
    expect(proj.dailyAvgUsd).toBe(0);
    expect(proj.projectedMonthlyUsd).toBe(0);
    expect(proj.projectedAnnualUsd).toBe(0);
    expect(proj.trend).toBe("insufficient_data");
    expect(proj.windowDays).toBe(0);
  });

  it("passes through costSource and optional note", () => {
    const proj = buildSpendProjection(days(28, 5), "seat_based", "Seat count estimated");
    expect(proj.costSource).toBe("seat_based");
    expect(proj.note).toBe("Seat count estimated");
  });
});
