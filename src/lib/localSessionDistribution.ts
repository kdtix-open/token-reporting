import { z } from "zod";

const distSummarySchema = z.object({
  mean: z.number(),
  p50: z.number(),
  p95: z.number(),
  p99: z.number(),
  max: z.number()
});

const sourceSchema = z.object({
  source: z.enum(["codex", "claude"]),
  sampleCount: z.number().int(),
  contextTokens: distSummarySchema,
  totalTokens: distSummarySchema,
  observedContextWindows: z.array(z.number()),
  modelsSeen: z.array(z.string())
});

export const localSessionDistributionSchema = z.object({
  generatedAt: z.string(),
  sources: z.array(sourceSchema),
  combined: distSummarySchema.extend({ sampleCount: z.number().int() })
});

export type LocalSessionDistribution = z.infer<
  typeof localSessionDistributionSchema
>;

/** Fetch the locally-cached distribution snapshot. Returns null when missing. */
export async function loadLocalSessionDistribution(): Promise<LocalSessionDistribution | null> {
  try {
    const res = await fetch("/data/local-sessions/distribution.json");
    if (!res.ok) return null;
    const raw = await res.json();
    const parsed = localSessionDistributionSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
