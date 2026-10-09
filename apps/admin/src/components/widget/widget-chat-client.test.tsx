// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: "en", changeLanguage: vi.fn() }, t: (key: string) => key }) }));
vi.mock("@lobbystack/web-voice", () => ({ useWebVoiceCall: vi.fn() }));

import { WidgetChatClient } from "./widget-chat-client";

const visitorId = "5ef3b4ef-720d-47a7-8320-e6f4707a64e2";
const config = { key: "widget-key", business: { id: "business", name: "Acme", defaultLocale: "en" }, config: {}, billing: { chatAllowed: true, plan: "starter" }, snapshotPresent: true };
const visitorMessage = { id: "m1", role: "user", content: "Can someone call me?" };
const teamReply = { id: "m2", role: "assistant", content: "Sure, I will call you in five minutes." };

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("widget chat after a team member takes over", () => {
  it("shows the banner from history and picks up the team's reply without a reload", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
    Element.prototype.scrollTo = () => {};
    const history = vi.fn()
      .mockResolvedValueOnce({ automationState: "human_handoff", messages: [visitorMessage] })
      .mockResolvedValue({ automationState: "human_handoff", messages: [visitorMessage, teamReply] });
    vi.stubGlobal("fetch", vi.fn(async (url: URL | string) => String(url).includes("/api/widget/history") ? Response.json(await history()) : Response.json(config)));

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><WidgetChatClient widgetKey="widget-key" /></QueryClientProvider>);
    act(() => {
      window.dispatchEvent(new MessageEvent("message", { source: window, origin: "https://business.test", data: { type: "session", token: "token", parentOrigin: "https://business.test", visitorId } }));
    });

    expect(await screen.findByText("chat.handoffBanner")).toBeTruthy();
    expect(screen.queryByText(teamReply.content)).toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(45_000);
    });
    expect(await screen.findByText(teamReply.content)).toBeTruthy();
    client.clear();
  });
});
