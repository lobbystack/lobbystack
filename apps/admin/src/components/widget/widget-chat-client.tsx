"use client";

import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ChevronDown, LoaderCircle, Mic, Phone, PhoneOff, UserRound } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useTranslation } from "react-i18next";
import { normalizeInterfaceLocale, type InterfaceLocale, type RuntimeLocale } from "@lobbystack/shared";

import { cn } from "@/lib/utils";
import { renderSafeMarkdown } from "@/lib/widget-markdown";
import { useWebVoiceCall, type WebVoiceTranscriptTurn, type WebVoiceWidgetStatus } from "@lobbystack/web-voice";
import { createHistoryReloadBudget, type HistoryReloadBudget } from "./history-reload-budget";
import { readableOn, WidgetBubble, WidgetComposerField, WidgetHeader, WidgetTyping } from "./widget-parts";

type WidgetConfigPayload = {
  key: string;
  business: { id: string; name: string; defaultLocale: RuntimeLocale };
  config: {
    color?: string;
    title?: string;
    subtitle?: string;
    greeting?: string;
    localeOverride?: InterfaceLocale;
    leadForm?: { enabled: boolean; requirePhone?: boolean; requireEmail?: boolean; showBeforeChat?: boolean };
  };
  billing: { chatAllowed: boolean; plan: string };
  greeting?: string;
  snapshotPresent: boolean;
  businessSlug?: string;
  voiceEnabled?: boolean;
};

/** What the voice button shares with the chat: where the call is, and its captions. */
type VoiceCaptions = { status: WebVoiceWidgetStatus; turns: WebVoiceTranscriptTurn[] };
const NO_CALL: VoiceCaptions = { status: "idle", turns: [] };

type WidgetMessageMetadata = {
  automationState?: "ai_active" | "human_handoff";
  /** The receptionist asked the team to join, and the chat waits for them. */
  waitingForTeam?: boolean;
  /** A team member wrote this message, with their first name when they have one. */
  fromTeam?: boolean;
  teamMemberName?: string | null;
};
type WidgetMessage = UIMessage<WidgetMessageMetadata>;

/** Who answers the chat: the receptionist, or the team, which was asked to join or is in the chat. */
type ChatHandling = { handoff: boolean; waitingForTeam: boolean; teamMemberName: string | null };
const RECEPTIONIST_HANDLING: ChatHandling = { handoff: false, waitingForTeam: false, teamMemberName: null };

type HistoryPayload = {
  automationState?: string;
  waitingForTeam?: boolean;
  teamMemberName?: string | null;
  messages?: Array<{ id: string; role: "user" | "assistant"; content: string; fromTeam?: boolean; teamMemberName?: string | null }>;
};

function messageText(message: WidgetMessage): string {
  return message.parts.filter((part): part is Extract<WidgetMessage["parts"][number], { type: "text" }> => part.type === "text").map((part) => part.text).join("");
}

function chatErrorKey(error: unknown): string {
  if (!(error instanceof Error)) return "chat.sendingFailed";
  try {
    const parsed = JSON.parse(error.message) as { code?: unknown };
    return parsed.code === "chat_ai_limit_reached" ? "chat.limitReached" : "chat.sendingFailed";
  } catch {
    return "chat.sendingFailed";
  }
}


// The base styles make links look like the text around them, so they get an underline back.
function MessageContent({ content, pending }: { content: string; pending?: boolean }) {
  return <span className="widget-message-content [&_a]:underline [&_a]:underline-offset-2" dangerouslySetInnerHTML={{ __html: renderSafeMarkdown(content || (pending ? "…" : "")) }} />;
}

const DEFAULT_COLOR = "#18181b";
// Only used while the settings load on a chat opened by an older loader, which doesn't pass its color.
const LOADING_COLOR = "#d4d4d8";

function storageVisitorKey(widgetKey: string): string {
  return `lobbystack.widget.visitorId.${widgetKey}`;
}

function localVisitorId(widgetKey: string): string {
  try {
    const existing = window.localStorage.getItem(storageVisitorKey(widgetKey));
    if (existing) return existing;
  } catch {
    /* storage unavailable */
  }
  const id = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `v-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  try {
    window.localStorage.setItem(storageVisitorKey(widgetKey), id);
  } catch {
    /* storage unavailable */
  }
  return id;
}

/** How long the chat waits after a change from the team, so changes that arrive together share one history reload. */
const HISTORY_RELOAD_GATHER_MS = 300;

/** How a live update stream ended: on its own, on an error worth retrying, for good, or because the visitor has no open chat. */
type WidgetStreamOutcome = "ended" | "failed" | "stopped" | "no_chat";

/** Reads the chat's live updates until the stream ends. Only the event names matter: events carry no text. */
async function readWidgetStream(input: { token: string; parentOrigin: string; signal: AbortSignal; onEvent: (name: string) => void }): Promise<WidgetStreamOutcome> {
  const response = await fetch(new URL("/api/widget/stream", window.location.origin), {
    headers: { authorization: `Bearer ${input.token}`, "x-widget-parent-origin": input.parentOrigin, accept: "text/event-stream" },
    credentials: "include",
    cache: "no-store",
    signal: input.signal,
  });
  if (response.status === 404) return "no_chat";
  // A session the server turns down stays turned down until the loader sends a new one.
  if (!response.ok) return [400, 401, 403].includes(response.status) ? "stopped" : "failed";
  if (!response.body || !response.headers.get("content-type")?.startsWith("text/event-stream")) return "stopped";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return "ended";
    buffer += decoder.decode(value, { stream: true });
    for (let end = buffer.indexOf("\n\n"); end >= 0; end = buffer.indexOf("\n\n")) {
      const name = buffer.slice(0, end).split("\n").find((line) => line.startsWith("event: "))?.slice("event: ".length);
      buffer = buffer.slice(end + 2);
      if (name) input.onEvent(name);
    }
  }
}

export function WidgetChatClient({ widgetKey, initialColor }: { widgetKey: string; initialColor?: string | undefined }) {
  const { t, i18n } = useTranslation("widget");
  const visitorIdRef = useRef<string>("");
  const [parentVisitorId, setParentVisitorId] = useState<string | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [parentOrigin, setParentOrigin] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [leadOpen, setLeadOpen] = useState(false);
  const [leadDone, setLeadDone] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [configState, setConfigState] = useState<WidgetConfigPayload | null>(null);
  const threadRef = useRef<HTMLDivElement | null>(null);
  // Whether the thread follows new messages: true while the visitor is at the bottom.
  const followThreadRef = useRef(true);
  const [lead, setLead] = useState({ name: "", email: "", phone: "" });
  const [leadSubmitting, setLeadSubmitting] = useState(false);
  const [handling, setHandling] = useState<ChatHandling>(RECEPTIONIST_HANDLING);
  const handoff = handling.handoff;
  const [voiceCaptions, setVoiceCaptions] = useState<VoiceCaptions>(NO_CALL);
  // On a phone the loader opens the chat as a full-screen sheet and hides its bubble, so the chat draws its own close button.
  const [sheet, setSheet] = useState(false);
  // Whether the server has the visitor's chat, which their first message
  // starts. The history says whether they have one; once the server answers a
  // message they most likely do, and the live updates stop if they don't.
  const [chatSaved, setChatSaved] = useState(false);

  const visitorId = useMemo(() => (parentVisitorId ?? visitorIdRef.current) || "", [parentVisitorId]);

  const transport = useMemo(() => new DefaultChatTransport<WidgetMessage>({
    api: "/api/widget/chat",
    credentials: "include",
    headers: () => ({
      ...(sessionToken ? { authorization: `Bearer ${sessionToken}` } : {}),
      ...(parentOrigin ? { "x-widget-parent-origin": parentOrigin } : {}),
    }),
    prepareSendMessagesRequest: ({ messages }) => {
      const lastUserMessage = [...messages].reverse().find((message) => message.role === "user");
      return {
        body: {
          visitorId: visitorIdRef.current || visitorId,
          messageId: lastUserMessage?.id ?? (typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `m-${Date.now()}`),
          content: lastUserMessage ? messageText(lastUserMessage) : "",
          // The reply language the AI uses only covers English and French. For
          // other interface languages the server keeps its business default.
          ...(i18n.language === "fr" || i18n.language === "en" ? { locale: i18n.language } : {}),
        },
      };
    },
  }), [parentOrigin, sessionToken, visitorId]);

  const {
    messages,
    setMessages,
    sendMessage,
    status,
    clearError,
  } = useChat<WidgetMessage>({
    id: `widget:${widgetKey}`,
    generateId: () => crypto.randomUUID(),
    transport,
    onError: (error) => setSubmitError(chatErrorKey(error)),
    onFinish: ({ message }) => {
      setChatSaved(true);
      const metadata = message.metadata;
      if (metadata?.automationState === "ai_active") setHandling(RECEPTIONIST_HANDLING);
      if (metadata?.automationState === "human_handoff") setHandling((current) => ({ ...current, handoff: true, waitingForTeam: metadata.waitingForTeam ?? current.waitingForTeam }));
    },
  });

  const sending = status === "submitted" || status === "streaming";
  const lastMessage = messages.at(-1);
  const streamingMessageId = status === "streaming" && lastMessage?.role === "assistant" ? lastMessage.id : null;
  const thread = useMemo(() => threadEntries(messages, streamingMessageId), [messages, streamingMessageId]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.source !== window.parent) return;
      const data = event.data as { type?: string; visitorId?: string; token?: string; parentOrigin?: string; code?: string; sheet?: unknown };
      if (data && data.type === "layout") setSheet(data.sheet === true);
      if (data && data.type === "session-error") {
        setSubmitError(data.code === "widget_origin_denied" ? "errors.originDenied" : data.code === "widget_key_invalid" ? "errors.invalidKey" : "errors.configLoad");
      }
      if (data && data.type === "visitor" && typeof data.visitorId === "string") {
        setParentVisitorId(data.visitorId);
      }
      if (data && data.type === "session" && typeof data.token === "string" && typeof data.parentOrigin === "string" && event.origin === data.parentOrigin) {
        setSessionToken(data.token);
        setParentOrigin(data.parentOrigin);
        if (typeof data.visitorId === "string") setParentVisitorId(data.visitorId);
      }
    };
    window.addEventListener("message", handleMessage);
    // The loader may finish fetching a session before this client hydrates.
    window.parent?.postMessage({ type: "ready" }, "*");
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  const config = useQuery({
    queryKey: ["widget-config", widgetKey, sessionToken],
    enabled: Boolean(sessionToken),
    queryFn: async () => {
      const url = new URL("/api/widget/config", window.location.origin);
      const response = await fetch(url, { headers: { authorization: `Bearer ${sessionToken}`, "x-widget-parent-origin": parentOrigin ?? "" }, credentials: "include" });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { code?: string } | null;
        if (body?.code === "widget_origin_denied") throw new Error("originDenied");
        if (body?.code === "widget_key_invalid") throw new Error("invalidKey");
        throw new Error("configLoad");
      }
      const payload = await response.json() as WidgetConfigPayload;
      setConfigState(payload);
      return payload;
    },
  });

  useEffect(() => {
    if (!configState) return;
    const locale = configState.config?.localeOverride ?? configState.business?.defaultLocale ?? navigator.language.split("-")[0];
    const supported = normalizeInterfaceLocale(locale);
    if (supported) void i18n.changeLanguage(supported);
  }, [configState]);

  useEffect(() => {
    if (parentVisitorId) {
      try {
        window.localStorage.setItem(storageVisitorKey(widgetKey), parentVisitorId);
      } catch {
        /* ignore */
      }
    }
  }, [parentVisitorId, widgetKey]);

  const loadHistory = useCallback(async (signal?: AbortSignal) => {
    const url = new URL("/api/widget/history", window.location.origin);
    try {
      const response = await fetch(url, { headers: { authorization: `Bearer ${sessionToken}`, "x-widget-parent-origin": parentOrigin ?? "" }, credentials: "include", signal: signal ?? null });
      if (!response.ok) return;
      const data = await response.json() as HistoryPayload;
      if (signal?.aborted) return;
      setHandling(data.automationState === "human_handoff" ? { handoff: true, waitingForTeam: data.waitingForTeam === true, teamMemberName: data.teamMemberName ?? null } : RECEPTIONIST_HANDLING);
      if (Array.isArray(data.messages)) {
        setChatSaved(data.messages.length > 0);
        setMessages(data.messages.map((message) => ({
          id: message.id,
          role: message.role === "assistant" ? "assistant" : "user",
          parts: [{ type: "text", text: message.content }],
          ...(message.role === "assistant" && message.fromTeam ? { metadata: { fromTeam: true, teamMemberName: message.teamMemberName ?? null } } : {}),
        })));
      }
    } catch {
      /* transcript resume is best effort */
    }
  }, [parentOrigin, sessionToken, setMessages]);

  // The history loads at the same time as the settings, as soon as the loader's
  // session arrives. After that the live updates and the reloads below keep it
  // current, so a renewed session doesn't load it again.
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const historyRequestedRef = useRef(false);
  useEffect(() => {
    if (!sessionToken || historyRequestedRef.current) return;
    historyRequestedRef.current = true;
    visitorIdRef.current = visitorIdRef.current || parentVisitorId || localVisitorId(widgetKey);
    void loadHistory().then(() => setHistoryLoaded(true));
  }, [loadHistory, parentVisitorId, sessionToken, widgetKey]);
  // The chat shows once the settings and the history are both in. A renewed
  // session reloads the settings, and the chat stays on screen meanwhile.
  const chatLoaded = configState !== null && historyLoaded;

  // Reloads the history when the team writes or takes the chat over. A reload
  // mid-reply would replace the streaming answer, so it waits for the reply.
  // Changes that arrive close together share one reload, and the budget keeps
  // a busy chat under the history endpoint's hourly limit.
  const sendingRef = useRef(false);
  const refreshPendingRef = useRef(false);
  const refreshRef = useRef<AbortController | null>(null);
  const reloadTimerRef = useRef<number | undefined>(undefined);
  const reloadBudgetRef = useRef<HistoryReloadBudget | null>(null);
  const loadHistoryRef = useRef(loadHistory);
  useEffect(() => {
    loadHistoryRef.current = loadHistory;
  }, [loadHistory]);
  const reloadHistory = useCallback(function reload() {
    reloadTimerRef.current = undefined;
    if (sendingRef.current) {
      refreshPendingRef.current = true;
      return;
    }
    reloadBudgetRef.current ??= createHistoryReloadBudget();
    const wait = reloadBudgetRef.current.take();
    if (wait > 0) {
      reloadTimerRef.current = window.setTimeout(reload, wait);
      return;
    }
    // A newer reload replaces one still loading.
    refreshRef.current?.abort();
    const controller = new AbortController();
    refreshRef.current = controller;
    void loadHistoryRef.current(controller.signal);
  }, []);
  const refreshHistory = useCallback(() => {
    if (sendingRef.current) {
      refreshPendingRef.current = true;
      return;
    }
    // A reload already on its way brings this change too.
    if (reloadTimerRef.current !== undefined) return;
    reloadTimerRef.current = window.setTimeout(reloadHistory, HISTORY_RELOAD_GATHER_MS);
  }, [reloadHistory]);
  useEffect(() => () => window.clearTimeout(reloadTimerRef.current), []);
  useEffect(() => {
    sendingRef.current = sending;
    if (sending) {
      // Aborting on send stops an older reload from overwriting the visitor's new message.
      refreshRef.current?.abort();
    } else if (refreshPendingRef.current) {
      refreshPendingRef.current = false;
      refreshHistory();
    }
  }, [refreshHistory, sending]);

  const [pageVisible, setPageVisible] = useState(true);
  useEffect(() => {
    const update = () => setPageVisible(!document.hidden);
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);

  // Once the visitor has a chat, an open stream tells the widget when a team
  // member writes or takes over. It pauses while the page is in the background.
  const configLoaded = configState !== null;
  // Whether that stream is open: its first event says so.
  const [streamLive, setStreamLive] = useState(false);
  useEffect(() => {
    if (!sessionToken || !parentOrigin || !configLoaded || !chatSaved || !pageVisible) return;
    const controller = new AbortController();
    let timer: number | undefined;
    let failures = 0;
    const connect = async () => {
      let outcome: WidgetStreamOutcome;
      let delivered = false;
      try {
        // Every event, "ready" included, reloads the history: a new stream may have missed something.
        outcome = await readWidgetStream({ token: sessionToken, parentOrigin, signal: controller.signal, onEvent: () => { delivered = true; failures = 0; setStreamLive(true); refreshHistory(); } });
      } catch {
        outcome = "failed";
      }
      setStreamLive(false);
      if (controller.signal.aborted || outcome === "stopped") return;
      if (outcome === "no_chat") {
        // The visitor's next answered message opens the stream again.
        setChatSaved(false);
        return;
      }
      // A stream that ran its course reopens at once. Failures, and a stream that closed without a single event
      // (the server does that when Redis is down), back off up to a minute.
      const delay = outcome === "ended" && delivered ? 1_000 : Math.min(60_000, 2_000 * 2 ** failures++);
      timer = window.setTimeout(() => void connect(), delay);
    };
    void connect();
    return () => {
      controller.abort();
      window.clearTimeout(timer);
      setStreamLive(false);
    };
  }, [chatSaved, configLoaded, pageVisible, parentOrigin, refreshHistory, sessionToken]);

  // Team replies reach the database only. The stream above brings them at
  // once; while it is down or reconnecting, check for them while a person has the chat.
  useEffect(() => {
    if (!handoff || sending || streamLive) return;
    const timer = window.setInterval(() => {
      if (!document.hidden) refreshHistory();
    }, 45_000);
    return () => window.clearInterval(timer);
  }, [handoff, refreshHistory, sending, streamLive]);

  // New messages and each streamed piece of a reply scroll the thread to the
  // bottom, unless the visitor scrolled up to reread something. This runs
  // before the browser paints, so new text never shows below the fold first.
  // A history that arrived before the settings shows once they load, and
  // opens at its latest message too.
  useLayoutEffect(() => {
    const thread = threadRef.current;
    if (thread && followThreadRef.current) thread.scrollTop = thread.scrollHeight;
  }, [chatLoaded, messages, status, voiceCaptions, submitError]);

  // A live voice call or its captions are on screen. Typed messages come back
  // from history after a reload; these don't, so the loader asks the visitor
  // before the page reloads or closes.
  const callActive = voiceCaptions.status === "requesting_microphone" || voiceCaptions.status === "connecting" || voiceCaptions.status === "connected";
  const voiceTranscriptShown = callActive || voiceCaptions.turns.length > 0;
  useEffect(() => {
    window.parent?.postMessage({ type: "leave-warning", enabled: voiceTranscriptShown }, "*");
  }, [voiceTranscriptShown]);

  // The loader's color holds until the settings arrive, so the chat never flashes the default color.
  const color = configState ? configState.config?.color ?? initialColor ?? DEFAULT_COLOR : initialColor ?? LOADING_COLOR;
  const onColor = readableOn(color);
  const title = configState?.config?.title || configState?.business?.name || t("chat.titlePlaceholder");

  async function submitChat(event: FormEvent) {
    event.preventDefault();
    const content = draft.trim();
    if (!content || sending) return;
    if (!visitorIdRef.current) return;
    setSubmitError(null);
    setDraft("");
    followThreadRef.current = true;
    try {
      clearError();
      await sendMessage({ text: content });
    } catch {
      setSubmitError("chat.sendingFailed");
    }
  }

  async function submitLead(event: FormEvent) {
    event.preventDefault();
    const email = lead.email.trim();
    const phone = lead.phone.trim();
    if (configState?.config?.leadForm?.requireEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setSubmitError("lead.invalidEmail");
      return;
    }
    if (configState?.config?.leadForm?.requirePhone && !phone) {
      setSubmitError("lead.invalidPhone");
      return;
    }
    setLeadSubmitting(true);
    setSubmitError(null);
    try {
      const response = await fetch("/api/widget/lead", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json", authorization: `Bearer ${sessionToken}`, "x-widget-parent-origin": parentOrigin ?? "" },
        body: JSON.stringify({ visitorId: visitorIdRef.current, ...(lead.name.trim() ? { name: lead.name.trim() } : {}), ...(email ? { email } : {}), ...(phone ? { phone } : {}) }),
      });
      if (!response.ok) {
        const code = await response.json().then((data: { code?: unknown }) => data.code, () => null);
        setSubmitError(code === "invalid_phone" ? "lead.invalidPhone" : code === "invalid_email" ? "lead.invalidEmail" : "chat.sendingFailed");
        return;
      }
      setLeadDone(true);
      setLeadOpen(false);
    } catch {
      setSubmitError("chat.sendingFailed");
    } finally {
      setLeadSubmitting(false);
    }
  }

  const leadForm = configState?.config?.leadForm;
  const showLeadBeforeChat = chatLoaded && Boolean(leadForm?.showBeforeChat) && !leadDone && messages.length === 0;
  // The row under the message box is there from the start, so the button arriving after the first message moves nothing.
  const leadRow = chatLoaded && Boolean(leadForm?.enabled) && !leadDone;
  const showLeadButton = leadRow && messages.length > 0;
  const voiceEnabled = Boolean(configState?.voiceEnabled) && Boolean(configState?.businessSlug);
  const configErrorCode = config.error instanceof Error && ["originDenied", "invalidKey", "configLoad"].includes(config.error.message) ? config.error.message : config.isError ? "configLoad" : null;
  // Until the settings and the history load, placeholders hold the place of the name, the call
  // button and the chat, so nothing moves when they arrive.
  const chatPending = !chatLoaded && !config.isError && !submitError?.startsWith("errors.");
  // The greeting opens an empty chat and stays at the top once the visitor writes. A returning visitor's chat starts at their history.
  const [greetingKept, setGreetingKept] = useState(false);
  useEffect(() => {
    if (chatLoaded && messages.length === 0) setGreetingKept(true);
  }, [chatLoaded, messages.length]);
  const showGreeting = chatLoaded && (messages.length === 0 || greetingKept);
  const canSend = chatLoaded && Boolean(draft.trim()) && !sending && !leadOpen;

  return (
    // The chat fills the frame at a fixed height and only the thread scrolls, so new messages never
    // resize the frame or move the page around it.
    <main className="relative flex h-dvh min-h-0 flex-col overflow-hidden bg-white text-zinc-900 antialiased">
      <WidgetHeader
        color={color}
        onColor={onColor}
        title={title}
        subtitle={chatLoaded ? configState?.config?.subtitle : undefined}
        pending={chatPending}
        actions={chatPending || (chatLoaded && voiceEnabled) || sheet ? (
          <>
            {chatPending ? <div className="h-8 w-20 animate-pulse rounded-full bg-zinc-100" aria-hidden="true" /> : null}
            {chatLoaded && voiceEnabled ? <VoiceButton businessSlug={configState!.businessSlug!} visitorId={visitorIdRef.current} sessionToken={sessionToken} parentOrigin={parentOrigin} onStatusChange={setSubmitError} onCaptions={setVoiceCaptions} /> : null}
            {sheet ? (
              <button type="button" className={cn(WIDGET_ICON_BUTTON, "-mr-1.5")} aria-label={t("chat.close")} onClick={() => window.parent?.postMessage({ type: "close" }, "*")}>
                <ChevronDown className="size-5" />
              </button>
            ) : null}
          </>
        ) : null}
      />

      {callActive ? <CallStatus status={voiceCaptions.status} t={t} /> : null}

      {chatLoaded && handoff ? (
        <div className="flex shrink-0 items-center gap-2 border-b border-amber-100 bg-amber-50 px-4 py-2 text-xs font-medium text-amber-900" role="status">
          <UserRound className="size-3.5 shrink-0" aria-hidden="true" />
          <span>{handling.waitingForTeam ? t("chat.waitingForTeam") : handling.teamMemberName ? t("chat.teamMemberInChat", { name: handling.teamMemberName }) : t("chat.handoffBanner")}</span>
        </div>
      ) : null}

      <div
        ref={threadRef}
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-4 py-4"
        onScroll={(event) => {
          const thread = event.currentTarget;
          followThreadRef.current = thread.scrollHeight - thread.scrollTop - thread.clientHeight < 64;
        }}
      >
        {configErrorCode ? <p className="m-auto max-w-64 text-center text-sm text-zinc-500">{t(`errors.${configErrorCode}` as never)}</p> : null}
        {chatPending ? (
          <div className="flex flex-col gap-2" role="status">
            <span className="sr-only">{t("chat.loadingTranscript")}</span>
            <div className="h-9 w-3/5 animate-pulse rounded-[18px] rounded-bl-md bg-zinc-100" aria-hidden="true" />
            <div className="h-9 w-2/5 animate-pulse rounded-[18px] rounded-bl-md bg-zinc-100" aria-hidden="true" />
          </div>
        ) : null}
        {showGreeting ? (
          <div className="flex justify-start">
            <WidgetBubble from="assistant" color={color} onColor={onColor} className="whitespace-pre-wrap">{configState?.config?.greeting || t("chat.welcome")}</WidgetBubble>
          </div>
        ) : null}
        {showLeadBeforeChat ? <LeadForm lead={lead} setLead={setLead} onSubmit={submitLead} submitting={leadSubmitting} onSkip={() => { setLeadDone(true); setLeadOpen(false); }} color={color} onColor={onColor} t={t} /> : null}
        {chatLoaded ? thread.map(({ message, teamMemberName, joined, showName }, index) => {
          const fromVisitor = message.role === "user";
          // Messages in a row from the same side sit closer together.
          const continued = !joined && !showName && thread[index - 1]?.message.role === message.role;
          const text = messageText(message);
          return (
            <Fragment key={message.id}>
              {joined ? <ThreadNote>{teamMemberName ? t("chat.teamJoined", { name: teamMemberName }) : t("chat.teamJoinedNoName")}</ThreadNote> : null}
              {streamingMessageId === message.id && !text.trim() ? <WidgetTyping label={t("chat.pendingLabel")} /> : (
                <div className={cn("flex flex-col gap-1", fromVisitor ? "items-end" : "items-start", continued && "-mt-2")}>
                  {showName ? <span className="px-1 text-xs font-medium text-zinc-500">{teamMemberName ?? t("chat.teamLabel")}</span> : null}
                  <WidgetBubble from={fromVisitor ? "visitor" : "assistant"} color={color} onColor={onColor}>
                    <p><MessageContent content={text} pending={streamingMessageId === message.id} /></p>
                  </WidgetBubble>
                </div>
              )}
            </Fragment>
          );
        }) : null}
        {sending && !handoff && messages.at(-1)?.role === "user" ? <WidgetTyping label={t("chat.pendingLabel")} /> : null}
        {voiceTranscriptShown ? <VoiceTranscript captions={voiceCaptions} color={color} onColor={onColor} t={t} /> : null}
        {submitError ? <p className="mx-auto max-w-[85%] rounded-xl bg-red-50 px-3 py-2 text-center text-xs text-red-700">{t(submitError)}</p> : null}
      </div>

      <form className="flex shrink-0 flex-col gap-1 px-3 pt-1 pb-3" onSubmit={(event) => void submitChat(event)}>
        <WidgetComposerField
          color={color}
          onColor={onColor}
          value={draft}
          onChange={setDraft}
          placeholder={t("chat.composerPlaceholder")}
          sendLabel={t("chat.send")}
          disabled={!chatLoaded || sending || leadOpen}
          canSend={canSend}
          sending={sending}
        />
        {leadRow ? (
          <div className="flex h-7 items-center px-2">
            {showLeadButton ? (
              <button type="button" onClick={() => setLeadOpen(true)} disabled={leadOpen} className="inline-flex items-center gap-1.5 rounded-full text-xs font-medium text-zinc-500 outline-none hover:text-zinc-900 focus-visible:ring-2 focus-visible:ring-zinc-900/30">
                <UserRound className="size-3.5" aria-hidden="true" />{t("chat.leaveDetails")}
              </button>
            ) : null}
          </div>
        ) : null}
      </form>

      {leadOpen && !showLeadBeforeChat ? <LeadOverlay lead={lead} setLead={setLead} onSubmit={submitLead} submitting={leadSubmitting} onClose={() => setLeadOpen(false)} color={color} onColor={onColor} t={t} /> : null}
    </main>
  );
}

type ThreadEntry = {
  message: WidgetMessage;
  /** The first name of the team member who wrote the message, when they have one. */
  teamMemberName: string | null;
  /** The first team message after the receptionist's: someone from the team joined the chat. */
  joined: boolean;
  /** Where the speaker changes to a team member, their name goes above the message. */
  showName: boolean;
};

/**
 * The messages the thread shows, with who from the team wrote them. A reply
 * with no text, which is all the chat sends back while the team has it, isn't
 * shown, unless it's still streaming.
 */
export function threadEntries(messages: WidgetMessage[], streamingMessageId: string | null): ThreadEntry[] {
  let teamHasChat = false;
  let previousSpeaker: string | null = null;
  return messages.flatMap((message) => {
    if (message.role === "assistant" && !messageText(message).trim() && message.id !== streamingMessageId) return [];
    const fromTeam = message.role === "assistant" && message.metadata?.fromTeam === true;
    const name = fromTeam ? message.metadata?.teamMemberName ?? null : null;
    const speaker = fromTeam ? `team:${name ?? ""}` : message.role;
    const entry = { message, teamMemberName: name, joined: fromTeam && !teamHasChat, showName: fromTeam && speaker !== previousSpeaker };
    if (message.role === "assistant") teamHasChat = fromTeam;
    previousSpeaker = speaker;
    return [entry];
  });
}

const WIDGET_ICON_BUTTON = "flex size-9 shrink-0 items-center justify-center rounded-full text-zinc-500 outline-none transition-colors hover:bg-zinc-100 hover:text-zinc-900 focus-visible:ring-2 focus-visible:ring-zinc-900/30";
const WIDGET_PILL_BUTTON = "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium outline-none transition-[background-color,transform] duration-150 ease-out focus-visible:ring-2 focus-visible:ring-zinc-900/30 enabled:active:scale-[0.97] disabled:opacity-50";

function VoiceButton({ businessSlug, visitorId, sessionToken, parentOrigin, onStatusChange, onCaptions }: { businessSlug: string; visitorId: string; sessionToken: string | null; parentOrigin: string | null; onStatusChange: (message: string | null) => void; onCaptions: (captions: VoiceCaptions) => void }) {
  const { t } = useTranslation("widget");
  // The iframe runs on the app's own origin, so the call starts here with the
  // widget session token and the embedding page's origin as proof of access.
  const { status, errorKey, remoteAudioRef, transcript, startCall, endCall } = useWebVoiceCall({
    businessSlug,
    widgetId: "lobbystack-widget",
    getStartPayload: async () => ({ visitorId }),
    getHeaders: () => ({ ...(sessionToken ? { authorization: `Bearer ${sessionToken}` } : {}), ...(parentOrigin ? { "x-widget-parent-origin": parentOrigin } : {}) }),
  });

  useEffect(() => {
    if (status === "connected") onStatusChange(null);
    if (status === "error") onStatusChange(errorKey === "connectionDropped" ? "chat.voiceEnded" : "chat.voiceUnavailable");
  }, [errorKey, onStatusChange, status]);

  useEffect(() => {
    onCaptions({ status, turns: transcript });
  }, [onCaptions, status, transcript]);

  const active = status === "requesting_microphone" || status === "connecting" || status === "connected";
  // A small labelled button beside the business name: easy to find without crowding out the chat.
  return (
    <>
      <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />
      {active ? (
        <button type="button" className={cn(WIDGET_PILL_BUTTON, "border-red-200 bg-red-50 text-red-700 hover:bg-red-100")} onClick={() => void endCall()}><PhoneOff className="size-3.5" aria-hidden="true" />{t("chat.voiceEnd")}</button>
      ) : (
        <button type="button" className={cn(WIDGET_PILL_BUTTON, "border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50")} title={t("chat.voiceButton")} onClick={() => void startCall()} disabled={status === "ending"}><Phone className="size-3.5" aria-hidden="true" />{t("chat.voiceStart")}</button>
      )}
    </>
  );
}

/** Under the header while a call runs: waiting for the microphone, connecting, then live. */
function CallStatus({ status, t }: { status: WebVoiceWidgetStatus; t: (key: string) => string }) {
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-zinc-100 bg-zinc-50 px-4 py-2 text-xs text-zinc-600" role="status">
      {status === "connected" ? (
        <>
          <span className="relative flex size-2 shrink-0" aria-hidden="true">
            <span className="absolute inline-flex size-full rounded-full bg-red-500 opacity-60 motion-safe:animate-ping" />
            <span className="relative size-2 rounded-full bg-red-500" />
          </span>
          <span className="font-medium text-red-600">{t("chat.voiceLive")}</span>
          <span className="truncate">{t("chat.voiceConnected")}</span>
        </>
      ) : status === "connecting" ? (
        <><LoaderCircle className="size-3.5 shrink-0 animate-spin" aria-hidden="true" />{t("chat.voiceConnecting")}</>
      ) : (
        <><Mic className="size-3.5 shrink-0" aria-hidden="true" />{t("chat.voiceRequestingMic")}</>
      )}
    </div>
  );
}

/** A centered note between hairlines, for events in the chat such as the team joining. */
function ThreadNote({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-1 text-xs text-zinc-500">
      <span className="h-px flex-1 bg-zinc-200" aria-hidden="true" />
      <span className="shrink-0">{children}</span>
      <span className="h-px flex-1 bg-zinc-200" aria-hidden="true" />
    </div>
  );
}

// Live captions of a widget voice call, in the chat thread. They stay after the
// call ends, until the next call starts, and aren't kept on reload.
function VoiceTranscript({ captions, color, onColor, t }: { captions: VoiceCaptions; color: string; onColor: string; t: (key: string) => string }) {
  const turns = captions.turns.filter((turn) => turn.text.trim());
  return (
    <section className="flex flex-col gap-3" aria-label={t("chat.voiceTranscript")}>
      <ThreadNote><span className="inline-flex items-center gap-1.5"><Phone className="size-3" aria-hidden="true" />{t("chat.voiceTranscript")}</span></ThreadNote>
      {turns.map((turn, index) => (
        <div key={index} className={cn("flex", turn.speaker === "caller" ? "justify-end" : "justify-start")}>
          <WidgetBubble from={turn.speaker === "caller" ? "visitor" : "assistant"} color={color} onColor={onColor} className="whitespace-pre-wrap">{turn.text.trim()}</WidgetBubble>
        </div>
      ))}
    </section>
  );
}

type Lead = { name: string; email: string; phone: string };
type LeadProps = { lead: Lead; setLead: (value: Lead) => void; onSubmit: (event: FormEvent) => void; submitting: boolean; color: string; onColor: string; t: (key: string) => string };

const WIDGET_FIELD = "h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-base text-zinc-900 outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-zinc-400 focus:border-zinc-300 focus:ring-4 focus:ring-zinc-900/5";

function LeadFields({ lead, setLead, t }: Pick<LeadProps, "lead" | "setLead" | "t">) {
  return (
    <div className="flex flex-col gap-2">
      <input className={WIDGET_FIELD} placeholder={t("lead.name")} aria-label={t("lead.name")} autoComplete="name" value={lead.name} onChange={(event) => setLead({ ...lead, name: event.target.value })} />
      <input className={WIDGET_FIELD} placeholder={t("lead.email")} aria-label={t("lead.email")} autoComplete="email" type="email" value={lead.email} onChange={(event) => setLead({ ...lead, email: event.target.value })} />
      <input className={WIDGET_FIELD} placeholder={t("lead.phone")} aria-label={t("lead.phone")} autoComplete="tel" type="tel" value={lead.phone} onChange={(event) => setLead({ ...lead, phone: event.target.value })} />
    </div>
  );
}

function LeadActions({ submitting, onSkip, color, onColor, t }: Pick<LeadProps, "submitting" | "color" | "onColor" | "t"> & { onSkip: () => void }) {
  return (
    <div className="mt-3 flex items-center justify-end gap-2">
      <button type="button" className="h-9 rounded-full px-3 text-sm font-medium text-zinc-600 outline-none hover:bg-zinc-100 hover:text-zinc-900 focus-visible:ring-2 focus-visible:ring-zinc-900/30" onClick={onSkip}>{t("lead.skip")}</button>
      <button type="submit" className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full px-4 text-sm font-medium outline-none transition-transform duration-150 ease-out focus-visible:ring-2 focus-visible:ring-zinc-900/30 focus-visible:ring-offset-2 enabled:active:scale-[0.97] disabled:opacity-70" style={{ backgroundColor: color, color: onColor }} disabled={submitting} aria-busy={submitting || undefined}>
        {submitting ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}{t("lead.submit")}
      </button>
    </div>
  );
}

function LeadOverlay({ onClose, ...props }: LeadProps & { onClose: () => void }) {
  return (
    <div className="absolute inset-0 z-10 flex items-end bg-zinc-900/25 p-3 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-150">
      <form className="w-full rounded-3xl bg-white p-5 shadow-xl ring-1 ring-zinc-900/5 motion-safe:animate-in motion-safe:slide-in-from-bottom-4 motion-safe:duration-200" onSubmit={props.onSubmit}>
        <h2 className="text-[15px] font-medium">{props.t("lead.heading")}</h2>
        <p className="mt-0.5 mb-4 text-[13px] text-zinc-500">{props.t("lead.description")}</p>
        <LeadFields {...props} />
        <LeadActions {...props} onSkip={onClose} />
      </form>
    </div>
  );
}

function LeadForm({ onSkip, ...props }: LeadProps & { onSkip: () => void }) {
  return (
    <form className="rounded-2xl border border-zinc-200 bg-white p-4" onSubmit={props.onSubmit}>
      <h2 className="text-sm font-medium">{props.t("lead.beforeChatHeading")}</h2>
      <p className="mt-0.5 mb-3 text-[13px] text-zinc-500">{props.t("lead.description")}</p>
      <LeadFields {...props} />
      <LeadActions {...props} onSkip={onSkip} />
    </form>
  );
}
