// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { SiteHeader } from "./site-header";

afterEach(cleanup);

describe("SiteHeader", () => {
  it("only holds the safe area, with no title or Test call button", () => {
    const { container } = render(<SiteHeader fixed />);
    const header = container.querySelector<HTMLElement>('[data-slot="site-header"]');
    expect(header).not.toBeNull();
    expect(header?.className).toContain("h-[env(safe-area-inset-top)]");
    expect(header?.childElementCount).toBe(0);
    expect(header?.textContent).toBe("");
    expect(screen.queryByRole("button")).toBeNull();
  });
});
