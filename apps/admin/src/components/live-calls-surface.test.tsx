// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({
  i18n: { language: "en" },
  t: (key: string) => key,
}) }));
vi.mock("@/components/audio/call-recording-player", () => ({ CallRecordingPlayer: () => null }));
vi.mock("@/lib/locale", () => ({ formatDateTime: (value: string) => value, intlLocale: (value: string) => value }));

import { LiveCallsSurface } from "./live-calls-surface";

const businessId = "60d4ca3b-6984-4dfd-befb-f7e264e98c46";
const sources: FakeEventSource[] = [];
class FakeEventSource {
  handlers = new Map<string, Array<(event: MessageEvent<string>) => void>>();
  constructor(_url: string) { sources.push(this); }
  addEventListener(type: string, handler: (event: MessageEvent<string>) => void) {
    this.handlers.set(type, [...(this.handlers.get(type) ?? []), handler]);
  }
  close() {}
  emit(type: string) {
    const event = new MessageEvent(type, { data: JSON.stringify({
      id: crypto.randomUUID(), type, businessId, entityId: crypto.randomUUID(),
      occurredAt: new Date().toISOString(), payload: {}, trace: {},
    }) });
    for (const handler of this.handlers.get(type) ?? []) handler(event);
  }
}

afterEach(() => {
  cleanup();
  sources.length = 0;
  vi.unstubAllGlobals();
});

it("shows confirmed live sessions and updates via SSE instead of counting stale started rows", async () => {
  vi.stubGlobal("EventSource", FakeEventSource);
  let count: number | null = 0;
  const fetchMock = vi.fn(async (url: string) => {
    if (url.startsWith("/api/calls/active")) return count === null
      ? Response.json({ error: "unavailable" }, { status: 503 })
      : Response.json({ active: count });
    if (url.startsWith("/api/calls?")) return Response.json({ calls: Array.from({ length: 7 }, (_, i) => ({
      id: crypto.randomUUID(), status: "started", startedAt: "2026-09-21T12:00:00.000Z",
      contactName: `Caller ${i}`, contactPhone: null, reason: null, disposition: null,
      transcriptPreview: null, outcome: { kind: "none" }, recordingState: "missing", providerDurationSeconds: null,
    })), pagination: { total: 7 } });
    return Response.json({ businesses: [{ businessId, active: true }] });
  });
  vi.stubGlobal("fetch", fetchMock);
  const clients = Array.from({ length: 2 }, () => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
  for (const client of clients) render(<QueryClientProvider client={client}><LiveCallsSurface /></QueryClientProvider>);

  await waitFor(() => expect(screen.getAllByText("0")).toHaveLength(2));
  // The count sits beside the page heading, so the heading stays just the title as the count changes.
  for (const heading of screen.getAllByRole("heading", { level: 1 })) {
    expect(heading.textContent).toBe("page.title");
    expect(heading.querySelector("div, span")).toBeNull();
    expect(heading.parentElement?.textContent).toBe("page.title0");
  }
  expect(screen.getAllByTestId("live-call-indicator")).toHaveLength(2);
  for (const indicator of screen.getAllByTestId("live-call-indicator")) {
    expect(indicator.querySelector(".bg-emerald-500")).not.toBeNull();
    expect(indicator.querySelector(".animate-ping")).toBeNull();
  }
  expect(screen.getAllByText("Caller 0")).toHaveLength(2);
  expect(sources).toHaveLength(2);
  count = 2;
  for (const source of sources) source.emit("call.updated");
  await waitFor(() => expect(screen.getAllByText("2")).toHaveLength(2));
  for (const indicator of screen.getAllByTestId("live-call-indicator")) {
    expect(indicator.querySelector(".animate-ping")).not.toBeNull();
  }
  act(() => {
    for (const client of clients) client.setQueryData(["active-calls", businessId], { active: 2 }, { updatedAt: Date.now() - 30_000 });
  });
  await waitFor(() => expect(screen.getAllByText("page.liveUnavailable")).toHaveLength(2));
  count = null;
  for (const source of sources) source.emit("call.completed");
  await waitFor(() => expect(screen.getAllByText("page.liveUnavailable")).toHaveLength(2));
  for (const indicator of screen.getAllByTestId("live-call-indicator")) {
    expect(indicator.querySelector(".bg-muted-foreground")).not.toBeNull();
    expect(indicator.querySelector(".animate-ping")).toBeNull();
  }
  for (const client of clients) client.clear();
});

it("searches and pages calls on the server so calls older than the first page stay reachable", async () => {
  vi.stubGlobal("EventSource", FakeEventSource);
  const fetchMock = vi.fn(async (url: string) => {
    if (url.startsWith("/api/calls/active")) return Response.json({ active: 0 });
    if (url.startsWith("/api/calls?")) return Response.json({ calls: Array.from({ length: 10 }, (_, i) => ({
      id: crypto.randomUUID(), status: "completed", startedAt: "2026-09-21T12:00:00.000Z",
      contactName: `Caller ${i}`, contactPhone: null, reason: null, disposition: null,
      transcriptPreview: null, outcome: { kind: "none" }, recordingState: "missing", providerDurationSeconds: null,
    })), pagination: { total: 120 } });
    return Response.json({ businesses: [{ businessId, active: true }] });
  });
  vi.stubGlobal("fetch", fetchMock);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><LiveCallsSurface /></QueryClientProvider>);
  const callUrls = () => fetchMock.mock.calls.map(([url]) => url).filter((url) => url.startsWith("/api/calls?"));

  await waitFor(() => expect(screen.getByText("pagination.nextPage")).toBeTruthy());
  expect(callUrls()[0]).toBe("/api/calls?limit=10&offset=0&search=");
  fireEvent.click(screen.getByText("pagination.nextPage").closest("button")!);
  await waitFor(() => expect(callUrls()).toContain("/api/calls?limit=10&offset=10&search="));

  // Typing a name sends one search, and the table stays on screen while it loads.
  for (const value of ["J", "Ja", "Jan", "Jane"]) fireEvent.change(screen.getByPlaceholderText("filters.searchPlaceholder"), { target: { value } });
  expect(screen.getByText("pagination.nextPage")).toBeTruthy();
  await waitFor(() => expect(callUrls()).toContain("/api/calls?limit=10&offset=0&search=Jane"));
  expect(callUrls().filter((url) => /search=J/.test(url))).toEqual(["/api/calls?limit=10&offset=0&search=Jane"]);
  client.clear();
});

it("keeps the table header and shows placeholder rows, with no empty state or live status, while data loads", () => {
  vi.stubGlobal("EventSource", FakeEventSource);
  vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><LiveCallsSurface /></QueryClientProvider>);

  expect(screen.getByText("table.caller")).toBeTruthy();
  expect(document.querySelectorAll("tbody [data-slot=\"skeleton\"]").length).toBe(50);
  expect(document.querySelector("tbody")?.getAttribute("aria-busy")).toBe("true");
  expect(screen.queryByText("table.empty")).toBeNull();
  expect(screen.queryByPlaceholderText("filters.searchPlaceholder")).toBeNull();
  expect(document.querySelectorAll("[aria-hidden=\"true\"] [data-slot=\"skeleton\"]").length).toBe(9);
  expect(screen.queryByText("page.liveUnavailable")).toBeNull();
  expect(screen.queryByTestId("live-call-indicator")).toBeNull();
});
