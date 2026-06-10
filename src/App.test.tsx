import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "./App";

describe("App", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("renders the GitHub Copilot bootstrap page", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false
      })
    );

    render(<App />);

    expect(
      screen.getByText("Multi-provider token consumption dashboard")
    ).toBeInTheDocument();
    expect(screen.getAllByText(/GitHub Copilot/).length).toBeGreaterThan(0);

  });

  it("renders the report export call to action with all supported choices", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false
      })
    );

    render(<App />);

    expect(
      screen.getByRole("button", { name: "Download data" })
    ).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "PDF of reports" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "DOCX" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "XLSX" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "CSV" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "JSON" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "YAML" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Database SQL" })).toBeInTheDocument();

  });

  it("renders the local AI infrastructure sizing section", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false
      })
    );

    render(<App />);

    expect(await screen.findByText("Local AI Infrastructure Sizing")).toBeInTheDocument();
    expect(screen.getByText("Executive Hardware Decision Summary")).toBeInTheDocument();
    expect(screen.getByText("Current workload baseline")).toBeInTheDocument();
    expect(screen.getAllByText("Target first-server migration objective").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Estimated full-workload capacity").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Safe initial production routing").length).toBeGreaterThan(0);
    expect(screen.getByText("First-server recommendation")).toBeInTheDocument();
    expect(screen.getByText("Provider traffic normalized")).toBeInTheDocument();
    expect(screen.getByText("Workload scope sizing")).toBeInTheDocument();
    expect(screen.getByText("Route class migration plan")).toBeInTheDocument();
    expect(screen.getByText("Financial payback model")).toBeInTheDocument();
    expect(screen.getByText("Benchmark gates")).toBeInTheDocument();
  });

  it("prefers accumulated provider snapshots before falling back to latest snapshots", async () => {
    const fetchStub = vi.fn().mockResolvedValue({ ok: false });
    vi.stubGlobal("fetch", fetchStub);

    render(<App />);

    await waitFor(() => {
      expect(fetchStub).toHaveBeenCalledWith(
        expect.stringContaining("/data/github-copilot/accumulated-metadata.json")
      );
    });
  });

  it("shows report data coverage instead of a browser reload timestamp", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false
      })
    );

    render(<App />);

    expect(await screen.findByText("Report data through 2026-03-28")).toBeInTheDocument();
    expect(screen.queryByText(/^Updated /i)).not.toBeInTheDocument();
  });

  it("shows the persisted report generation timestamp when snapshots provide one", async () => {
    const fetchStub = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/data/claude-code/accumulated-metadata.json")) {
        return Promise.resolve({
          json: async () => ({
            dailyBuckets: [
              {
                cacheCreationTokens: 0,
                cacheReadTokens: 0,
                date: "2026-06-07",
                inputTokens: 1,
                models: {},
                outputTokens: 1,
                requestCount: 1,
                webFetchRequests: 0,
                webSearchRequests: 0
              }
            ],
            generatedAt: "2026-06-07T17:10:00.000Z",
            modelsUsed: [],
            monthlySeatCost: 200,
            sessionCount: 1
          }),
          ok: true
        });
      }

      return Promise.resolve({ ok: false });
    });
    vi.stubGlobal("fetch", fetchStub);

    render(<App />);

    expect(
      await screen.findByText(
        "Report generated 2026-06-07 17:10 UTC | data through 2026-06-07"
      )
    ).toBeInTheDocument();
    expect(screen.queryByText(/^Updated /i)).not.toBeInTheDocument();
  });

  it("shows latest forensic consensus in the local model migration report", async () => {
    const fetchStub = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/data/integration/forensic-runs.json")) {
        return Promise.resolve({
          json: async () => ({
            latestRunId: "dynamic-forensic-test",
            runs: {
              "dynamic-forensic-test": {
                parentSynthesis: {
                  confidence: 0.95,
                  dissentingFindings: [
                    {
                      details: "Tail workloads exceed the current local candidate set.",
                      severity: "high",
                      title: "Tail context remains hosted"
                    }
                  ],
                  recommendation:
                    "Route short-context completions locally; keep tail-context agents hosted.",
                  reviewerCount: 7
                },
                reviewerArtifacts: [
                  { bridgeProviderKind: "codex", reviewerModel: "gpt", status: "completed" }
                ],
                runId: "dynamic-forensic-test",
                status: "completed",
                updatedAt: "2026-06-08T23:44:56.380Z"
              }
            }
          }),
          ok: true
        });
      }

      return Promise.resolve({ ok: false });
    });
    vi.stubGlobal("fetch", fetchStub);

    render(<App />);

    expect(await screen.findByText("Forensic reviewer consensus")).toBeInTheDocument();
    expect(
      screen.getByText("Route short-context completions locally; keep tail-context agents hosted.")
    ).toBeInTheDocument();
    expect(screen.getAllByText(/dynamic-forensic-test/)).toHaveLength(2);
    expect(screen.getByText(/Applied forensic guidance/)).toBeInTheDocument();
    expect(screen.getAllByText(/partial local migration/).length).toBeGreaterThan(0);
  });

  it("refresh button requests dynamic refresh before reloading snapshots", async () => {
    const fetchStub = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "http://127.0.0.1:8788/api/refresh") {
        return Promise.resolve({
          json: async () => ({
            jobId: "dynamic-refresh-001",
            status: "completed"
          }),
          ok: true,
          status: 202
        });
      }

      return Promise.resolve({ ok: false });
    });
    vi.stubGlobal("fetch", fetchStub);

    render(<App />);

    await waitFor(() => {
      expect(fetchStub).toHaveBeenCalledWith(
        expect.stringContaining("/data/github-copilot/accumulated-metadata.json")
      );
    });

    fireEvent.click(screen.getByRole("button", { name: /Refresh Report/i }));

    await waitFor(() => {
      expect(fetchStub).toHaveBeenCalledWith(
        "http://127.0.0.1:8788/api/refresh",
        expect.objectContaining({
          method: "POST"
        })
      );
    });

    const refreshCall = fetchStub.mock.calls.find(
      ([input]) => String(input) === "http://127.0.0.1:8788/api/refresh"
    );
    expect(JSON.parse(String(refreshCall?.[1]?.body))).toEqual({
      includeForensicModelProfiles: true,
      includeHuggingFaceRefresh: true,
      mode: "incremental"
    });
    expect(
      await screen.findByText("Refresh job dynamic-refresh-001 completed")
    ).toBeInTheDocument();
  });

  it("refresh button shows progress text while dynamic refresh is pending", async () => {
    const fetchStub = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "http://127.0.0.1:8788/api/refresh") {
        return new Promise(() => {
          // Keep the refresh pending so the in-progress UI state is observable.
        });
      }

      return Promise.resolve({ ok: false });
    });
    vi.stubGlobal("fetch", fetchStub);

    render(<App />);

    await waitFor(() => {
      expect(fetchStub).toHaveBeenCalledWith(
        expect.stringContaining("/data/github-copilot/accumulated-metadata.json")
      );
    });

    fireEvent.click(screen.getByRole("button", { name: /Refresh Report/i }));

    expect(
      await screen.findByText(/Starting refresh: provider data/i)
    ).toBeInTheDocument();
    expect(await screen.findByRole("status", { name: "Refresh activity" })).toBeInTheDocument();
    expect(screen.getByText("Provider Admin APIs")).toBeInTheDocument();
    expect(screen.getByText("Hugging Face candidates")).toBeInTheDocument();
    expect(screen.getByText("Forensic reviewers")).toBeInTheDocument();
    expect(screen.getByText("Report snapshot reload")).toBeInTheDocument();
    expect(screen.getAllByText("Running").length).toBeGreaterThan(0);
    expect(document.querySelector(".refresh-progress__indicator--active")).toBeInTheDocument();
  });

  it("refresh activity panel summarizes provider and forensic job results", async () => {
    const fetchStub = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "http://127.0.0.1:8788/api/refresh") {
        return Promise.resolve({
          json: async () => ({
            forensicRun: {
              reviewerArtifacts: [
                { reviewerModel: "gpt", status: "completed" },
                { reviewerModel: "composer", status: "failed" }
              ],
              status: "degraded"
            },
            jobId: "dynamic-refresh-002",
            providerResults: [
              { providerId: "github-copilot", status: "completed" },
              { providerId: "cursor", status: "degraded" }
            ],
            status: "degraded"
          }),
          ok: true,
          status: 202
        });
      }

      return Promise.resolve({ ok: false });
    });
    vi.stubGlobal("fetch", fetchStub);

    render(<App />);

    await waitFor(() => {
      expect(fetchStub).toHaveBeenCalledWith(
        expect.stringContaining("/data/github-copilot/accumulated-metadata.json")
      );
    });

    fireEvent.click(screen.getByRole("button", { name: /Refresh Report/i }));

    expect(await screen.findByText("Refresh job dynamic-refresh-002 degraded")).toBeInTheDocument();
    expect(screen.getByText("github-copilot completed; cursor degraded")).toBeInTheDocument();
    expect(screen.getByText("gpt completed; composer failed")).toBeInTheDocument();
    expect(screen.getByText("Snapshots reloaded after refresh response.")).toBeInTheDocument();
  });

  it("refresh button keeps the report freshness visible when dynamic refresh is blocked", async () => {
    const fetchStub = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "http://127.0.0.1:8788/api/refresh") {
        return Promise.resolve({
          json: async () => ({
            message:
              "Token Reporting provider refresh is disabled while TOKEN_REPORTING_READ_ONLY is enabled."
          }),
          ok: false,
          status: 403
        });
      }

      return Promise.resolve({ ok: false });
    });
    vi.stubGlobal("fetch", fetchStub);

    render(<App />);

    await waitFor(() => {
      expect(fetchStub).toHaveBeenCalledWith(
        expect.stringContaining("/data/github-copilot/accumulated-metadata.json")
      );
    });

    fireEvent.click(screen.getByRole("button", { name: /Refresh Report/i }));

    expect(
      await screen.findAllByText(
        "Token Reporting provider refresh is disabled while TOKEN_REPORTING_READ_ONLY is enabled."
      )
    ).toHaveLength(2);
    expect(await screen.findByText("Report data through 2026-03-28")).toBeInTheDocument();
  });
});
