// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createRecordedBrowserTelemetry } from "@/lib/telemetry-testing";
import { BusinessCapabilitiesProvider } from "@/components/business-capabilities-provider";
import type { InboxItem } from "./inbox-data";

const route = vi.hoisted(() => ({ search: "", router: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() } }));
const telemetryRef = vi.hoisted(() => ({ current: null as ReturnType<typeof createRecordedBrowserTelemetry> | null }));
vi.mock("next/navigation", () => ({ usePathname: () => "/inbox", useRouter: () => route.router, useSearchParams: () => new URLSearchParams(route.search) }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: "en" }, t: (key: string, values?: Record<string, unknown>) => values?.name ? `${key}:${String(values.name)}` : key }), Trans: ({ i18nKey, values, components }: { i18nKey: string; values: { name: string }; components: { agent: React.ReactElement } }) => <>{i18nKey} <components.agent.type {...(components.agent.props as object)}>{values.name}</components.agent.type></> }));
vi.mock("@/components/product-analytics", () => ({ useTelemetry: () => telemetryRef.current!.telemetry }));
vi.mock("@/lib/realtime-query", () => ({ subscribeRealtimeQuery: () => () => {} }));
vi.mock("@/components/live-call-detail-surface", () => ({ LiveCallDetailSurface: ({ callId, embedded }: { callId: string; embedded?: boolean }) => <p>{`call ${callId}${embedded ? " embedded" : ""}`}</p> }));
vi.mock("./conversation-thread", () => ({ ConversationThread: ({ conversationId }: { conversationId: string }) => <p>{`thread ${conversationId}`}</p> }));

import { InboxPage } from "./inbox-page";

const FRONT = "00000000-0000-4000-8000-000000000001";
const EVENING = "00000000-0000-4000-8000-000000000002";
const item = (overrides: Partial<InboxItem>): InboxItem => ({ key: "call:k1", kind: "call", id: "k1", channel: "phone_call", agent: { id: FRONT, name: "Front desk" }, contactName: "Marie", contactPhone: "+15145550100", contactEmail: null, preview: "Asked about fillings", outcome: { kind: "summary", summary: "Asked about fillings" }, status: "completed", automationState: null, occurredAt: "2030-01-08T14:00:00Z", ...overrides });
const items = [item({}), item({ key: "conversation:c1", kind: "conversation", id: "c1", channel: "web_chat", agent: { id: EVENING, name: "Evening" }, contactName: "Visitor", preview: "Do you have parking?", outcome: null })];
const twoAgents = [{ id: FRONT, name: "Front desk" }, { id: EVENING, name: "Evening" }];

const clients: QueryClient[] = [];
beforeEach(() => { telemetryRef.current = createRecordedBrowserTelemetry(); route.search = ""; });
afterEach(() => { cleanup(); clients.forEach((client) => client.clear()); clients.length = 0; vi.unstubAllGlobals(); vi.clearAllMocks(); });

function setup(options: { agents?: typeof twoAgents; capabilities?: Array<"activity" | "setup">; respond?: (url: URL) => unknown } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  clients.push(client);
  client.setQueryData(["businesses"], { businesses: [{ businessId: "business", active: true }] });
  const fetchMock = vi.fn(async (url: string) => {
    const body = options.respond?.(new URL(url, "http://admin.test")) ?? { items, nextCursor: null, agents: options.agents ?? twoAgents, instagramOffered: false };
    return body instanceof Promise ? await body as Response : Response.json(body);
  });
  vi.stubGlobal("fetch", fetchMock);
  render(<QueryClientProvider client={client}><BusinessCapabilitiesProvider initial={options.capabilities ?? ["activity", "setup"]}><InboxPage /></BusinessCapabilitiesProvider></QueryClientProvider>);
  return fetchMock;
}

describe("the Inbox", () => {
  it("lists calls and chats with the agent that handled each, and links each to its detail", async () => {
    setup();
    const call = await screen.findByRole("link", { name: /Marie/ });
    expect(call.getAttribute("href")).toBe("/inbox?call=k1");
    expect(within(call).getByText("Front desk")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Visitor/ }).getAttribute("href")).toBe("/inbox?conversation=c1");
    expect(screen.getByRole("combobox", { name: "inbox:filters.agent" })).toBeTruthy();
  });

  it("leaves agent names and the agent filter out with one agent", async () => {
    setup({ agents: [twoAgents[0]!] });
    const call = await screen.findByRole("link", { name: /Marie/ });
    expect(within(call).queryByText("Front desk")).toBeNull();
    expect(screen.queryByRole("combobox", { name: "inbox:filters.agent" })).toBeNull();
  });

  it("asks the API for what the URL filters and changes the URL to filter", async () => {
    route.search = `channel=phone_call&agent=${FRONT}&status=open`;
    const fetchMock = setup();
    await screen.findByRole("link", { name: /Marie/ });
    expect(fetchMock).toHaveBeenCalledWith(`/api/inbox?limit=50&channel=phone_call&agentId=${FRONT}&status=open`, expect.anything());
    await userEvent.click(screen.getByRole("button", { name: "inbox:filters.open" }));
    expect(route.router.replace).toHaveBeenLastCalledWith(`/inbox?channel=phone_call&agent=${FRONT}`, { scroll: false });
    await userEvent.click(screen.getByRole("button", { name: "inbox:filters.all" }));
    expect(route.router.replace).toHaveBeenLastCalledWith(`/inbox?agent=${FRONT}`, { scroll: false });
  });

  it("shows Instagram as a channel only when this server offers it", async () => {
    setup();
    await screen.findByRole("link", { name: /Marie/ });
    expect(screen.queryByRole("button", { name: "common:channels.instagram" })).toBeNull();
    cleanup();
    setup({ respond: () => ({ items, nextCursor: null, agents: twoAgents, instagramOffered: true }) });
    expect(await screen.findByRole("button", { name: "common:channels.instagram" })).toBeTruthy();
  });

  it("records opening a conversation", async () => {
    setup();
    await userEvent.click(await screen.findByRole("link", { name: /Visitor/ }));
    telemetryRef.current!.expectEvent("web.messages.thread_opened", { businessId: "business", conversationId: "c1", channel: "web_chat" });
  });

  it("opens the call from the URL inside the Inbox, and links its agent for someone who sets agents up", async () => {
    route.search = "call=k1";
    setup();
    expect(await screen.findByText("call k1 embedded")).toBeTruthy();
    await waitFor(() => expect(screen.getByRole("link", { name: "Front desk" }).getAttribute("href")).toBe(`/agents/${FRONT}`));
    expect(screen.getByLabelText("inbox:back").getAttribute("href")).toBe("/inbox");
  });

  it("names the agent without a link for someone who only sees activity", async () => {
    route.search = "conversation=c1";
    setup({ capabilities: ["activity"] });
    expect(await screen.findByText("thread c1")).toBeTruthy();
    await waitFor(() => expect(screen.getByText("Evening", { selector: "p span" })).toBeTruthy());
    expect(screen.queryByRole("link", { name: "Evening" })).toBeNull();
  });

  it("shows placeholders while it loads, and says when there's nothing yet or nothing matches", async () => {
    setup({ respond: () => new Promise(() => undefined) });
    expect(document.querySelector("[aria-busy='true']")?.querySelectorAll("[data-slot='skeleton']").length).toBeGreaterThan(0);
    cleanup();
    setup({ respond: () => ({ items: [], nextCursor: null, agents: twoAgents }) });
    expect(await screen.findByText("inbox:empty")).toBeTruthy();
    cleanup();
    route.search = "status=open";
    setup({ respond: () => ({ items: [], nextCursor: null, agents: twoAgents }) });
    expect(await screen.findByText("inbox:noMatch")).toBeTruthy();
  });

  it("loads the next page with the cursor", async () => {
    const fetchMock = setup({ respond: (url) => url.searchParams.get("cursor") ? { items: [item({ key: "call:k2", id: "k2", contactName: "Ana" })], nextCursor: null, agents: twoAgents } : { items, nextCursor: "next", agents: twoAgents } });
    await userEvent.click(await screen.findByRole("button", { name: "inbox:loadMore" }));
    expect(await screen.findByRole("link", { name: /Ana/ })).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith("/api/inbox?limit=50&cursor=next", expect.anything());
  });
});
