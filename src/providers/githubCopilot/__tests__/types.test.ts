import { describe, expect, it } from "vitest";

import { gitHubCopilotLatestUsersReportSchema } from "../types";

const report = {
  download_links: [], report_start_day: "2026-09-01", report_end_day: "2026-09-09"
};

describe("GitHub Copilot persisted download count", () => {
  it.each([0, 3])("ReportSchema_SafeDownloadCount%s_PreservesCount", (count) => {
    expect(gitHubCopilotLatestUsersReportSchema.parse({
      ...report, download_link_count: count
    })).toHaveProperty("download_link_count", count);
  });

  it.each([-1, 1.5, NaN, Infinity, "3", null])(
    "ReportSchema_InvalidDownloadCount%s_RejectsValue",
    (count) => {
      expect(gitHubCopilotLatestUsersReportSchema.safeParse({
        ...report, download_link_count: count
      }).success).toBe(false);
    }
  );

  it("ReportSchema_LegacySnapshotWithoutSafeCount_RemainsSupported", () => {
    const legacy = { ...report, download_links: ["https://example.test/legacy.json"] };
    expect(gitHubCopilotLatestUsersReportSchema.parse(legacy)).toEqual(legacy);
  });
});
