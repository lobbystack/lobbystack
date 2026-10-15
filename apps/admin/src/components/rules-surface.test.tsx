// @vitest-environment jsdom
import { cleanup, createEvent, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RulesSurface } from "./rules-surface";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: "en", resolvedLanguage: "en" }, t: (key: string) => key }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }), usePathname: () => "/agent/rules", useSearchParams: () => new URLSearchParams() }));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const rules = ["First", "Second", "Third"].map((title, sortOrder) => ({ id: title.toLowerCase(), title, content: `${title} rule`, active: true, sortOrder, createdAt: "2026-09-01T12:00:00Z" }));

function setup(role = "business_owner") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(["businesses"], { businesses: [{ businessId: "business", active: true, role }] });
  client.setQueryData(["rules", "business"], rules);
  const fetchMock = vi.fn(async () => Response.json(rules));
  vi.stubGlobal("fetch", fetchMock);
  render(<QueryClientProvider client={client}><RulesSurface /></QueryClientProvider>);
  return fetchMock;
}

function row(title: string): HTMLElement {
  return screen.getByText(title).closest("tr")!;
}

describe("rules drag and drop", () => {
  it("reorders a rule dropped below another through its grab handle", async () => {
    const fetchMock = setup();
    const first = row("First");
    const third = row("Third");
    third.getBoundingClientRect = () => ({ top: 0, height: 40, bottom: 40, left: 0, right: 0, width: 0, x: 0, y: 0, toJSON: () => ({}) });
    const dataTransfer = { setData: vi.fn(), effectAllowed: "", dropEffect: "" };

    fireEvent.pointerDown(first.querySelector("[title='actions.dragToReorder']")!);
    expect(first.getAttribute("draggable")).toBe("true");
    fireEvent.dragStart(first, { dataTransfer });
    // jsdom has no DragEvent, so the pointer position has to be set by hand.
    const dragOver = createEvent.dragOver(third, { dataTransfer });
    Object.defineProperty(dragOver, "clientY", { value: 30 });
    fireEvent(third, dragOver);
    fireEvent.drop(third, { dataTransfer });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/api/rules"), expect.objectContaining({ method: "PATCH", body: JSON.stringify({ ruleIds: ["second", "third", "first"] }) })));
  });

  it("keeps rows undraggable until the handle is held, and hides handles from read-only members", () => {
    setup();
    expect(row("First").getAttribute("draggable")).toBe("false");
    cleanup();
    setup("business_member");
    expect(screen.queryByTitle("actions.dragToReorder")).toBeNull();
  });
});
