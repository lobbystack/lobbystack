// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({
  i18n: { language: "en" },
  t: (key: string) => key,
}) }));
vi.mock("@/components/audio/call-recording-player", () => ({ CallRecordingPlayer: () => null }));
vi.mock("@/lib/locale", () => ({ formatDateTime: (value: string) => value }));

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
    })) });
    return Response.json({ businesses: [{ businessId, active: true }] });
  });
  vi.stubGlobal("fetch", fetchMock);
  const clients = Array.from({ length: 2 }, () => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
  for (const client of clients) render(<QueryClientProvider client={client}><LiveCallsSurface /></QueryClientProvider>);

  await waitFor(() => expect(screen.getAllByText("0")).toHaveLength(2));
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
