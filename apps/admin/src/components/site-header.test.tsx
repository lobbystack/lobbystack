// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SiteHeader } from "./site-header";
import { registerTestWindow } from "@/lib/test-window";

vi.mock("@/components/ui/sidebar", () => ({
  SidebarTrigger: () => null,
}));

describe("SiteHeader", () => {
  it("opens the test window from its phone button, once a window is mounted", () => {
    render(<SiteHeader />);
    expect(screen.queryByRole("button", { name: "testCall.trigger" })).toBeNull();
    const open = vi.fn();
    let unregister = () => {};
    act(() => { unregister = registerTestWindow(open); });
    fireEvent.click(screen.getByRole("button", { name: "testCall.trigger" }));
    expect(open).toHaveBeenCalledOnce();
    act(() => unregister());
  });

  it("updates its fixed styling from the dashboard scroll container", () => {
    const scrollContainerRef = createRef<HTMLElement>();

    render(
      <main ref={scrollContainerRef}>
        <SiteHeader fixed scrollContainerRef={scrollContainerRef} />
      </main>,
    );

    const header = screen.getByRole("banner");
    expect(header.className).toContain("shadow-none");

    if (!scrollContainerRef.current) {
      throw new Error("Expected the scroll container to be mounted.");
    }
    scrollContainerRef.current.scrollTop = 24;
    fireEvent.scroll(scrollContainerRef.current);

    expect(header.className).toContain("shadow");
    expect(header.className).not.toContain("shadow-none");
    expect(header.firstElementChild?.className).toContain("after:backdrop-blur-lg");
  });
});

afterEach(cleanup);
