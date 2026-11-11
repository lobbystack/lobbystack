// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SiteHeader } from "./site-header";
import { registerTestWindow } from "@/lib/test-window";

const params = vi.hoisted(() => ({ value: {} as { agentId?: string } }));
vi.mock("next/navigation", () => ({ useParams: () => params.value }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@/hooks/use-active-business", () => ({ useActiveBusiness: () => ({ business: null, businesses: { isLoading: false } }) }));
vi.mock("@/components/business-capabilities-provider", () => ({ useBusinessCan: () => () => true }));

/** Stands in for the browser's IntersectionObserver, so a test can scroll the page title in and out of view. */
class FakeIntersectionObserver {
  static current: FakeIntersectionObserver | null = null;
  constructor(private readonly callback: IntersectionObserverCallback) { FakeIntersectionObserver.current = this; }
  observe() {}
  disconnect() {}
  setVisible(isIntersecting: boolean) {
    act(() => this.callback([{ isIntersecting } as IntersectionObserverEntry], this as unknown as IntersectionObserver));
  }
}

function renderPage() {
  const heading = document.createElement("h1");
  heading.textContent = "Appointments";
  document.body.append(heading);
  const scrollContainerRef = createRef<HTMLElement>();
  render(<main ref={scrollContainerRef}><SiteHeader fixed scrollContainerRef={scrollContainerRef} titleHeading={heading} /></main>);
  const observer = FakeIntersectionObserver.current;
  if (!observer) throw new Error("Expected the header to watch the page title.");
  return { bar: document.querySelector<HTMLElement>('[data-slot="site-header-bar"]')!, observer };
}

beforeEach(() => { vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver); });
afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  FakeIntersectionObserver.current = null;
  params.value = {};
});

describe("SiteHeader", () => {
  it("keeps its bar hidden, from sight and screen readers, while the page title is in view", () => {
    let unregister = () => {};
    act(() => { unregister = registerTestWindow(vi.fn()); });
    const { bar, observer } = renderPage();
    observer.setVisible(true);
    expect(bar.getAttribute("aria-hidden")).toBe("true");
    expect(bar.className).toContain("invisible");
    expect(screen.queryByRole("button", { name: "testCall.trigger" })).toBeNull();
    act(() => unregister());
  });

  it("names the page and opens the test window from its bar once the title scrolls away", () => {
    params.value = { agentId: "agent-2" };
    const open = vi.fn();
    let unregister = () => {};
    act(() => { unregister = registerTestWindow(open); });
    const { bar, observer } = renderPage();
    observer.setVisible(true);
    observer.setVisible(false);
    expect(bar.getAttribute("aria-hidden")).toBeNull();
    expect(bar.className).not.toContain("invisible");
    expect(bar.querySelector("[data-page-title]")?.textContent).toBe("Appointments");
    fireEvent.click(screen.getByRole("button", { name: "testCall.trigger" }));
    expect(open).toHaveBeenCalledExactlyOnceWith({ agentId: "agent-2" });
    act(() => unregister());
  });

  it("shows no Test call button when the page has no test window", () => {
    const { bar, observer } = renderPage();
    observer.setVisible(false);
    expect(bar.getAttribute("aria-hidden")).toBeNull();
    expect(screen.queryByRole("button", { name: "testCall.trigger" })).toBeNull();
  });
});
