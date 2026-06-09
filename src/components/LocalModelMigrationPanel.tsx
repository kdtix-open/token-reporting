import { buildLocalModelReport } from "../lib/localModelReport";
import type { ContextConfidence, LocalModelMigrationReport, LocalModelProfile, ModelTier } from "../lib/localModelReport";
import {
  type HuggingFaceCandidateSet
} from "../lib/huggingFaceCandidates";
import {
  type LocalSessionDistribution
} from "../lib/localSessionDistribution";
import type { ReportForensicRun } from "../lib/reportExports";
import type { ProviderReportSummary } from "../lib/types";

function fmtM(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function fmtCtx(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return `${n}`;
}

const TIER_LABEL: Record<ModelTier, string> = {
  min: "Minimum viable",
  recommended: "Recommended",
  pro: "Professional grade",
  enterprise: "Enterprise grade"
};

const TIER_COLOR: Record<ModelTier, string> = {
  min: "lm-profile--min",
  recommended: "lm-profile--recommended",
  pro: "lm-profile--pro",
  enterprise: "lm-profile--enterprise"
};

const CODE_BADGE: Record<string, string> = {
  excellent: "lm-badge lm-badge--excellent",
  good: "lm-badge lm-badge--good",
  fair: "lm-badge lm-badge--fair"
};

type FitState = "ok" | "unknown" | "fail";

function getFitStatus(
  profile: LocalModelProfile,
  contextConfidence: ContextConfidence
): { state: FitState; text: string } {
  if (!profile.contextFits && !profile.throughputFits) {
    return { state: "fail", text: "✗ Context too small · throughput insufficient" };
  }
  if (!profile.contextFits) {
    return { state: "fail", text: "✗ Context window too small for this workload" };
  }
  if (!profile.throughputFits) {
    return { state: "fail", text: "✗ Throughput insufficient for this workload" };
  }
  if (contextConfidence === "insufficient_data") {
    return { state: "unknown", text: "○ Context fit unknown — run report:local-sessions" };
  }
  return { state: "ok", text: "✓ Fits your workload" };
}

function ModelCard({ profile, contextConfidence }: {
  profile: LocalModelProfile;
  contextConfidence: ContextConfidence;
}) {
  const hfUrl = `https://huggingface.co/${profile.hfRepoId}`;
  const fit = getFitStatus(profile, contextConfidence);
  const isUnfit = !profile.contextFits || !profile.throughputFits;

  return (
    <div className={`lm-profile ${TIER_COLOR[profile.tier] ?? ""} ${isUnfit ? "lm-profile--unfit" : ""}`}>
      <div className={`lm-fit-status lm-fit-status--${fit.state}`}>{fit.text}</div>
      <div className="lm-profile__tier">{TIER_LABEL[profile.tier]}</div>
      <h3 className="lm-profile__name">
        <a href={hfUrl} target="_blank" rel="noreferrer" className="lm-profile__hf-link">
          {profile.name}
        </a>
        <span className="lm-profile__params">{profile.parameterCount}</span>
      </h3>
      <p className="lm-profile__hf-id">{profile.hfRepoId}</p>

      <dl className="lm-profile__specs">
        <div>
          <dt>Context window</dt>
          <dd>{fmtCtx(profile.contextWindow)} tokens</dd>
        </div>
        <div>
          <dt>Quantization</dt>
          <dd>{profile.quantization}</dd>
        </div>
        <div>
          <dt>GPU VRAM (min)</dt>
          <dd>{profile.vramGbMin} GB</dd>
        </div>
        {profile.effectiveContextAtMinVram !== undefined && (
          <div>
            <dt>Context at min VRAM</dt>
            <dd>~{fmtCtx(profile.effectiveContextAtMinVram)} tokens (Q8 KV)</dd>
          </div>
        )}
        {profile.systemRamGbMin !== undefined && (
          <div>
            <dt>System RAM (KV cache)</dt>
            <dd>≥{profile.systemRamGbMin} GB</dd>
          </div>
        )}
        <div>
          <dt>GPU class</dt>
          <dd>{profile.gpuClass}</dd>
        </div>
        <div>
          <dt>Throughput</dt>
          <dd>~{profile.tokensPerSecEstimate} tok/s</dd>
        </div>
        <div>
          <dt>License</dt>
          <dd>{profile.license}</dd>
        </div>
        {profile.hfDownloads !== undefined && (
          <div>
            <dt>Downloads</dt>
            <dd>{fmtM(profile.hfDownloads)}</dd>
          </div>
        )}
        {profile.hfLikes !== undefined && (
          <div>
            <dt>Likes</dt>
            <dd>{profile.hfLikes.toLocaleString()}</dd>
          </div>
        )}
        {profile.hfLastModified && (
          <div>
            <dt>Updated</dt>
            <dd>{new Date(profile.hfLastModified).toLocaleDateString()}</dd>
          </div>
        )}
      </dl>

      <div className="lm-profile__badges">
        <span className={CODE_BADGE[profile.codeCapability]}>
          Code: {profile.codeCapability}
        </span>
        {profile.toolUseSupport && (
          <span className="lm-badge lm-badge--tool">Tool use ✓</span>
        )}
        {profile.commercialSafe && (
          <span className="lm-badge lm-badge--commercial">Commercial ✓</span>
        )}
      </div>

      <p className="lm-profile__note">{profile.note}</p>
      {profile.forensicInterpretation && (
        <p className="lm-profile__forensic">{profile.forensicInterpretation}</p>
      )}
    </div>
  );
}

function WorkloadCallout({ report }: { report: LocalModelMigrationReport }) {
  const { contextConfidence, recommendedProfile, alternativeProfiles, workloadGap, estimatedContextWindowNeeded, requiredTokensPerSec } = report;

  if (contextConfidence === "insufficient_data") {
    return (
      <div className="lm-workload-callout lm-workload-callout--unknown">
        ○ <strong>Context fit unknown.</strong> Run{" "}
        <code>npm run report:local-sessions</code> to measure your actual p99 context
        window and enable workload-fit analysis.
      </div>
    );
  }

  if (recommendedProfile) {
    return (
      <div className="lm-workload-callout lm-workload-callout--ok">
        <div>
          ★ <strong>Lowest-cost on-prem fit:</strong>{" "}
          <strong>{recommendedProfile.name}</strong> covers your{" "}
          {estimatedContextWindowNeeded != null ? fmtCtx(estimatedContextWindowNeeded) : "—"}-token
          context window at {requiredTokensPerSec.toFixed(1)} tok/s required.
        </div>
        {alternativeProfiles.length > 0 && (
          <div className="lm-workload-callout__alternatives">
            <span className="lm-workload-callout__alt-label">Also viable:</span>
            {alternativeProfiles.map((p) => (
              <a
                key={p.hfRepoId}
                href={`https://huggingface.co/${p.hfRepoId}`}
                target="_blank"
                rel="noreferrer"
                className="lm-workload-callout__alt-chip"
              >
                {p.name} ({p.parameterCount})
              </a>
            ))}
          </div>
        )}
      </div>
    );
  }

  // No profile fits — build a specific gap explanation
  const parts: string[] = [];
  if (workloadGap?.context && estimatedContextWindowNeeded != null) {
    const best = [...report.profiles].sort((a, b) => b.contextWindow - a.contextWindow)[0];
    parts.push(
      `your context requirement (${fmtCtx(estimatedContextWindowNeeded)} tokens) exceeds all catalogue profiles` +
      (best ? ` — largest is ${fmtCtx(best.contextWindow)} (${best.name})` : "")
    );
  }
  if (workloadGap?.throughput) {
    const best = [...report.profiles].sort((a, b) => b.tokensPerSecEstimate - a.tokensPerSecEstimate)[0];
    parts.push(
      `throughput requirement (${requiredTokensPerSec.toFixed(1)} tok/s) exceeds all catalogue estimates` +
      (best ? ` — fastest is ~${best.tokensPerSecEstimate} tok/s (${best.name})` : "")
    );
  }
  if (parts.length === 0) {
    // Individual profiles miss on different axes — no single model covers both
    parts.push("no single profile satisfies both context and throughput for this workload");
  }

  return (
    <div className="lm-workload-callout lm-workload-callout--gap">
      ⚠ <strong>No on-prem profile covers your full workload:</strong>{" "}
      {parts.join("; ")}.
    </div>
  );
}

interface LocalModelMigrationPanelProps {
  summaries: ProviderReportSummary[];
  /** Pre-fetched local session distribution; re-passed on every parent refresh. */
  distribution: LocalSessionDistribution | null;
  forensicRun: ReportForensicRun | null;
  huggingFaceCandidateSet: HuggingFaceCandidateSet | null;
}

export function LocalModelMigrationPanel({
  summaries,
  distribution,
  forensicRun,
  huggingFaceCandidateSet
}: LocalModelMigrationPanelProps) {
  const report = buildLocalModelReport(
    summaries,
    distribution,
    huggingFaceCandidateSet,
    forensicRun
  );

  if (report.tokenObservedProviders.length === 0 && report.requestOnlyProviders.length === 0) {
    return null;
  }

  const hasMissingTokenData =
    report.requestOnlyProviders.length > 0 ||
    report.tokenObservedProviders.some((p) => p.requestCount === null);

  return (
    <section className="lm-panel" aria-labelledby="lm-panel-title">
      <h2 className="lm-panel__title" id="lm-panel-title">
        Local model migration sizing
      </h2>
      <p className="lm-panel__subtitle">
        Aggregated token load across providers · {report.windowDays}-day window ·
        model profiles sourced from{" "}
        <a href="https://huggingface.co" target="_blank" rel="noreferrer">
          HuggingFace
        </a>
      </p>

      {/* ── Token load breakdown ─────────────────────────────────────── */}
      <div className="lm-section">
        <h3 className="lm-section__heading">Token load ({report.windowDays}-day total)</h3>
        <div className="lm-token-grid">
          <div className="lm-metric">
            <span className="lm-metric__value">{fmtM(report.totalInputTokens)}</span>
            <span className="lm-metric__label">Input tokens</span>
          </div>
          <div className="lm-metric">
            <span className="lm-metric__value">{fmtM(report.totalOutputTokens)}</span>
            <span className="lm-metric__label">Output tokens</span>
          </div>
          <div className="lm-metric lm-metric--cache">
            <span className="lm-metric__value">{fmtM(report.totalCacheCreationTokens)}</span>
            <span className="lm-metric__label">Cache creation</span>
          </div>
          <div className="lm-metric lm-metric--cache">
            <span className="lm-metric__value">{fmtM(report.totalCacheReadTokens)}</span>
            <span className="lm-metric__label">Cache reads¹</span>
          </div>
          <div className="lm-metric lm-metric--total">
            <span className="lm-metric__value">{fmtM(report.totalPureComputeTokens)}</span>
            <span className="lm-metric__label">Pure compute tokens²</span>
          </div>
          <div className="lm-metric">
            <span className="lm-metric__value">{fmtM(Math.round(report.dailyAvgComputeTokens))}</span>
            <span className="lm-metric__label">Daily avg compute</span>
          </div>
        </div>
        <p className="lm-footnote">
          ¹ Cache reads map to KV-cache hits on local stack — lower compute cost than fresh inference. &nbsp;
          ² Pure compute = input + output + cache creation (cache reads excluded).
        </p>
        {report.appliedForensicGuidance && (
          <p className="lm-warn-banner lm-warn-banner--info">
            Applied forensic guidance from <strong>{report.appliedForensicGuidance.runId}</strong>:{" "}
            {report.appliedForensicGuidance.impactSummary}
          </p>
        )}

        {/* Provider attribution */}
        <div className="lm-attribution">
          {report.tokenObservedProviders.map((p) => (
            <span key={p.providerId} className="lm-attr-chip lm-attr-chip--token">
              {p.providerId} — token data ✓
            </span>
          ))}
          {report.requestOnlyProviders.map((p) => (
            <span key={p.providerId} className="lm-attr-chip lm-attr-chip--request">
              {p.providerId} — {fmtM(p.requestCount)} requests only
            </span>
          ))}
        </div>

        {hasMissingTokenData && !distribution && (
          <p className="lm-warn-banner">
            ⚠ Token telemetry is incomplete. {report.requestOnlyProviders.map((p) => p.note).join(" ")}
            {report.tokenObservedProviders.some((p) => p.requestCount === null) &&
              " Claude does not expose a request count via the messages usage_report — context window sizing falls back to Codex requests only. Run `npm run report:local-sessions` to derive empirical per-turn distributions from ~/.codex + ~/.claude session logs."}
          </p>
        )}
        {distribution && (
          <p className="lm-warn-banner lm-warn-banner--info">
            ✓ Empirical per-turn token distribution loaded from{" "}
            {distribution.combined.sampleCount.toLocaleString()} local samples (
            {distribution.sources
              .map((s) => `${s.source}=${s.sampleCount.toLocaleString()}`)
              .join(", ")}
            ) sourced from <code>~/.codex/archived_sessions</code> and{" "}
            <code>~/.claude/projects</code>. Snapshot generated{" "}
            {new Date(distribution.generatedAt).toLocaleDateString()}.
          </p>
        )}
      </div>

      {/* ── Throughput + context sizing ──────────────────────────────── */}
      <div className="lm-section">
        <h3 className="lm-section__heading">Server sizing heuristics</h3>
        <div className="lm-sizing-grid">
          <div className="lm-sizing-card">
            <div className="lm-sizing-card__label">Required throughput</div>
            <div className="lm-sizing-card__value">
              {report.requiredTokensPerSec.toFixed(1)} tok/s
            </div>
            <div className="lm-sizing-card__note">
              Steady-state over 8-hour active window · bursts will exceed this
            </div>
          </div>
          <div className="lm-sizing-card">
            <div className="lm-sizing-card__label">Context window needed</div>
            <div className="lm-sizing-card__value">
              {report.estimatedContextWindowNeeded !== null
                ? `≥ ${fmtCtx(report.estimatedContextWindowNeeded)} tokens`
                : "Unknown"}
            </div>
            <div className="lm-sizing-card__note">
              {report.contextConfidence === "high" && report.localDistribution ? (
                <>
                  <span className="lm-confidence lm-confidence--high">High confidence</span>
                  {" "}empirical p99 from {report.localDistribution.combined.sampleCount.toLocaleString()} local samples · p95 ={" "}
                  {fmtCtx(Math.round(report.localDistribution.combined.p95))} · p99 ={" "}
                  {fmtCtx(Math.round(report.localDistribution.combined.p99))} · max ={" "}
                  {fmtCtx(Math.round(report.localDistribution.combined.max))} tokens. Rounded up to standard size.
                  {report.estimatedContextWindowNeeded !== null &&
                    report.estimatedContextWindowNeeded > 131_072 && (
                      <>
                        {" "}
                        <strong>Catalogue gap:</strong> requirement exceeds 131K — only the 1M-context profile fits.
                      </>
                    )}
                </>
              ) : report.contextConfidence === "low" ? (
                <>
                  <span className="lm-confidence lm-confidence--low">Low confidence</span>
                  {" "}avg {fmtM(Math.round(report.avgTokensPerObservedRequest ?? 0))} tok/req × 2.5 safety factor → rounded to standard size. Does not reflect tail requests. Run{" "}
                  <code>npm run report:local-sessions</code> to upgrade to empirical p99.
                </>
              ) : (
                <span className="lm-confidence lm-confidence--insufficient">
                  Insufficient data — no request count available
                </span>
              )}
            </div>
          </div>
        </div>
        {report.appliedForensicGuidance && (
          <div className="lm-forensic-applied">
            <strong>Forensics-applied sizing interpretation:</strong>{" "}
            {report.appliedForensicGuidance.routingStrategy.replaceAll("_", " ")} · local scope:{" "}
            {report.appliedForensicGuidance.localWorkloadScope} · hosted guardrail:{" "}
            {report.appliedForensicGuidance.hostedWorkloadScope}.
          </div>
        )}
      </div>

      {/* ── Model profiles ───────────────────────────────────────────── */}
      <div className="lm-section">
        <h3 className="lm-section__heading">On-prem model profiles</h3>
        <WorkloadCallout report={report} />
        {report.appliedForensicGuidance && (
          <div className="lm-forensic-applied">
            <strong>Profile interpretation applied from reviewers:</strong>{" "}
            Candidate cards are evaluated as route-specific options, not as a single full-workload replacement.
          </div>
        )}
        <div className="lm-profiles">
          {report.profiles.map((p) => (
            <ModelCard key={p.hfRepoId} profile={p} contextConfidence={report.contextConfidence} />
          ))}
        </div>
        <p className="lm-footnote">
          All estimates: Q4_K_M quantization · concurrency=1 · llama.cpp/Ollama backend.
          Actual performance varies by hardware, batch size, prompt length, and KV-cache configuration.
        </p>
      </div>

      {forensicRun?.parentSynthesis && (
        <div className="lm-section lm-forensic">
          <h3 className="lm-section__heading">Forensic reviewer consensus</h3>
          <div className="lm-forensic__summary">
            <div>
              <span className="lm-forensic__label">Run</span>
              <strong>{forensicRun.runId ?? "unknown"}</strong>
            </div>
            <div>
              <span className="lm-forensic__label">Status</span>
              <strong>{forensicRun.status ?? "unknown"}</strong>
            </div>
            <div>
              <span className="lm-forensic__label">Confidence</span>
              <strong>
                {typeof forensicRun.parentSynthesis.confidence === "number"
                  ? `${Math.round(forensicRun.parentSynthesis.confidence * 100)}%`
                  : "unknown"}
              </strong>
            </div>
            <div>
              <span className="lm-forensic__label">Reviewers</span>
              <strong>{forensicRun.parentSynthesis.reviewerCount ?? "unknown"}</strong>
            </div>
          </div>
          <p className="lm-forensic__recommendation">
            {forensicRun.parentSynthesis.recommendation}
          </p>
          {forensicRun.parentSynthesis.dissentingFindings &&
            forensicRun.parentSynthesis.dissentingFindings.length > 0 && (
              <ul className="lm-forensic__findings">
                {forensicRun.parentSynthesis.dissentingFindings.slice(0, 3).map((finding) => (
                  <li key={`${readFindingText(finding, "title")}-${readFindingText(finding, "severity")}`}>
                    <span>{readFindingText(finding, "severity").toUpperCase()}</span>
                    <strong>{readFindingText(finding, "title")}</strong>
                    <p>{readFindingText(finding, "details")}</p>
                  </li>
                ))}
              </ul>
            )}
          {forensicRun.reviewerArtifacts && forensicRun.reviewerArtifacts.length > 0 && (
            <p className="lm-footnote">
              Reviewer artifacts:{" "}
              {forensicRun.reviewerArtifacts
                .map((artifact) =>
                  `${readFindingText(artifact, "reviewerModel")} ${readFindingText(artifact, "status")}`
                )
                .join("; ")}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function readFindingText(value: Record<string, unknown>, field: string): string {
  const fieldValue = value[field];
  return typeof fieldValue === "string" && fieldValue ? fieldValue : "unknown";
}
