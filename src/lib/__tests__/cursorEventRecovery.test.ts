import { describe, expect, it, vi } from "vitest";

import type { CursorFilteredUsageEventsResponse, CursorSnapshot } from "../../providers/cursor/types";
import { planCursorEventRecovery } from "../cursorEventRecovery";

type Event = CursorFilteredUsageEventsResponse["usageEvents"][number];

function event(timestamp: string, overrides: Partial<Event> = {}): Event {
  return {
    timestamp, userEmail: "fixture@redacted.local", model: "fixture-model", kind: "included",
    requestsCosts: 1, chargedCents: 1, cursorTokenFee: 0, ...overrides
  };
}

function snapshot(events: Event[]): CursorSnapshot {
  return {
    generatedAt: "2026-09-02T17:25:59.274Z",
    redactionKeyFingerprint: "fixture-fingerprint", redactionSchemeVersion: "fixture-scheme",
    daily: { data: [], period: { startDate: 1000, endDate: 2000 } },
    spend: { teamMemberSpend: [], totalMembers: 0 },
    events: { usageEvents: events, totalUsageEventsCount: events.length, period: { startDate: 1000, endDate: 2000 } }
  };
}

describe("planCursorEventRecovery", () => {
  it("Plan_IdenticalOverlap_AddsOnlyDeployEventsAndPreservesCanonicalFields", () => {
    const canonical = { ...snapshot([event("1000"), event("2000")]), privateExtension: { retained: true } };
    const deployment = snapshot([event("2000"), event("3000")]);
    deployment.generatedAt = "2026-09-09T01:18:56.033Z";
    deployment.daily.period.startDate = 0;
    deployment.spend = { teamMemberSpend: [], totalMembers: 9 };
    deployment.events!.period = { startDate: 0, endDate: 4000 };
    const before = JSON.stringify([canonical, deployment]);

    const result = planCursorEventRecovery(canonical, deployment);

    expect(result.snapshot).toEqual({
      ...canonical,
      events: { ...canonical.events, usageEvents: [event("1000"), event("2000"), event("3000")],
        totalUsageEventsCount: 3, period: { startDate: 0, endDate: 4000 } }
    });
    expect(JSON.stringify([canonical, deployment])).toBe(before);
    expect(result.manifest).toMatchObject({
      schema: "token-reporting.cursor-event-recovery.v1", scope: "events-only-not-a-refresh",
      canonicalEventCount: 2, deploymentEventCount: 2, sharedEventCount: 1,
      addedEventCount: 1, candidateEventCount: 3
    });
    expect(result.manifest.canonicalSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.manifest.deploymentSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.manifest.candidateSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(result.manifest)).not.toMatch(/fixture@|fixture-model|fixture-fingerprint/);
  });

  it("Plan_RepeatedApplication_IsIdempotent", () => {
    const deployment = snapshot([event("2000"), event("3000")]);
    const first = planCursorEventRecovery(snapshot([event("1000"), event("2000")]), deployment);
    const second = planCursorEventRecovery(first.snapshot, deployment);
    expect(second.snapshot).toEqual(first.snapshot);
    expect(second.manifest.addedEventCount).toBe(0);
    expect(second.manifest.candidateSha256).toBe(first.manifest.candidateSha256);
  });

  it("Plan_ReorderedDeployment_IsDeterministic", () => {
    const canonical = snapshot([event("1000")]);
    const a = planCursorEventRecovery(canonical, snapshot([event("3000"), event("2000")]));
    const b = planCursorEventRecovery(canonical, snapshot([event("2000"), event("3000")]));
    expect(a.snapshot).toEqual(b.snapshot);
    expect(a.manifest.candidateSha256).toBe(b.manifest.candidateSha256);
  });

  it("Plan_DifferentHostCollation_DoesNotDependOnLocaleForOrderingOrHashes", () => {
    const localeCompare = vi.spyOn(String.prototype, "localeCompare").mockImplementation(() => {
      throw new Error("Fixture forbids environment-dependent collation.");
    });
    try {
      const deployment = snapshot([event("1000", { model: "z" }), event("1000", { model: "A" })]);
      expect(() => planCursorEventRecovery(snapshot([]), deployment)).not.toThrow();
    } finally {
      localeCompare.mockRestore();
    }
  });

  it("Plan_CircularUnknownExtension_ThrowsSanitizedErrorWithoutMutation", () => {
    const canonical = { ...snapshot([]), extension: {} };
    canonical.extension = canonical;
    expect(() => planCursorEventRecovery(canonical, snapshot([])))
      .toThrow(/^Cursor recovery requires JSON-serializable snapshots\.$/);
    expect(canonical.events!.usageEvents).toEqual([]);
  });

  it.each(["canonical", "deployment"] as const)("Plan_DuplicateCoreIdentityIn%s_RejectsDifferentCostRows", (side) => {
    const duplicate = snapshot([event("1000"), event("1000", { chargedCents: 2 })]);
    const unique = snapshot([event("1000")]);
    expect(() => planCursorEventRecovery(side === "canonical" ? duplicate : unique,
      side === "deployment" ? duplicate : unique)).toThrow("ambiguous duplicate event identity");
  });

  it("Plan_DuplicateIdenticalCoreRows_RejectsAmbiguity", () => {
    expect(() => planCursorEventRecovery(snapshot([event("1000"), event("1000")]), snapshot([])))
      .toThrow("ambiguous duplicate event identity");
  });

  it.each([0, 2])("Plan_SharedCostCorrection%s_RefusesDownwardOrUpwardWinner", (chargedCents) => {
    const canonical = snapshot([event("1000")]);
    const deployment = snapshot([event("1000", { chargedCents })]);
    expect(() => planCursorEventRecovery(canonical, deployment)).toThrow("conflicting shared event payload");
    expect(canonical.events!.usageEvents[0].chargedCents).toBe(1);
  });

  it("Plan_SharedTokenCorrection_RejectsEvenWhenCostsMatch", () => {
    const tokenUsage = { inputTokens: 1, outputTokens: 1, cacheWriteTokens: 0, cacheReadTokens: 0, totalCents: 1 };
    expect(() => planCursorEventRecovery(snapshot([event("1000", { tokenUsage })]),
      snapshot([event("1000", { tokenUsage: { ...tokenUsage, inputTokens: 2 } })])))
      .toThrow("conflicting shared event payload");
  });

  it.each(["redactionKeyFingerprint", "redactionSchemeVersion"] as const)(
    "Plan_Mismatched%s_RejectsRecovery", (field) => {
      const deployment = snapshot([]);
      deployment[field] = "different";
      expect(() => planCursorEventRecovery(snapshot([]), deployment)).toThrow("matching nonempty redaction");
    }
  );

  it.each([undefined, "", " "])("Plan_EmptyRedaction%j_RejectsBothMatchingEmptyValues", (value) => {
    const canonical = snapshot([]), deployment = snapshot([]);
    canonical.redactionKeyFingerprint = value;
    deployment.redactionKeyFingerprint = value;
    expect(() => planCursorEventRecovery(canonical, deployment)).toThrow("matching nonempty redaction");
  });

  it("Plan_MissingEventFeed_RefusesToConvertUnknownIntoEmptyData", () => {
    const canonical = snapshot([]);
    delete canonical.events;
    expect(() => planCursorEventRecovery(canonical, snapshot([]))).toThrow("both event feeds");
  });

  it("Plan_InvalidSnapshot_ReportsOnlySanitizedSchemaError", () => {
    const canonical = snapshot([]);
    canonical.events!.usageEvents = [{ ...event("1000"), chargedCents: "fixture-private-value" } as unknown as Event];
    expect(() => planCursorEventRecovery(canonical, snapshot([]))).toThrow(/^Cursor recovery requires valid snapshots\.$/);
  });

  it.each(["", "not-a-timestamp", "1.5", String(Number.MAX_SAFE_INTEGER + 1)])(
    "Plan_UnstableTimestamp%j_RejectsIdentity", (timestamp) => {
      expect(() => planCursorEventRecovery(snapshot([event(timestamp)]), snapshot([]))).toThrow("stable timestamp");
    }
  );

  it("Plan_NumericAndStringTimestamps_UsesEquivalentCoreIdentity", () => {
    const canonical = snapshot([event("1000")]);
    const deployment = snapshot([{ ...event("1000"), timestamp: 1000 } as unknown as Event]);
    const result = planCursorEventRecovery(canonical, deployment);
    expect(result.manifest.sharedEventCount).toBe(1);
    expect(result.snapshot.events!.usageEvents).toEqual(canonical.events!.usageEvents);
  });

  it("Plan_OptionalCoreFields_UsesNullIdentityWithoutInventingValues", () => {
    const anonymous = event("1000", { userEmail: null, model: null, kind: null });
    expect(planCursorEventRecovery(snapshot([anonymous]), snapshot([anonymous])).manifest.sharedEventCount).toBe(1);
  });

  it.each(["userEmail", "model", "kind"] as const)("Plan_BlankVersusMissing%s_RejectsInsteadOfAddingAnIdentity", (field) => {
    const canonical = snapshot([event("1000", { [field]: null })]);
    const deployment = snapshot([event("1000", { [field]: "" })]);
    expect(() => planCursorEventRecovery(canonical, deployment)).toThrow("conflicting shared event payload");
  });

  it("Plan_NoEventPeriods_PreservesUnknownPeriod", () => {
    const canonical = snapshot([]), deployment = snapshot([event("1000")]);
    delete canonical.events!.period;
    delete deployment.events!.period;
    expect(planCursorEventRecovery(canonical, deployment).snapshot.events).not.toHaveProperty("period");
  });

  it.each(["canonical", "deployment"] as const)("Plan_Missing%sEventPeriod_KeepsUnionBoundsUnknown", (side) => {
    const canonical = snapshot([]), deployment = snapshot([event("1000")]);
    delete (side === "canonical" ? canonical : deployment).events!.period;
    expect(planCursorEventRecovery(canonical, deployment).snapshot.events).not.toHaveProperty("period");
  });

  it("Plan_InvalidEventPeriod_RejectsReversedBoundaries", () => {
    const deployment = snapshot([]);
    deployment.events!.period = { startDate: 3000, endDate: 1000 };
    expect(() => planCursorEventRecovery(snapshot([]), deployment)).toThrow("valid event period");
  });
});
