// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: "en", changeLanguage: vi.fn() }, t: (key: string, options?: { id?: string; name?: string }) => [key, options?.id, options?.name].filter(Boolean).join(" ") }) }));
vi.mock("@lobbystack/web-voice", () => ({ useWebVoiceCall: vi.fn() }));

import { useWebVoiceCall } from "@lobbystack/web-voice";
import { threadEntries, WidgetChatClient } from "./widget-chat-client";
import { readableOn } from "./widget-parts";

const visitorId = "5ef3b4ef-720d-47a7-8320-e6f4707a64e2";
const config = { key: "widget-key", business: { id: "business", name: "Acme", defaultLocale: "en" }, config: {}, billing: { chatAllowed: true, plan: "starter" }, snapshotPresent: true };
const visitorMessage = { id: "m1", role: "user", content: "Can someone call me?" };
const teamReply = { id: "m2", role: "assistant", content: "Sure, I will call you in five minutes." };

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** A response the test sends when it chooses. */
function held() {
  let send: (response: Response) => void = () => {};
  const response = new Promise<Response>((resolve) => { send = resolve; });
  return { response, send: (value: Response) => send(value) };
}

/** The chat route's answer, streamed as the receptionist writes it. */
function streamedReply(text: string) {
  return createUIMessageStreamResponse({
    stream: createUIMessageStream({
      execute: ({ writer }) => {
        writer.write({ type: "start", messageId: "a1" });
        writer.write({ type: "text-start", id: "a1" });
        writer.write({ type: "text-delta", id: "a1", delta: text });
        writer.write({ type: "text-end", id: "a1" });
        writer.write({ type: "finish", finishReason: "stop" });
      },
    }),
  });
}

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
    // The poll starts in an effect, which can run just after the banner shows.
    await vi.waitFor(() => expect(vi.getTimerCount()).toBe(1));

    await act(async () => {
      vi.advanceTimersByTime(45_000);
    });
    // The poll's fetch and refetch run on real timers, which a loaded CI runner can stretch past the 1s default.
    expect(await screen.findByText(teamReply.content, {}, { timeout: 5_000 })).toBeTruthy();
    client.clear();
  });
});

describe("widget live chat with the team", () => {
  function openChat(historyPayload: object) {
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
    Element.prototype.scrollTo = () => {};
    vi.stubGlobal("fetch", vi.fn(async (url: URL | string) => String(url).includes("/api/widget/history") ? Response.json(historyPayload) : Response.json(config)));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><WidgetChatClient widgetKey="widget-key" /></QueryClientProvider>);
    act(() => {
      window.dispatchEvent(new MessageEvent("message", { source: window, origin: "https://business.test", data: { type: "session", token: "token", parentOrigin: "https://business.test", visitorId } }));
    });
    return client;
  }

  it("tells a visitor who asked for a person that the team was asked to join", async () => {
    const client = openChat({ automationState: "human_handoff", waitingForTeam: true, teamMemberName: null, messages: [visitorMessage, { id: "m2", role: "assistant", content: "I've let the team know." }] });

    expect(await screen.findByText("chat.waitingForTeam")).toBeTruthy();
    expect(screen.queryByText("chat.handoffBanner")).toBeNull();
    expect(screen.queryByText(/chat\.teamJoined/)).toBeNull();
    client.clear();
  });

  it("shows who from the team joined, with their name on their messages", async () => {
    const client = openChat({
      automationState: "human_handoff",
      waitingForTeam: false,
      teamMemberName: "Yuri",
      messages: [
        visitorMessage,
        { id: "m2", role: "assistant", content: "I've let the team know." },
        { id: "m3", role: "assistant", content: "Hi, this is Yuri.", fromTeam: true, teamMemberName: "Yuri" },
        { id: "m4", role: "assistant", content: "How can I help?", fromTeam: true, teamMemberName: "Yuri" },
        { id: "m5", role: "user", content: "About my invoice." },
        { id: "m6", role: "assistant", content: "Let me check.", fromTeam: true, teamMemberName: "Yuri" },
      ],
    });

    expect(await screen.findByText("chat.teamMemberInChat Yuri")).toBeTruthy();
    expect(screen.getAllByText("chat.teamJoined Yuri")).toHaveLength(1);
    // Once above each run of Yuri's messages.
    expect(screen.getAllByText("Yuri")).toHaveLength(2);
    expect(screen.queryByText("chat.handoffBanner")).toBeNull();
    client.clear();
  });
});

describe("threadEntries", () => {
  const text = (id: string, role: "user" | "assistant", content: string, metadata?: { fromTeam: true; teamMemberName: string | null }) => ({ id, role, parts: [{ type: "text" as const, text: content }], ...(metadata ? { metadata } : {}) });

  it("notes each time the team takes the chat from the receptionist, and leaves out empty replies", () => {
    const entries = threadEntries([
      text("1", "user", "Hello"),
      text("2", "assistant", "Hi! How can I help?"),
      text("3", "assistant", "This is the team.", { fromTeam: true, teamMemberName: null }),
      text("4", "user", "Thanks"),
      text("5", "assistant", ""),
      text("6", "assistant", "Back to the receptionist."),
      text("7", "assistant", "Hi again, Yuri here.", { fromTeam: true, teamMemberName: "Yuri" }),
    ], null);

    expect(entries.map((entry) => [entry.message.id, entry.joined, entry.showName, entry.teamMemberName])).toEqual([
      ["1", false, false, null],
      ["2", false, false, null],
      ["3", true, true, null],
      ["4", false, false, null],
      ["6", false, false, null],
      ["7", true, true, "Yuri"],
    ]);
    // A reply still streaming in stays, even before its first words.
    expect(threadEntries([text("1", "user", "Hello"), text("2", "assistant", "")], "2").map((entry) => entry.message.id)).toEqual(["1", "2"]);
  });
});

describe("widget chat live updates", () => {
  it("shows a team member's reply and the take-over banner as soon as the stream reports them", async () => {
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
    Element.prototype.scrollTo = () => {};
    const aiReply = { id: "m2", role: "assistant", content: "Let me see who's around." };
    const joined = { id: "m3", role: "assistant", content: "Hi, this is Yuri. How can I help?" };
    const history = vi.fn()
      .mockResolvedValueOnce({ automationState: "ai_active", messages: [visitorMessage, aiReply] })
      .mockResolvedValueOnce({ automationState: "ai_active", messages: [visitorMessage, aiReply] })
      .mockResolvedValue({ automationState: "human_handoff", messages: [visitorMessage, aiReply, joined] });
    const encoder = new TextEncoder();
    let push: (text: string) => void = () => {};
    let end: () => void = () => {};
    const body = new ReadableStream<Uint8Array>({ start(controller) { push = (text) => controller.enqueue(encoder.encode(text)); end = () => controller.close(); } });
    let streamInit: RequestInit | undefined;
    vi.stubGlobal("fetch", vi.fn(async (url: URL | string, init?: RequestInit) => {
      if (String(url).includes("/api/widget/history")) return Response.json(await history());
      if (String(url).includes("/api/widget/stream")) {
        streamInit = init;
        return new Response(body, { headers: { "content-type": "text/event-stream" } });
      }
      return Response.json(config);
    }));

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><WidgetChatClient widgetKey="widget-key" /></QueryClientProvider>);
    act(() => {
      window.dispatchEvent(new MessageEvent("message", { source: window, origin: "https://business.test", data: { type: "session", token: "token", parentOrigin: "https://business.test", visitorId } }));
    });

    expect(await screen.findByText(aiReply.content)).toBeTruthy();
    // The chat has started, so the widget opens its stream with the session.
    await vi.waitFor(() => expect(streamInit).toBeDefined());
    expect(streamInit?.headers).toMatchObject({ authorization: "Bearer token", "x-widget-parent-origin": "https://business.test" });

    await act(async () => { push("event: ready\ndata: {}\n\n"); });
    await vi.waitFor(() => expect(history).toHaveBeenCalledTimes(2));
    expect(screen.queryByText(joined.content)).toBeNull();
    expect(screen.queryByText("chat.handoffBanner")).toBeNull();

    await act(async () => { push(": keepalive\n\nevent: message\ndata: {}\n\n"); });
    expect(await screen.findByText(joined.content)).toBeTruthy();
    expect(screen.getByText("chat.handoffBanner")).toBeTruthy();
    expect(history).toHaveBeenCalledTimes(3);
    end();
    client.clear();
  });

  function openChat(respond: (url: string) => Promise<Response>) {
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
    Element.prototype.scrollTo = () => {};
    const streamRequests = vi.fn();
    vi.stubGlobal("fetch", vi.fn(async (url: URL | string) => {
      if (String(url).includes("/api/widget/stream")) streamRequests();
      return await respond(String(url));
    }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><WidgetChatClient widgetKey="widget-key" /></QueryClientProvider>);
    act(() => {
      window.dispatchEvent(new MessageEvent("message", { source: window, origin: "https://business.test", data: { type: "session", token: "token", parentOrigin: "https://business.test", visitorId } }));
    });
    return { client, streamRequests };
  }

  async function send(text: string) {
    const composer = await screen.findByRole("textbox", { name: "chat.composerPlaceholder" });
    await vi.waitFor(() => expect((composer as HTMLInputElement).disabled).toBe(false));
    fireEvent.change(composer, { target: { value: text } });
    await act(async () => { fireEvent.submit(composer.closest("form")!); });
  }

  it("waits for the server to answer a new visitor's first message, which starts their chat, before opening the stream", async () => {
    const reply = held();
    const { client, streamRequests } = openChat(async (url) => {
      if (url.includes("/api/widget/history")) return Response.json({ messages: [] });
      if (url.includes("/api/widget/chat")) return await reply.response;
      if (url.includes("/api/widget/stream")) return new Response(null, { status: 401 });
      return Response.json(config);
    });

    // The greeting opens the empty chat as the receptionist's first message.
    expect(await screen.findByText("chat.welcome")).toBeTruthy();
    await send("Do you open on Sundays?");
    expect(await screen.findByText("Do you open on Sundays?")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("chat.pendingLabel");
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    // The server has no chat for the visitor until it takes their message.
    expect(streamRequests).not.toHaveBeenCalled();

    await act(async () => { reply.send(streamedReply("We open at ten on Sundays.")); });
    expect(await screen.findByText("We open at ten on Sundays.")).toBeTruthy();
    // The greeting stays at the top once the visitor writes.
    expect(screen.getByText("chat.welcome").compareDocumentPosition(screen.getByText("Do you open on Sundays?")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await vi.waitFor(() => expect(streamRequests).toHaveBeenCalledTimes(1));
    client.clear();
  });

  it("stops the stream when the visitor has no open chat, until the server answers their next message", async () => {
    const firstStream = held();
    const { client, streamRequests } = openChat(async (url) => {
      if (url.includes("/api/widget/history")) return Response.json({ automationState: "ai_active", messages: [visitorMessage, teamReply] });
      if (url.includes("/api/widget/chat")) return streamedReply("We open at ten on Sundays.");
      if (url.includes("/api/widget/stream")) return streamRequests.mock.calls.length === 1 ? await firstStream.response : new Response(null, { status: 401 });
      return Response.json(config);
    });
    await vi.waitFor(() => expect(streamRequests).toHaveBeenCalledTimes(1));

    // The team closed the chat after it loaded: the stream finds none and doesn't keep asking.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    await act(async () => { firstStream.send(Response.json({ code: "widget_conversation_not_found" }, { status: 404 })); });
    await act(async () => { await vi.advanceTimersByTimeAsync(120_000); });
    expect(streamRequests).toHaveBeenCalledTimes(1);
    vi.useRealTimers();

    // The visitor's next message starts a new chat, and the stream opens again for it.
    await send("Do you open on Sundays?");
    expect(await screen.findByText("We open at ten on Sundays.")).toBeTruthy();
    await vi.waitFor(() => expect(streamRequests).toHaveBeenCalledTimes(2));
    client.clear();
  });
});

describe("widget history reloads during live chat", () => {
  /** A live update stream the test writes to and ends. */
  function liveStream() {
    const encoder = new TextEncoder();
    let push: (text: string) => void = () => {};
    let end: () => void = () => {};
    const body = new ReadableStream<Uint8Array>({ start(controller) { push = (text) => controller.enqueue(encoder.encode(text)); end = () => controller.close(); } });
    return { response: new Response(body, { headers: { "content-type": "text/event-stream" } }), push: (text: string) => push(text), end: () => end() };
  }

  function openTeamChat(stream: (request: number) => Response) {
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
    Element.prototype.scrollTo = () => {};
    const history = vi.fn(() => ({ automationState: "human_handoff", messages: [visitorMessage, teamReply] }));
    let streamRequests = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: URL | string) => {
      if (String(url).includes("/api/widget/history")) return Response.json(history());
      if (String(url).includes("/api/widget/stream")) return stream(++streamRequests);
      return Response.json(config);
    }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><WidgetChatClient widgetKey="widget-key" /></QueryClientProvider>);
    act(() => {
      window.dispatchEvent(new MessageEvent("message", { source: window, origin: "https://business.test", data: { type: "session", token: "token", parentOrigin: "https://business.test", visitorId } }));
    });
    return { client, history, streamRequests: () => streamRequests };
  }

  it("checks for team replies only while the stream is down or reconnecting", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const first = liveStream();
    const { client, history, streamRequests } = openTeamChat((request) => request === 1 ? first.response : new Response(null, { status: 503 }));
    expect(await screen.findByText("chat.handoffBanner")).toBeTruthy();
    await vi.waitFor(() => expect(streamRequests()).toBe(1));

    await act(async () => { first.push("event: ready\ndata: {}\n\n"); });
    await vi.waitFor(() => expect(history).toHaveBeenCalledTimes(2));
    // The open stream brings the team's replies, so nothing checks on a timer.
    await vi.waitFor(() => expect(vi.getTimerCount()).toBe(0));
    await act(async () => { vi.advanceTimersByTime(180_000); });
    expect(history).toHaveBeenCalledTimes(2);

    // The stream drops and can't reopen: the chat checks every 45 seconds instead.
    await act(async () => { first.end(); });
    await vi.waitFor(() => expect(vi.getTimerCount()).toBe(1));
    await vi.waitFor(() => expect(streamRequests()).toBe(2), { timeout: 3_000 });
    await act(async () => { vi.advanceTimersByTime(45_000); });
    await vi.waitFor(() => expect(history).toHaveBeenCalledTimes(3));
    client.clear();
  });

  it("backs off a stream that keeps closing without a single event, as the server does when Redis is down", async () => {
    const first = liveStream();
    const { client, streamRequests } = openTeamChat((request) => request === 1 ? first.response : new Response("", { headers: { "content-type": "text/event-stream" } }));
    expect(await screen.findByText("chat.handoffBanner")).toBeTruthy();
    await vi.waitFor(() => expect(streamRequests()).toBe(1));
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    await act(async () => { first.end(); });
    // Not the one-second reopen of a stream that delivered events: 2 seconds, then 4.
    await act(async () => { await vi.advanceTimersByTimeAsync(1_500); });
    expect(streamRequests()).toBe(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(600); });
    expect(streamRequests()).toBe(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(3_500); });
    expect(streamRequests()).toBe(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(600); });
    expect(streamRequests()).toBe(3);
    client.clear();
  });

  it("keeps a busy chat's reloads under the history limit, sharing one reload among changes that arrive together", async () => {
    const stream = liveStream();
    const { client, history, streamRequests } = openTeamChat(() => stream.response);
    expect(await screen.findByText("chat.handoffBanner")).toBeTruthy();
    await vi.waitFor(() => expect(streamRequests()).toBe(1));
    expect(history).toHaveBeenCalledTimes(1);

    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const event = async (text: string) => { await act(async () => { stream.push(text); await vi.advanceTimersByTimeAsync(300); }); };
    // A team member's reply and their take-over arrive together: one reload.
    await event("event: ready\ndata: {}\n\nevent: message\ndata: {}\n\nevent: conversation\ndata: {}\n\n");
    expect(history).toHaveBeenCalledTimes(2);
    // The chat may reload a few times in a row.
    for (let reply = 0; reply < 4; reply += 1) await event("event: message\ndata: {}\n\n");
    expect(history).toHaveBeenCalledTimes(6);

    // Then the team's next replies wait, and share the one reload the budget allows 40 seconds on.
    for (let reply = 0; reply < 3; reply += 1) await event("event: message\ndata: {}\n\n");
    expect(history).toHaveBeenCalledTimes(6);
    await act(async () => { await vi.advanceTimersByTimeAsync(39_000); });
    expect(history).toHaveBeenCalledTimes(7);
    await act(async () => { await vi.advanceTimersByTimeAsync(120_000); });
    expect(history).toHaveBeenCalledTimes(7);
    vi.useRealTimers();
    stream.end();
    client.clear();
  });
});

describe("widget voice captions", () => {
  it("shows both sides of a live voice call in the chat thread and asks the loader to warn before leaving", async () => {
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
    const postMessage = vi.spyOn(window, "postMessage");
    Element.prototype.scrollTo = () => {};
    vi.mocked(useWebVoiceCall).mockReturnValue({
      status: "connected",
      errorKey: null,
      remoteAudioRef: { current: null },
      transcript: [
        { speaker: "assistant", text: "Hi, how can I help?" },
        { speaker: "caller", text: " Are you open Sunday?" },
      ],
      startCall: vi.fn(),
      endCall: vi.fn(),
    } as unknown as ReturnType<typeof useWebVoiceCall>);
    vi.stubGlobal("fetch", vi.fn(async (url: URL | string) => String(url).includes("/api/widget/history") ? Response.json({ messages: [] }) : Response.json({ ...config, businessSlug: "acme", voiceEnabled: true })));

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><WidgetChatClient widgetKey="widget-key" /></QueryClientProvider>);
    act(() => {
      window.dispatchEvent(new MessageEvent("message", { source: window, origin: "https://business.test", data: { type: "session", token: "token", parentOrigin: "https://business.test", visitorId } }));
    });

    expect(await screen.findByText("Hi, how can I help?")).toBeTruthy();
    expect(screen.getByText("Are you open Sunday?")).toBeTruthy();
    expect(screen.getByText("chat.voiceLive")).toBeTruthy();
    expect(screen.getByRole("button", { name: "chat.voiceEnd" })).toBeTruthy();
    await vi.waitFor(() => expect(postMessage).toHaveBeenCalledWith({ type: "leave-warning", enabled: true }, "*"));
    postMessage.mockRestore();
    client.clear();
  });
});

describe("widget composer", () => {
  it("puts the details button on its own row under the message box and never shows the visitor id", async () => {
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
    Element.prototype.scrollTo = () => {};
    vi.stubGlobal("fetch", vi.fn(async (url: URL | string) => String(url).includes("/api/widget/history") ? Response.json({ messages: [visitorMessage, teamReply] }) : Response.json({ ...config, config: { leadForm: { enabled: true } } })));

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><WidgetChatClient widgetKey="widget-key" /></QueryClientProvider>);
    act(() => {
      window.dispatchEvent(new MessageEvent("message", { source: window, origin: "https://business.test", data: { type: "session", token: "token", parentOrigin: "https://business.test", visitorId } }));
    });

    const details = await screen.findByRole("button", { name: "chat.leaveDetails" });
    const composer = screen.getByRole("textbox", { name: "chat.composerPlaceholder" });
    const send = screen.getByRole("button", { name: "chat.send" });
    // The message box and send button share the first row; the details button sits in the row below.
    expect(composer.parentElement).toBe(send.parentElement);
    expect(composer.parentElement?.contains(details)).toBe(false);
    expect(composer.compareDocumentPosition(details) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Nobody on the team can look a chat up by this id, so the visitor doesn't see it.
    expect(screen.queryByText(/5ef3b4ef/)).toBeNull();
    client.clear();
  });
});

describe("widget call button", () => {
  it("puts a compact call button beside the business name", async () => {
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
    Element.prototype.scrollTo = () => {};
    const startCall = vi.fn();
    vi.mocked(useWebVoiceCall).mockReturnValue({
      status: "idle",
      errorKey: null,
      remoteAudioRef: { current: null },
      transcript: [],
      startCall,
      endCall: vi.fn(),
    } as unknown as ReturnType<typeof useWebVoiceCall>);
    vi.stubGlobal("fetch", vi.fn(async (url: URL | string) => String(url).includes("/api/widget/history") ? Response.json({ messages: [] }) : Response.json({ ...config, businessSlug: "acme", voiceEnabled: true })));

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><WidgetChatClient widgetKey="widget-key" /></QueryClientProvider>);
    act(() => {
      window.dispatchEvent(new MessageEvent("message", { source: window, origin: "https://business.test", data: { type: "session", token: "token", parentOrigin: "https://business.test", visitorId } }));
    });

    const call = await screen.findByRole("button", { name: "chat.voiceStart" });
    // In the header's row, after the business name, and not stretched across the chat.
    const header = call.closest("header")!;
    expect(header.querySelector("p")?.textContent).toBe("Acme");
    expect(header.querySelector("p")!.compareDocumentPosition(call) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(call.className).not.toContain("w-full");
    expect(call.getAttribute("title")).toBe("chat.voiceButton");
    fireEvent.click(call);
    expect(startCall).toHaveBeenCalledTimes(1);
    client.clear();
  });
});

describe("widget call states", () => {
  it("says the call is connecting under the header and offers to end it", async () => {
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
    Element.prototype.scrollTo = () => {};
    const endCall = vi.fn();
    vi.mocked(useWebVoiceCall).mockReturnValue({ status: "connecting", errorKey: null, remoteAudioRef: { current: null }, transcript: [], startCall: vi.fn(), endCall } as unknown as ReturnType<typeof useWebVoiceCall>);
    vi.stubGlobal("fetch", vi.fn(async (url: URL | string) => String(url).includes("/api/widget/history") ? Response.json({ messages: [] }) : Response.json({ ...config, businessSlug: "acme", voiceEnabled: true })));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><WidgetChatClient widgetKey="widget-key" /></QueryClientProvider>);
    act(() => {
      window.dispatchEvent(new MessageEvent("message", { source: window, origin: "https://business.test", data: { type: "session", token: "token", parentOrigin: "https://business.test", visitorId } }));
    });
    const end = await screen.findByRole("button", { name: "chat.voiceEnd" });
    expect((await screen.findByText("chat.voiceConnecting")).closest("[role=status]")).toBeTruthy();
    expect(screen.queryByText("chat.voiceLive")).toBeNull();
    fireEvent.click(end);
    expect(endCall).toHaveBeenCalledTimes(1);
    client.clear();
  });
});

describe("widget on a phone", () => {
  it("shows a close button only while the loader opens the chat as a full-screen sheet", async () => {
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
    Element.prototype.scrollTo = () => {};
    const postMessage = vi.spyOn(window, "postMessage");
    vi.stubGlobal("fetch", vi.fn(async (url: URL | string) => String(url).includes("/api/widget/history") ? Response.json({ messages: [] }) : Response.json(config)));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><WidgetChatClient widgetKey="widget-key" /></QueryClientProvider>);
    const layout = (sheet: boolean) => act(() => { window.dispatchEvent(new MessageEvent("message", { source: window, data: { type: "layout", sheet } })); });
    act(() => {
      window.dispatchEvent(new MessageEvent("message", { source: window, origin: "https://business.test", data: { type: "session", token: "token", parentOrigin: "https://business.test", visitorId } }));
    });
    expect(await screen.findByText("Acme")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "chat.close" })).toBeNull();
    layout(true);
    fireEvent.click(screen.getByRole("button", { name: "chat.close" }));
    expect(postMessage).toHaveBeenCalledWith({ type: "close" }, "*");
    layout(false);
    expect(screen.queryByRole("button", { name: "chat.close" })).toBeNull();
    postMessage.mockRestore();
    client.clear();
  });
});

describe("widget loading state", () => {
  it("draws the chat in the loader's color with placeholders until the settings arrive", async () => {
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
    Element.prototype.scrollTo = () => {};
    vi.mocked(useWebVoiceCall).mockReturnValue({ status: "idle", errorKey: null, remoteAudioRef: { current: null }, transcript: [], startCall: vi.fn(), endCall: vi.fn() } as unknown as ReturnType<typeof useWebVoiceCall>);
    let answer: (response: Response) => void = () => {};
    vi.stubGlobal("fetch", vi.fn((url: URL | string) => String(url).includes("/api/widget/history")
      ? Promise.resolve(Response.json({ messages: [] }))
      : new Promise<Response>((resolve) => { answer = resolve; })));

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(<QueryClientProvider client={client}><WidgetChatClient widgetKey="widget-key" initialColor="#ffd100" /></QueryClientProvider>);
    act(() => {
      window.dispatchEvent(new MessageEvent("message", { source: window, origin: "https://business.test", data: { type: "session", token: "token", parentOrigin: "https://business.test", visitorId } }));
    });

    const avatar = container.querySelector<HTMLElement>("header > div")!;
    expect(avatar.style.backgroundColor).toBe("rgb(255, 209, 0)");
    expect(screen.getByRole("status").textContent).toContain("chat.loadingTranscript");
    // Placeholders stand in for the name and the call button.
    expect(container.querySelectorAll("header .animate-pulse")).toHaveLength(2);

    await act(async () => {
      answer(Response.json({ ...config, config: { color: "#ffd100" }, businessSlug: "acme", voiceEnabled: true }));
    });
    expect(await screen.findByText("chat.voiceStart")).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByText("Acme")).toBeTruthy();
    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(0);
    expect(avatar.style.backgroundColor).toBe("rgb(255, 209, 0)");
    // The send button stays gray until there is something to send, then takes the color with dark text on yellow.
    const send = screen.getByRole("button", { name: "chat.send" }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    expect(send.style.backgroundColor).toBe("");
    fireEvent.change(screen.getByRole("textbox", { name: "chat.composerPlaceholder" }), { target: { value: "Hello" } });
    expect(send.disabled).toBe(false);
    expect(send.style.backgroundColor).toBe("rgb(255, 209, 0)");
    expect(send.style.color).toBe("rgb(24, 24, 27)");
    client.clear();
  });

  it("puts dark text on light widget colors and white text on dark ones", () => {
    expect(readableOn("#ffd100")).toBe("#18181b");
    expect(readableOn("#fff")).toBe("#18181b");
    expect(readableOn("#0f766e")).toBe("#ffffff");
    expect(readableOn("#7c3aed")).toBe("#ffffff");
  });
});

describe("widget first load", () => {
  function openChat(respond: (url: string, init?: RequestInit) => Promise<Response>, initialColor?: string) {
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
    Element.prototype.scrollTo = () => {};
    vi.mocked(useWebVoiceCall).mockReturnValue({ status: "idle", errorKey: null, remoteAudioRef: { current: null }, transcript: [], startCall: vi.fn(), endCall: vi.fn() } as unknown as ReturnType<typeof useWebVoiceCall>);
    const fetchMock = vi.fn((url: URL | string, init?: RequestInit) => String(url).includes("/api/widget/stream") ? Promise.resolve(new Response(null, { status: 401 })) : respond(String(url), init));
    vi.stubGlobal("fetch", fetchMock);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = render(<QueryClientProvider client={client}><WidgetChatClient widgetKey="widget-key" initialColor={initialColor} /></QueryClientProvider>);
    const session = (token: string) => act(() => {
      window.dispatchEvent(new MessageEvent("message", { source: window, origin: "https://business.test", data: { type: "session", token, parentOrigin: "https://business.test", visitorId } }));
    });
    session("token");
    return { client, container: view.container, fetchMock, session };
  }

  const composer = () => screen.getByRole("textbox", { name: "chat.composerPlaceholder" }) as HTMLInputElement;

  it("asks for the history with the settings and shows a returning visitor's chat once both are in", async () => {
    const settings = held();
    const history = held();
    const { client, container, fetchMock } = openChat((url) => url.includes("/api/widget/history") ? history.response : settings.response);

    // Both requests leave as soon as the session arrives, before either answers.
    await vi.waitFor(() => expect(fetchMock.mock.calls.map(([url]) => new URL(String(url)).pathname).sort()).toEqual(["/api/widget/config", "/api/widget/history"]));

    await act(async () => {
      settings.send(Response.json({ ...config, config: { color: "#7c3aed", subtitle: "Open until 6", greeting: "Welcome to Acme!", leadForm: { enabled: true, showBeforeChat: true } }, businessSlug: "acme", voiceEnabled: true }));
    });
    await vi.waitFor(() => expect(container.querySelector<HTMLElement>("header > div")!.style.backgroundColor).toBe("rgb(124, 58, 237)"));
    // The settings alone show nothing yet, so a returning visitor never sees the greeting or the details form first.
    expect(screen.getByRole("status").textContent).toContain("chat.loadingTranscript");
    expect(container.querySelectorAll("header .animate-pulse")).toHaveLength(2);
    expect(screen.queryByText("Open until 6")).toBeNull();
    expect(screen.queryByRole("button", { name: "chat.voiceStart" })).toBeNull();
    expect(screen.queryByText("chat.welcome")).toBeNull();
    expect(screen.queryByText("Welcome to Acme!")).toBeNull();
    expect(screen.queryByText("lead.beforeChatHeading")).toBeNull();
    expect(composer().disabled).toBe(true);

    await act(async () => {
      history.send(Response.json({ automationState: "ai_active", messages: [visitorMessage, teamReply] }));
    });
    expect(await screen.findByText(visitorMessage.content)).toBeTruthy();
    expect(screen.getByText(teamReply.content)).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(0);
    expect(screen.getByText("Open until 6")).toBeTruthy();
    expect(screen.getByRole("button", { name: "chat.voiceStart" })).toBeTruthy();
    expect(screen.queryByText("chat.welcome")).toBeNull();
    expect(screen.queryByText("lead.beforeChatHeading")).toBeNull();
    expect(composer().disabled).toBe(false);
    client.clear();
  });

  it("keeps the history out of sight until the settings arrive", async () => {
    const settings = held();
    const historyBody = vi.fn(async () => ({ automationState: "human_handoff", messages: [visitorMessage, teamReply] }));
    const { client } = openChat((url) => url.includes("/api/widget/history") ? Promise.resolve({ ok: true, json: historyBody } as unknown as Response) : settings.response);

    await vi.waitFor(() => expect(historyBody).toHaveBeenCalled());
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(screen.queryByText(visitorMessage.content)).toBeNull();
    expect(screen.queryByText("chat.handoffBanner")).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("chat.loadingTranscript");
    expect(composer().disabled).toBe(true);

    await act(async () => {
      settings.send(Response.json({ ...config, config: { color: "#7c3aed" } }));
    });
    // The visitor's own messages come in the business's color, never the loading one.
    const message = await screen.findByText(visitorMessage.content);
    expect(message.closest<HTMLElement>("[style]")?.style.backgroundColor).toBe("rgb(124, 58, 237)");
    expect(screen.getByText("chat.handoffBanner")).toBeTruthy();
    client.clear();
  });

  it("opens a history that arrived before the settings at its latest message", async () => {
    // jsdom lays nothing out, so each element in the thread counts as 100px here.
    const scrollTops = new WeakMap<HTMLElement, number>();
    Object.defineProperty(HTMLElement.prototype, "scrollHeight", { configurable: true, get(this: HTMLElement) { return this.childElementCount * 100; } });
    Object.defineProperty(HTMLElement.prototype, "scrollTop", { configurable: true, get(this: HTMLElement) { return scrollTops.get(this) ?? 0; }, set(this: HTMLElement, value: number) { scrollTops.set(this, value); } });
    try {
      const settings = held();
      const historyBody = vi.fn(async () => ({ automationState: "ai_active", messages: [visitorMessage, teamReply] }));
      const { client, container } = openChat((url) => url.includes("/api/widget/history") ? Promise.resolve({ ok: true, json: historyBody } as unknown as Response) : settings.response);
      await vi.waitFor(() => expect(historyBody).toHaveBeenCalled());
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

      await act(async () => {
        settings.send(Response.json(config));
      });
      await screen.findByText(teamReply.content);
      const thread = container.querySelector<HTMLElement>(".overflow-y-auto")!;
      expect(thread.scrollHeight).toBe(200);
      expect(thread.scrollTop).toBe(200);
      client.clear();
    } finally {
      Reflect.deleteProperty(HTMLElement.prototype, "scrollHeight");
      Reflect.deleteProperty(HTMLElement.prototype, "scrollTop");
    }
  });

  it("keeps the chat on screen while a renewed session reloads the settings, without loading the history again", async () => {
    const renewedSettings = held();
    const historyRequests = vi.fn();
    const { client, fetchMock, session } = openChat((url, init) => {
      if (url.includes("/api/widget/history")) {
        historyRequests();
        return Promise.resolve(Response.json({ automationState: "ai_active", messages: [visitorMessage, teamReply] }));
      }
      return (init?.headers as Record<string, string>).authorization === "Bearer renewed" ? renewedSettings.response : Promise.resolve(Response.json(config));
    });
    expect(await screen.findByText(teamReply.content)).toBeTruthy();
    await vi.waitFor(() => expect(composer().disabled).toBe(false));

    session("renewed");
    await vi.waitFor(() => expect(fetchMock.mock.calls.some(([url, init]) => String(url).includes("/api/widget/config") && (init?.headers as Record<string, string>).authorization === "Bearer renewed")).toBe(true));
    expect(composer().disabled).toBe(false);
    expect(screen.getByText(teamReply.content)).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();

    await act(async () => {
      renewedSettings.send(Response.json(config));
    });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    // The live updates bring anything new, so the renewal alone doesn't reload the history.
    expect(historyRequests).toHaveBeenCalledTimes(1);
    expect(screen.getByText(teamReply.content)).toBeTruthy();
    client.clear();
  });
});

describe("links in chat replies", () => {
  const reply = "Book online at https://acme.example/book. You can also use [our booking page](https://acme.example/book).";
  const expectedLinks = [
    { text: "https://acme.example/book", href: "https://acme.example/book", target: "_blank", rel: "noreferrer noopener" },
    { text: "our booking page", href: "https://acme.example/book", target: "_blank", rel: "noreferrer noopener" },
  ];

  function openChat(respond: (url: string) => Response | undefined) {
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
    Element.prototype.scrollTo = () => {};
    vi.stubGlobal("fetch", vi.fn(async (url: URL | string) => respond(String(url)) ?? (String(url).includes("/api/widget/stream") ? new Response(null, { status: 401 }) : Response.json(config))));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><WidgetChatClient widgetKey="widget-key" /></QueryClientProvider>);
    act(() => {
      window.dispatchEvent(new MessageEvent("message", { source: window, origin: "https://business.test", data: { type: "session", token: "token", parentOrigin: "https://business.test", visitorId } }));
    });
    return client;
  }

  function shownLinks(startsWith: string) {
    const content = [...document.querySelectorAll<HTMLElement>(".widget-message-content")].find((element) => element.textContent?.startsWith(startsWith));
    return content ? [...content.querySelectorAll("a")].map((anchor) => ({ text: anchor.textContent, href: anchor.getAttribute("href"), target: anchor.getAttribute("target"), rel: anchor.getAttribute("rel") })) : [];
  }

  it("turns web addresses in the receptionist's streamed reply into links", async () => {
    const client = openChat((url) => {
      if (url.includes("/api/widget/history")) return Response.json({ automationState: "ai_active", messages: [] });
      if (!url.includes("/api/widget/chat")) return undefined;
      return createUIMessageStreamResponse({
        stream: createUIMessageStream({
          execute: ({ writer }) => {
            writer.write({ type: "start", messageId: "a1" });
            writer.write({ type: "text-start", id: "a1" });
            // In pieces, as a model streams it, so links only complete in later pieces.
            for (const delta of reply.match(/.{1,12}/g)!) writer.write({ type: "text-delta", id: "a1", delta });
            writer.write({ type: "text-end", id: "a1" });
            writer.write({ type: "finish", finishReason: "stop" });
          },
        }),
      });
    });

    const composer = await screen.findByRole("textbox", { name: "chat.composerPlaceholder" });
    await vi.waitFor(() => expect((composer as HTMLInputElement).disabled).toBe(false));
    fireEvent.change(composer, { target: { value: "Can I book online?" } });
    await act(async () => { fireEvent.submit(composer.closest("form")!); });

    await vi.waitFor(() => expect(shownLinks("Book online")).toEqual(expectedLinks));
    client.clear();
  });

  it("turns web addresses in a team member's reply into underlined links that wrap", async () => {
    const client = openChat((url) => url.includes("/api/widget/history")
      ? Response.json({ automationState: "human_handoff", teamMemberName: "Yuri", messages: [visitorMessage, { id: "m2", role: "assistant", content: reply, fromTeam: true, teamMemberName: "Yuri" }] })
      : undefined);

    expect(await screen.findByText("chat.teamJoined Yuri")).toBeTruthy();
    expect(shownLinks("Book online")).toEqual(expectedLinks);
    // The base styles take a link's underline away, so the message gives it back.
    const content = screen.getByText("our booking page").closest(".widget-message-content")!;
    expect(content.className).toContain("[&_a]:underline");
    expect(content.closest("div")?.className).toContain("wrap-anywhere");
    client.clear();
  });
});
