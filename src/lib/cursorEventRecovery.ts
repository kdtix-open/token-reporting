import { createHash } from "node:crypto";

import { cursorSnapshotSchema, type CursorFilteredUsageEventsResponse, type CursorSnapshot } from "../providers/cursor/types";

type Event = CursorFilteredUsageEventsResponse["usageEvents"][number];
type Period = CursorFilteredUsageEventsResponse["period"];

/** Sanitized, deterministic evidence for an event-only candidate, not a refresh. */
export interface CursorEventRecoveryManifest {
  schema: "token-reporting.cursor-event-recovery.v1";
  scope: "events-only-not-a-refresh";
  hashAlgorithm: "sha256-canonical-json-v1";
  canonicalSha256: string;
  deploymentSha256: string;
  candidateSha256: string;
  canonicalEventCount: number;
  deploymentEventCount: number;
  sharedEventCount: number;
  addedEventCount: number;
  candidateEventCount: number;
}

/** In-memory candidate and evidence; applying it requires separate authorization. */
export interface CursorEventRecoveryPlan {
  snapshot: CursorSnapshot;
  manifest: CursorEventRecoveryManifest;
}

/** Plan a conservative event union without writing data or choosing corrections. */
export function planCursorEventRecovery(
  canonical: CursorSnapshot,
  deployment: CursorSnapshot
): CursorEventRecoveryPlan {
  const [canonicalFeed, deploymentFeed] = validatedFeeds(canonical, deployment);
  const canonicalEvents = indexEvents(canonicalFeed.usageEvents);
  const deploymentEvents = indexEvents(deploymentFeed.usageEvents);
  const added = findAdditions(canonicalEvents, deploymentEvents);
  const usageEvents = [...canonicalFeed.usageEvents, ...added];
  const candidateEvents = indexEvents(usageEvents);
  const period = unionPeriod(canonicalFeed.period, deploymentFeed.period);
  const snapshot: CursorSnapshot = {
    ...canonical,
    events: recoveredFeed(canonicalFeed, usageEvents, period)
  };
  return {
    snapshot,
    manifest: {
      schema: "token-reporting.cursor-event-recovery.v1",
      scope: "events-only-not-a-refresh",
      hashAlgorithm: "sha256-canonical-json-v1",
      canonicalSha256: snapshotHash(canonical),
      deploymentSha256: snapshotHash(deployment),
      candidateSha256: snapshotHash(snapshot),
      canonicalEventCount: canonicalEvents.size,
      deploymentEventCount: deploymentEvents.size,
      sharedEventCount: deploymentEvents.size - added.length,
      addedEventCount: added.length,
      candidateEventCount: candidateEvents.size
    }
  };
}

function validatedFeeds(
  canonical: CursorSnapshot,
  deployment: CursorSnapshot
): [CursorFilteredUsageEventsResponse, CursorFilteredUsageEventsResponse] {
  if (!cursorSnapshotSchema.safeParse(canonical).success || !cursorSnapshotSchema.safeParse(deployment).success) {
    throw new Error("Cursor recovery requires valid snapshots.");
  }
  for (const field of ["redactionKeyFingerprint", "redactionSchemeVersion"] as const) {
    if (!canonical[field]?.trim() || !deployment[field]?.trim() || canonical[field] !== deployment[field]) {
      throw new Error("Cursor recovery requires matching nonempty redaction scheme and fingerprint.");
    }
  }
  if (!canonical.events || !deployment.events) {
    throw new Error("Cursor recovery requires both event feeds; missing data is not an empty feed.");
  }
  return [canonical.events, deployment.events];
}

function eventTimestamp(event: Event): string {
  const timestamp = Number(event.timestamp);
  if (!String(event.timestamp).trim() || !Number.isSafeInteger(timestamp)) {
    throw new Error("Cursor recovery requires a stable timestamp for every event.");
  }
  return String(timestamp);
}

function eventKey(event: Event): string {
  return canonicalJson([eventTimestamp(event), event.userEmail ?? "", event.model ?? "", event.kind ?? ""]);
}

function indexEvents(events: Event[]): Map<string, Event> {
  const index = new Map<string, Event>();
  for (const event of events) {
    const key = eventKey(event);
    if (index.has(key)) throw new Error("Cursor recovery refused an ambiguous duplicate event identity.");
    index.set(key, event);
  }
  return index;
}

function findAdditions(canonical: Map<string, Event>, deployment: Map<string, Event>): Event[] {
  const added: Event[] = [];
  for (const [key, event] of deployment) {
    const previous = canonical.get(key);
    if (!previous) added.push(event);
    else if (eventPayload(previous) !== eventPayload(event)) {
      throw new Error("Cursor recovery refused a conflicting shared event payload.");
    }
  }
  return added.sort((a, b) => Number(a.timestamp) - Number(b.timestamp) || compareStrings(eventKey(a), eventKey(b)));
}

function eventPayload(event: Event): string {
  return canonicalJson({ ...event, timestamp: eventTimestamp(event) });
}

function unionPeriod(canonical: Period, deployment: Period): Period {
  const periods = [canonical, deployment].filter((period): period is NonNullable<Period> => period !== undefined);
  for (const period of periods) {
    if (period.startDate > period.endDate) throw new Error("Cursor recovery requires a valid event period.");
  }
  if (!canonical || !deployment) return undefined;
  return {
    startDate: Math.min(...periods.map(period => period.startDate)),
    endDate: Math.max(...periods.map(period => period.endDate))
  };
}

function recoveredFeed(
  canonical: CursorFilteredUsageEventsResponse,
  usageEvents: Event[],
  period: Period
): CursorFilteredUsageEventsResponse {
  const recovered = { ...canonical, usageEvents, totalUsageEventsCount: usageEvents.length };
  if (period) recovered.period = period;
  else delete recovered.period;
  return recovered;
}

function snapshotHash(snapshot: CursorSnapshot): string {
  return createHash("sha256").update(canonicalJson(snapshot)).digest("hex");
}

function canonicalJson(value: unknown): string {
  try {
    return JSON.stringify(value, (_, item) => item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => compareStrings(a, b))) : item);
  } catch {
    throw new Error("Cursor recovery requires JSON-serializable snapshots.");
  }
}

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
