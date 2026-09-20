// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LiveMessagesSurface } from "./live-messages-surface";
import { createRecordedBrowserTelemetry } from "@/lib/telemetry-testing";

const telemetryRef = vi.hoisted(() => ({ current: null as ReturnType<typeof createRecordedBrowserTelemetry> | null }));
vi.mock("@/components/product-analytics", () => ({ useTelemetry: () => telemetryRef.current!.telemetry }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: "en" }, t: (key: string) => key }) }));
vi.mock("@/lib/realtime-query", () => ({ subscribeRealtimeQuery: () => () => {} }));

const clients: QueryClient[] = [];
beforeEach(() => {
  telemetryRef.current = createRecordedBrowserTelemetry();
  vi.stubGlobal("localStorage", { getItem: () => "en", setItem: vi.fn() });
  vi.stubGlobal("EventSource", class { addEventListener() {} close() {} });
});
afterEach(() => { cleanup(); clients.forEach((client) => client.clear()); clients.length = 0; vi.unstubAllGlobals(); vi.clearAllMocks(); });

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  clients.push(client);
  client.setQueryData(["businesses"], { businesses: [{ businessId: "business", active: true }] });
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (String(url).startsWith("/api/messages") && init?.method === "POST") return Response.json({ ok: true });
    if (String(url).startsWith("/api/messages")) return Response.json({ messages: [{ id: "m1", conversationId: "conversation-1", contactName: "Ada Caller", contactPhone: "+14155550100", visitorName: null, visitorEmail: null, channel: "sms", automationState: "ai_active", body: "Hello there", direction: "inbound", status: "delivered", createdAt: "2026-09-01T12:00:00Z" }] });
    return Response.json({});
  });
  vi.stubGlobal("fetch", fetchMock);
  render(<QueryClientProvider client={client}><LiveMessagesSurface /></QueryClientProvider>);
  return fetchMock;
}

describe("messages telemetry", () => {
  it("records thread_opened with the conversation and channel when a thread is selected", async () => {
    setup();
    await userEvent.click(await screen.findByRole("button", { name: /Ada Caller/ }));
    telemetryRef.current!.expectEvent("web.messages.thread_opened", { businessId: "business", conversationId: "conversation-1", channel: "sms" });
  });

  it("records reply_sent after the operator message is accepted", async () => {
    const fetchMock = setup();
    await userEvent.click(await screen.findByRole("button", { name: /Ada Caller/ }));
    await userEvent.type(screen.getByPlaceholderText("page.composerPlaceholderSms"), "On my way");
    await userEvent.click(screen.getByRole("button", { name: "page.send" }));
    await waitFor(() => telemetryRef.current!.expectEvent("web.messages.reply_sent", { businessId: "business", conversationId: "conversation-1", channel: "sms" }));
    expect(fetchMock).toHaveBeenCalledWith("/api/messages?businessId=business", expect.objectContaining({ method: "POST" }));
  });
});
