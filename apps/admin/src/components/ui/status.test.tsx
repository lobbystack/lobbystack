// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Status } from "./status";

afterEach(cleanup);

describe("Status", () => {
  it("renders a small neutral chip by default", () => {
    render(<Status>Pending</Status>);
    const chip = screen.getByText("Pending");
    expect(chip.dataset.slot).toBe("status");
    expect(chip.dataset.variant).toBe("neutral");
    expect(chip.className).toContain("text-xs");
    expect(chip.className).toContain("bg-status-neutral");
  });

  it("takes its color from the variant", () => {
    render(<Status variant="danger">Failed</Status>);
    expect(screen.getByText("Failed").className).toContain("bg-status-danger");
  });
});
