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
const toastError = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: { error: toastError } }));

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

  it("says why when the contact can't receive an SMS reply", async () => {
    const fetchMock = setup();
    const listAndThread = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (url, init) => init?.method === "POST" ? Response.json({ error: "You can't text this contact.", code: "sms_consent" }, { status: 409 }) : listAndThread(url, init));
    await userEvent.click(await screen.findByRole("button", { name: /Ada Caller/ }));
    await userEvent.type(screen.getByPlaceholderText("page.composerPlaceholderSms"), "On my way");
    await userEvent.click(screen.getByRole("button", { name: "page.send" }));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("page.smsReplyBlocked"));
    expect(screen.getByDisplayValue("On my way")).toBeTruthy();
  });
});

describe("messages inbox paging", () => {
  it("loads older conversations page by page and fetches the whole thread of the one you open", async () => {
    const row = (id: string, conversationId: string, contactName: string, body: string, createdAt: string) => ({ id, conversationId, contactName, contactPhone: null, visitorName: null, visitorEmail: null, channel: "web_chat", automationState: "human_handoff", body, direction: "inbound", status: "delivered", createdAt });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    clients.push(client);
    client.setQueryData(["businesses"], { businesses: [{ businessId: "business", active: true }] });
    const fetchMock = vi.fn(async (url: string) => {
      const params = new URL(url, "http://admin.test").searchParams;
      if (params.get("conversationId") === "older") return Response.json({ messages: [row("m-first", "older", "Old Visitor", "Can a human call me?", "2026-09-01T09:00:00Z"), row("m-last", "older", "Old Visitor", "Thanks", "2026-09-01T09:01:00Z")] });
      if (params.get("offset") === "50") return Response.json({ messages: [row("m-last", "older", "Old Visitor", "Thanks", "2026-09-01T09:01:00Z")], hasNext: false });
      return Response.json({ messages: [row("m-new", "newer", "New Visitor", "Hi", "2026-09-02T12:00:00Z")], hasNext: true });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<QueryClientProvider client={client}><LiveMessagesSurface /></QueryClientProvider>);

    await screen.findByRole("button", { name: /New Visitor/ });
    expect(screen.queryByRole("button", { name: /Old Visitor/ })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "page.loadMore" }));
    await userEvent.click(await screen.findByRole("button", { name: /Old Visitor/ }));

    expect(await screen.findByText("Can a human call me?")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith("/api/messages?limit=50&offset=50&channel=all&search=", expect.anything());
    expect(fetchMock).toHaveBeenCalledWith("/api/messages?conversationId=older", expect.anything());
  });
});

describe("a website visitor waiting for a person", () => {
  it("is marked in the list, and Join chat takes the chat for the team", async () => {
    const waiting = { id: "m1", conversationId: "conversation-1", contactName: null, contactPhone: null, visitorName: "Ada Visitor", visitorEmail: null, channel: "web_chat", automationState: "human_handoff", teamRequestedAt: "2026-09-01T12:00:00Z", body: "Can I talk to someone?", direction: "inbound", status: "delivered", createdAt: "2026-09-01T12:00:00Z" };
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    clients.push(client);
    client.setQueryData(["businesses"], { businesses: [{ businessId: "business", active: true }] });
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => init?.method === "PATCH" ? Response.json({ ok: true }) : Response.json({ messages: [waiting], hasNext: false }));
    vi.stubGlobal("fetch", fetchMock);
    render(<QueryClientProvider client={client}><LiveMessagesSurface /></QueryClientProvider>);

    await userEvent.click(await screen.findByRole("button", { name: /Ada Visitor.*page\.waitingBadge/ }));
    expect(screen.getByText("page.waitingTitle")).toBeTruthy();
    expect(screen.getByText("page.waitingDescription")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "page.joinChat" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/messages?businessId=business", expect.objectContaining({ method: "PATCH", body: JSON.stringify({ conversationId: "conversation-1", automationState: "human_handoff" }) })));
    expect(screen.getByRole("button", { name: "page.automationResumeAi" })).toBeTruthy();
  });

  it("isn't marked once someone from the team has the chat", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    clients.push(client);
    client.setQueryData(["businesses"], { businesses: [{ businessId: "business", active: true }] });
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ messages: [{ id: "m1", conversationId: "conversation-1", contactName: null, contactPhone: null, visitorName: "Ada Visitor", visitorEmail: null, channel: "web_chat", automationState: "human_handoff", teamRequestedAt: null, body: "Thanks!", direction: "inbound", status: "delivered", createdAt: "2026-09-01T12:00:00Z" }], hasNext: false })));
    render(<QueryClientProvider client={client}><LiveMessagesSurface /></QueryClientProvider>);

    await userEvent.click(await screen.findByRole("button", { name: /Ada Visitor/ }));
    expect(screen.queryByText("page.waitingBadge")).toBeNull();
    expect(screen.queryByRole("button", { name: "page.joinChat" })).toBeNull();
    expect(screen.getByText("page.automationHumanHandoff")).toBeTruthy();
  });
});
