// @vitest-environment jsdom
import type { ReactNode } from "react";
import { act, cleanup, fireEvent, render as renderView, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TestWindow } from "./test-window";
import { UpgradePlanDialogProvider } from "./upgrade-plan-dialog-context";
import { createRecordedBrowserTelemetry } from "@/lib/telemetry-testing";
import { openTestWindow } from "@/lib/test-window";

const startCall = vi.fn();
const forceEndCall = vi.fn();
const openUpgrade = vi.fn();
const voice = vi.hoisted(() => ({ props: null as null | Record<string, unknown>, onEvent: null as null | ((eventName: string, properties?: Record<string, unknown>) => void), onUpgrade: undefined as undefined | (() => void) }));
const telemetryRef = vi.hoisted(() => ({ current: null as ReturnType<typeof createRecordedBrowserTelemetry> | null }));
vi.mock("@/components/product-analytics", () => ({ useTelemetry: () => telemetryRef.current!.telemetry }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@/components/theme-provider", () => ({ useTheme: () => ({ resolvedTheme: "light" }) }));
vi.mock("@/components/web-voice/AuraVoiceDemo", () => ({
  AuraVoiceDemo: (props: { onEvent?: (eventName: string, properties?: Record<string, unknown>) => void; onRegisterControls?: (controls: { forceEndCall: () => Promise<void>; startCall: () => Promise<void> }) => void; onUpgrade?: () => void }) => {
    voice.props = props;
    voice.onEvent = props.onEvent ?? null;
    voice.onUpgrade = props.onUpgrade;
    props.onRegisterControls?.({ forceEndCall, startCall });
    return <div data-testid="aura-voice-demo" />;
  },
}));

const agent = { agentId: "agent-1", agentName: "Front desk", businessName: "Acme Dental", phoneNumber: null as string | null };
const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
  void input;
  return Response.json(agent);
});

let client: QueryClient;
beforeEach(() => {
  telemetryRef.current = createRecordedBrowserTelemetry();
  voice.props = null;
  voice.onUpgrade = undefined;
  agent.phoneNumber = null;
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(["billing", "business-1"], { effectivePlan: "pro" });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { cleanup(); client.clear(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

function render(ui: ReactNode) {
  return renderView(<QueryClientProvider client={client}><UpgradePlanDialogProvider onOpen={openUpgrade}>{ui}</UpgradePlanDialogProvider></QueryClientProvider>);
}
const testWindow = <TestWindow businessId="business-1" businessSlug="acme-dental" />;

describe("TestWindow", () => {
  it("renders nothing without a business slug", () => {
    const { container } = render(<TestWindow businessId="business-1" />);
    expect(container.firstChild).toBeNull();
  });

  it("opens from its button on the agent and workspace, without starting a call", async () => {
    render(testWindow);
    fireEvent.click(screen.getByRole("button", { name: "testCall.trigger" }));
    expect(await screen.findByRole("heading", { name: "Front desk" })).toBeTruthy();
    expect(screen.getByText("Acme Dental")).toBeTruthy();
    expect(screen.getByTestId("aura-voice-demo")).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "testWindow.message" })).toBeTruthy();
    expect(startCall).not.toHaveBeenCalled();
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("/api/agent/test-window?businessId=business-1");
  });

  it("opens on the agent it's given, and the call answers as that agent", async () => {
    render(testWindow);
    act(() => { expect(openTestWindow({ agentId: "agent-2" })).toBe(true); });
    await screen.findByRole("heading", { name: "Front desk" });
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("/api/agent/test-window?businessId=business-1&agentId=agent-2");
    await expect((voice.props!.getStartPayload as () => Promise<unknown>)()).resolves.toEqual({ agentId: "agent-2" });
  });

  it("sends no agent for the default agent's call", async () => {
    render(testWindow);
    act(() => { openTestWindow(); });
    await screen.findByRole("heading", { name: "Front desk" });
    expect(voice.props!.getStartPayload).toBeUndefined();
    expect(voice.props).toMatchObject({ businessSlug: "acme-dental", endpoint: "/api/voice/live/session?businessId=business-1", widgetId: "lobbystack-dashboard-test-call" });
  });

  it("can't open once the window is gone", () => {
    const { unmount } = render(testWindow);
    unmount();
    expect(openTestWindow()).toBe(false);
  });

  it("shows the agent's number when it has an active one", async () => {
    agent.phoneNumber = "+14165550111";
    render(testWindow);
    act(() => { openTestWindow(); });
    expect(await screen.findByText("testWindow.orCall")).toBeTruthy();
    expect(screen.getByRole("link").getAttribute("href")).toBe("tel:+14165550111");
  });

  it("leaves the number row out when the agent has none", async () => {
    render(testWindow);
    act(() => { openTestWindow(); });
    await screen.findByRole("heading", { name: "Front desk" });
    expect(screen.queryByText("testWindow.orCall")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("ends the call and closes on Escape", async () => {
    render(testWindow);
    act(() => { openTestWindow(); });
    fireEvent.keyDown(await screen.findByRole("dialog"), { key: "Escape", code: "Escape" });
    await waitFor(() => expect(forceEndCall).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("ends the call and closes with the X", async () => {
    render(testWindow);
    act(() => { openTestWindow(); });
    await screen.findByRole("dialog");
    fireEvent.click(screen.getAllByRole("button").find((button) => button.getAttribute("data-slot") === "dialog-close")!);
    await waitFor(() => expect(forceEndCall).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("forwards web voice telemetry with the active business", async () => {
    render(testWindow);
    act(() => { openTestWindow(); });
    await screen.findByRole("dialog");
    act(() => voice.onEvent?.("web.voice.test_call_started", { widgetId: "lobbystack-dashboard-test-call" }));
    telemetryRef.current!.expectEvent("web.voice.test_call_started", { businessId: "business-1" });
  });
});

// A reply in the AI SDK's UI message stream.
function replying(text: string): Response {
  const chunks = [{ type: "start", messageId: "reply" }, { type: "text-start", id: "t" }, { type: "text-delta", id: "t", delta: text }, { type: "text-end", id: "t" }, { type: "finish" }];
  return new Response(`${chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("")}data: [DONE]\n\n`, { headers: { "content-type": "text/event-stream", "x-vercel-ai-ui-message-stream": "v1" } });
}

describe("the test chat", () => {
  const chatCalls = () => fetchMock.mock.calls.filter(([url]) => String(url).startsWith("/api/agent/test-chat"));

  it("sends the agent and the chat so far, and shows the reply", async () => {
    fetchMock.mockImplementation(async (input) => String(input).startsWith("/api/agent/test-chat") ? replying("We open at nine.") : Response.json(agent));
    render(testWindow);
    act(() => { openTestWindow({ agentId: "agent-2" }); });
    await userEvent.type(await screen.findByRole("textbox", { name: "testWindow.message" }), "When do you open?{Enter}");
    expect(await screen.findByText("We open at nine.")).toBeTruthy();

    await userEvent.type(screen.getByRole("textbox", { name: "testWindow.message" }), "Thanks{Enter}");
    await waitFor(() => expect(chatCalls()).toHaveLength(2));
    expect(String(chatCalls()[1]?.[0])).toBe("/api/agent/test-chat?businessId=business-1");
    expect(JSON.parse(String(chatCalls()[1]?.[1]?.body))).toEqual({
      agentId: "agent-2",
      messages: [{ role: "user", content: "When do you open?" }, { role: "assistant", content: "We open at nine." }, { role: "user", content: "Thanks" }],
    });
    fetchMock.mockReset();
    fetchMock.mockImplementation(async () => Response.json(agent));
  });

  it("says when a message didn't go through", async () => {
    fetchMock.mockImplementation(async (input) => String(input).startsWith("/api/agent/test-chat") ? Response.json({ code: "ai_provider_unavailable" }, { status: 503 }) : Response.json(agent));
    render(testWindow);
    act(() => { openTestWindow(); });
    await userEvent.type(await screen.findByRole("textbox", { name: "testWindow.message" }), "Hello{Enter}");
    expect(await screen.findByText("testWindow.sendFailed")).toBeTruthy();
    fetchMock.mockReset();
    fetchMock.mockImplementation(async () => Response.json(agent));
  });

  it("starts over when the window closes", async () => {
    fetchMock.mockImplementation(async (input) => String(input).startsWith("/api/agent/test-chat") ? replying("We open at nine.") : Response.json(agent));
    render(testWindow);
    act(() => { openTestWindow(); });
    await userEvent.type(await screen.findByRole("textbox", { name: "testWindow.message" }), "When do you open?{Enter}");
    await screen.findByText("We open at nine.");
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape", code: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    act(() => { openTestWindow(); });
    await screen.findByRole("dialog");
    expect(screen.queryByText("We open at nine.")).toBeNull();
    fetchMock.mockReset();
    fetchMock.mockImplementation(async () => Response.json(agent));
  });
});

describe("upgrading from a used-up test call", () => {
  it("offers a free workspace the plans, closing the call first", async () => {
    client.setQueryData(["billing", "business-1"], { effectivePlan: "free_cloud" });
    render(testWindow);
    act(() => { openTestWindow(); });
    await screen.findByRole("dialog");

    act(() => voice.onUpgrade!());

    expect(openUpgrade).toHaveBeenCalledOnce();
    expect(forceEndCall).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("offers nothing to a paid workspace, which has no plan to buy", async () => {
    render(testWindow);
    act(() => { openTestWindow(); });
    await screen.findByRole("dialog");
    expect(voice.onUpgrade).toBeUndefined();
  });

  it("offers nothing where no plan dialog is mounted", async () => {
    client.setQueryData(["billing", "business-1"], { effectivePlan: "free_cloud" });
    renderView(<QueryClientProvider client={client}>{testWindow}</QueryClientProvider>);
    act(() => { openTestWindow(); });
    await screen.findByRole("dialog");
    expect(voice.onUpgrade).toBeUndefined();
  });
});
