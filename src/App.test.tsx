import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import App from "./App";

describe("App", () => {
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

    vi.unstubAllGlobals();
  });
});
