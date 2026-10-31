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

describe("rules loading states", () => {
  const skeletons = (selector: string) => document.querySelectorAll(`${selector} [data-slot="skeleton"]`).length;
  function renderPending({ workspace, role = "business_owner" }: { workspace: boolean; role?: string }) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    if (workspace) client.setQueryData(["businesses"], { businesses: [{ businessId: "business", active: true, role }] });
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    render(<QueryClientProvider client={client}><RulesSurface /></QueryClientProvider>);
  }

  it("shows the page title, the real column headings and placeholders for the header controls while the workspace loads", () => {
    renderPending({ workspace: false });
    expect(screen.getByRole("heading", { name: "sections.rules.title" })).toBeTruthy();
    expect(screen.queryByText("loading.workspace")).toBeNull();
    expect(screen.getByText("table.title")).toBeTruthy();
    expect(skeletons("tbody")).toBe(60);
    expect(screen.getByText("sections.rules.addKnowledge")).toBeTruthy();
    expect(screen.queryByPlaceholderText("table.searchPlaceholder")).toBeNull();
  });

  it("keeps the real header and shows placeholder rows, search, button and pagination while the rules load", () => {
    renderPending({ workspace: true });
    expect(screen.getByText("table.title")).toBeTruthy();
    expect(document.querySelector("tbody")?.getAttribute("aria-busy")).toBe("true");
    expect(skeletons("tbody")).toBe(60);
    expect(skeletons('[aria-hidden="true"]')).toBe(9);
    expect(screen.queryByText("sections.rules.emptyState")).toBeNull();
    expect(screen.queryByPlaceholderText("table.searchPlaceholder")).toBeNull();
    expect(screen.queryByRole("button", { name: /sections.rules.addKnowledge/ })).toBeNull();
  });

  it("leaves out the drag handle column and the add button for read-only members while the rules load", () => {
    renderPending({ workspace: true, role: "viewer" });
    expect(skeletons("tbody")).toBe(50);
    expect(screen.queryByText("sections.rules.addKnowledge")).toBeNull();
  });

  it("shows the search box and the add button together once the rules have loaded", () => {
    setup();
    expect(screen.getByPlaceholderText("table.searchPlaceholder")).toBeTruthy();
    expect(screen.getByRole("button", { name: /sections.rules.addKnowledge/ })).toBeTruthy();
    expect(skeletons("tbody")).toBe(0);
  });
});
