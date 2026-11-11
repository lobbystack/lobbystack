// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createRecordedBrowserTelemetry } from "@/lib/telemetry-testing";
import { ConversationThread, type ThreadMessage } from "./conversation-thread";

const telemetryRef = vi.hoisted(() => ({ current: null as ReturnType<typeof createRecordedBrowserTelemetry> | null }));
vi.mock("@/components/product-analytics", () => ({ useTelemetry: () => telemetryRef.current!.telemetry }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: "en" }, t: (key: string) => key }) }));
const toastError = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: { error: toastError } }));

const sms: ThreadMessage = { id: "m1", conversationId: "conversation-1", contactName: "Ada Caller", contactPhone: "+14155550100", visitorName: null, visitorEmail: null, channel: "sms", automationState: "ai_active", body: "Hello there", direction: "inbound", status: "delivered", createdAt: "2026-09-01T12:00:00Z" };
const waiting: ThreadMessage = { ...sms, contactName: null, contactPhone: null, visitorName: "Ada Visitor", channel: "web_chat", automationState: "human_handoff", teamRequestedAt: "2026-09-01T12:00:00Z", body: "Can I talk to someone?" };

const clients: QueryClient[] = [];
beforeEach(() => { telemetryRef.current = createRecordedBrowserTelemetry(); });
afterEach(() => { cleanup(); clients.forEach((client) => client.clear()); clients.length = 0; vi.unstubAllGlobals(); vi.clearAllMocks(); });

function setup(thread: ThreadMessage[], options: { textRepliesOn?: boolean; post?: () => Response } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  clients.push(client);
  client.setQueryData(["businesses"], { businesses: [{ businessId: "business", active: true }] });
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === "POST") return options.post?.() ?? Response.json({ ok: true });
    if (init?.method === "PATCH") return Response.json({ ok: true });
    return Response.json({ messages: thread, textRepliesOn: options.textRepliesOn ?? false });
  });
  vi.stubGlobal("fetch", fetchMock);
  render(<QueryClientProvider client={client}><ConversationThread conversationId="conversation-1" /></QueryClientProvider>);
  return fetchMock;
}

describe("a conversation in the Inbox", () => {
  it("reads the whole thread and records a reply once the server accepts it", async () => {
    const fetchMock = setup([sms]);
    expect(await screen.findByText("Hello there")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith("/api/messages?conversationId=conversation-1", expect.anything());
    await userEvent.type(screen.getByPlaceholderText("page.composerPlaceholderSms"), "On my way");
    await userEvent.click(screen.getByRole("button", { name: "page.send" }));
    await waitFor(() => telemetryRef.current!.expectEvent("web.messages.reply_sent", { businessId: "business", conversationId: "conversation-1", channel: "sms" }));
    expect(fetchMock).toHaveBeenCalledWith("/api/messages?businessId=business", expect.objectContaining({ method: "POST" }));
  });

  it("says why when the contact can't receive an SMS reply, and keeps the draft", async () => {
    setup([sms], { post: () => Response.json({ error: "You can't text this contact.", code: "sms_consent" }, { status: 409 }) });
    await userEvent.type(await screen.findByPlaceholderText("page.composerPlaceholderSms"), "On my way");
    await userEvent.click(screen.getByRole("button", { name: "page.send" }));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("page.smsReplyBlocked"));
    expect(screen.getByDisplayValue("On my way")).toBeTruthy();
  });

  it("offers Take over on a text conversation only once the agent answers texts", async () => {
    setup([sms]);
    await screen.findByText("Hello there");
    expect(screen.queryByRole("button", { name: "page.takeOver" })).toBeNull();
    cleanup();
    setup([sms], { textRepliesOn: true });
    expect(await screen.findByRole("button", { name: "page.takeOver" })).toBeTruthy();
  });

  it("lets the team join a chat whose visitor asked for a person", async () => {
    const fetchMock = setup([waiting]);
    expect(await screen.findByText("page.waitingTitle")).toBeTruthy();
    expect(screen.getByText("page.waitingDescription")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "page.joinChat" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/messages?businessId=business", expect.objectContaining({ method: "PATCH", body: JSON.stringify({ conversationId: "conversation-1", automationState: "human_handoff" }) })));
    expect(screen.getByRole("button", { name: "page.automationResumeAi" })).toBeTruthy();
  });

  it("isn't waiting once someone from the team has the chat", async () => {
    setup([{ ...waiting, teamRequestedAt: null, body: "Thanks!" }]);
    expect(await screen.findByText("page.automationHumanHandoff")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "page.joinChat" })).toBeNull();
  });

  it("holds the thread's shape while it loads", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    clients.push(client);
    client.setQueryData(["businesses"], { businesses: [{ businessId: "business", active: true }] });
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => undefined)));
    render(<QueryClientProvider client={client}><ConversationThread conversationId="conversation-1" /></QueryClientProvider>);
    expect(document.querySelector("[aria-busy='true']")?.querySelectorAll("[data-slot='skeleton']").length).toBeGreaterThan(0);
  });
});
