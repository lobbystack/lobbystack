"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Phone, PhoneOff, Send } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { renderSafeMarkdown } from "@/lib/widget-markdown";

type WidgetConfigPayload = {
  key: string;
  business: { id: string; name: string; defaultLocale: "en" | "fr" };
  config: {
    color?: string;
    title?: string;
    subtitle?: string;
    greeting?: string;
    localeOverride?: "en" | "fr";
    leadForm?: { enabled: boolean; requirePhone?: boolean; requireEmail?: boolean; showBeforeChat?: boolean };
  };
  billing: { chatAllowed: boolean; plan: string };
  greeting?: string;
  snapshotPresent: boolean;
  businessSlug?: string;
  webCallBaseUrl?: string;
  voiceEnabled?: boolean;
};

type WidgetMessageMetadata = { automationState?: "ai_active" | "human_handoff" };
type WidgetMessage = UIMessage<WidgetMessageMetadata>;

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


function MessageContent({ content, pending }: { content: string; pending?: boolean }) {
  return <span className="widget-message-content" dangerouslySetInnerHTML={{ __html: renderSafeMarkdown(content || (pending ? "…" : "")) }} />;
}

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

export function WidgetChatClient({ widgetKey }: { widgetKey: string }) {
  const { t } = useTranslation("widget");
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
  const [lead, setLead] = useState({ name: "", email: "", phone: "" });
  const [leadSubmitting, setLeadSubmitting] = useState(false);

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
          locale: i18n.language === "fr" ? "fr" : "en",
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
  });

  const sending = status === "submitted" || status === "streaming";
  const handoff = messages.some((message) => message.metadata?.automationState === "human_handoff");
  const lastMessage = messages.at(-1);
  const streamingMessageId = status === "streaming" && lastMessage?.role === "assistant" ? lastMessage.id : null;

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.source !== window.parent) return;
      const data = event.data as { type?: string; visitorId?: string; token?: string; parentOrigin?: string; code?: string };
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
    if (locale === "en" || locale === "fr") void i18n.changeLanguage(locale);
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

  useEffect(() => {
    if (!configState) return;
    const id = visitorIdRef.current || parentVisitorId || localVisitorId(widgetKey);
    visitorIdRef.current = id;
    const loadHistory = async () => {
      const url = new URL("/api/widget/history", window.location.origin);
      try {
        const response = await fetch(url, { headers: { authorization: `Bearer ${sessionToken}`, "x-widget-parent-origin": parentOrigin ?? "" }, credentials: "include" });
        if (!response.ok) return;
        const data = await response.json() as { messages?: Array<{ id: string; role: "user" | "assistant"; content: string }> };
        if (Array.isArray(data.messages)) {
          setMessages(data.messages.map((message) => ({
            id: message.id,
            role: message.role === "assistant" ? "assistant" : "user",
            parts: [{ type: "text", text: message.content }],
          })));
        }
      } catch {
        /* transcript resume is best effort */
      }
    };
    void loadHistory();
  }, [configState, parentOrigin, parentVisitorId, sessionToken, widgetKey]);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight });
  }, [messages, status]);

  useEffect(() => {
    const reportHeight = () => {
      window.parent?.postMessage({ type: "resize", height: document.documentElement.scrollHeight }, "*");
    };
    reportHeight();
    const timer = window.setInterval(reportHeight, 500);
    return () => window.clearInterval(timer);
  }, []);

  const color = configState?.config?.color ?? "#0f766e";
  const title = configState?.config?.title || configState?.business?.name || t("chat.titlePlaceholder");

  async function submitChat(event: FormEvent) {
    event.preventDefault();
    const content = draft.trim();
    if (!content || sending) return;
    if (!visitorIdRef.current) return;
    setSubmitError(null);
    setDraft("");
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
        setSubmitError("chat.sendingFailed");
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

  const showLeadBeforeChat = Boolean(configState?.config?.leadForm?.showBeforeChat) && !leadDone && messages.length === 0;
  const voiceEnabled = Boolean(configState?.voiceEnabled) && Boolean(configState?.businessSlug);
  const configErrorCode = config.error instanceof Error && ["originDenied", "invalidKey", "configLoad"].includes(config.error.message) ? config.error.message : null;

  return (
    <main className="flex h-full min-h-0 flex-col bg-white text-zinc-900" style={{ minHeight: "100dvh" }}>
      <header className="flex items-center gap-3 border-b px-4 py-3">
        <div className="flex size-9 items-center justify-center rounded-full text-sm font-bold text-white" style={{ backgroundColor: color }} aria-hidden="true">
          {(title || "?")[0]?.toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{title}</p>
          {configState?.config?.subtitle ? <p className="truncate text-xs text-zinc-500">{configState.config.subtitle}</p> : null}
        </div>
        {voiceEnabled ? <VoiceButton className="ml-auto" businessSlug={configState!.businessSlug!} baseUrl={configState!.webCallBaseUrl} visitorId={visitorIdRef.current} sessionToken={sessionToken} parentOrigin={parentOrigin} onStatusChange={setSubmitError} /> : null}
      </header>

      {handoff ? <div className="border-b bg-amber-50 px-4 py-2 text-xs font-medium text-amber-800">{t("chat.handoffBanner")}</div> : null}

      <div ref={threadRef} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
        {configErrorCode ? <p className="text-center text-sm text-zinc-500">{t(`errors.${configErrorCode}` as never)}</p> : null}
        {config.isError ? <p className="text-center text-sm text-zinc-500">{t("errors.configLoad")}</p> : null}
        {config.isLoading ? <p className="text-center text-sm text-zinc-400">{t("chat.loadingTranscript")}</p> : null}
        {config.data && messages.length === 0 && !showLeadBeforeChat ? (
          <div className="flex flex-col gap-1 text-sm text-zinc-600">
            <p className="font-medium text-zinc-800">{t("chat.welcome")}</p>
            {configState?.config?.greeting ? <p className="rounded-xl rounded-bl-sm bg-zinc-100 px-3 py-2 whitespace-pre-wrap">{configState.config.greeting}</p> : null}
          </div>
        ) : null}
        {messages.map((message) => (
          <div key={message.id} className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}>
            <div className={cn("max-w-[85%] rounded-2xl px-3 py-2 text-sm", message.role === "user" ? "rounded-br-sm text-white" : "rounded-bl-sm bg-zinc-100")} style={message.role === "user" ? { backgroundColor: color } : undefined}>
              <p><MessageContent content={messageText(message)} pending={streamingMessageId === message.id} /></p>
            </div>
          </div>
        ))}
        {sending && messages.at(-1)?.role === "user" ? <div className="flex justify-start"><div className="rounded-2xl rounded-bl-sm bg-zinc-100 px-3 py-2 text-sm text-zinc-400">{t("chat.pendingLabel")}</div></div> : null}
        {submitError ? <p className="text-center text-xs text-red-600">{t(submitError)}</p> : null}
      </div>

      {showLeadBeforeChat ? (
        <LeadForm className="border-t p-4" lead={lead} setLead={setLead} onSubmit={submitLead} submitting={leadSubmitting} onSkip={() => { setLeadDone(true); setLeadOpen(false); }} config={configState?.config} t={t} />
      ) : null}

      <form className="flex items-end gap-2 border-t p-3" onSubmit={(event) => void submitChat(event)}>
        {!leadDone && messages.length > 0 && configState?.config?.leadForm?.enabled ? (
          <Button type="button" onClick={() => setLeadOpen(true)} variant="outline" className="shrink-0 text-xs" disabled={leadOpen}>{t("chat.leaveDetails")}</Button>
        ) : null}
        <Input
          className="min-h-11 flex-1"
          placeholder={t("chat.composerPlaceholder")}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          disabled={!config.data || sending || leadOpen}
          aria-label={t("chat.composerPlaceholder")}
        />
        <Button aria-label={t("chat.send")} disabled={!draft.trim() || sending || leadOpen} loading={sending} size="icon-lg" type="submit" style={{ backgroundColor: color }}><Send /></Button>
      </form>

      {leadOpen && !showLeadBeforeChat ? <LeadOverlay lead={lead} setLead={setLead} onSubmit={submitLead} submitting={leadSubmitting} onClose={() => setLeadOpen(false)} config={configState?.config} t={t} /> : null}
    </main>
  );
}

function VoiceButton({ className, businessSlug, baseUrl, visitorId, sessionToken, parentOrigin, onStatusChange }: { className?: string; businessSlug: string; baseUrl: string | undefined; visitorId: string; sessionToken: string | null; parentOrigin: string | null; onStatusChange: (message: string | null) => void }) {
  const [status, setStatus] = useState<"idle" | "connecting" | "connected" | "error" | "ending">("idle");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const endpoint = baseUrl || (process.env.NODE_ENV === "production" ? "https://voice.lobbystack.com/web-call/sessions" : "http://127.0.0.1:3001/web-call/sessions");

  const cleanup = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    peerRef.current?.close();
    peerRef.current = null;
    if (audioRef.current) audioRef.current.srcObject = null;
  };

  const endCall = async () => {
    setStatus("ending");
    const sessionId = sessionIdRef.current;
    sessionIdRef.current = null;
    if (sessionId) void fetch(`${endpoint}/${encodeURIComponent(sessionId)}/end`, { method: "POST", keepalive: true }).catch(() => undefined);
    cleanup();
    setStatus("idle");
  };

  useEffect(() => () => {
    const sessionId = sessionIdRef.current;
    if (sessionId) void fetch(`${endpoint}/${encodeURIComponent(sessionId)}/end`, { method: "POST", keepalive: true }).catch(() => undefined);
    cleanup();
  }, [endpoint]);

  const startCall = async () => {
    setStatus("connecting");
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === "undefined") {
        throw new Error("unsupported");
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      streamRef.current = stream;
      const peer = new RTCPeerConnection();
      peerRef.current = peer;
      stream.getAudioTracks().forEach((track) => peer.addTrack(track, stream));
      peer.ontrack = (event) => {
        const remote = event.streams[0];
        if (remote && audioRef.current) {
          audioRef.current.srcObject = remote;
          void audioRef.current.play().catch(() => undefined);
        }
      };
      peer.onconnectionstatechange = () => {
        if (peer.connectionState === "connected") {
          setStatus("connected");
          onStatusChange(null);
        }
        if (peer.connectionState === "failed" || peer.connectionState === "disconnected") {
          cleanup();
          setStatus("error");
          onStatusChange("voiceEnded");
        }
      };
      const offer = await peer.createOffer({ offerToReceiveAudio: true });
      await peer.setLocalDescription(offer);
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json", ...(sessionToken ? { authorization: `Bearer ${sessionToken}` } : {}), ...(parentOrigin ? { "x-widget-parent-origin": parentOrigin } : {}) },
        body: JSON.stringify({ businessSlug, widgetId: "lobbystack-widget", visitorId, widgetSessionToken: sessionToken, sdp: offer.sdp, pageUrl: window.location.href }),
      });
      if (!response.ok) {
        cleanup();
        setStatus("error");
        onStatusChange("voiceUnavailable");
        return;
      }
      const answer = await response.json() as { sessionId: string; sdp: string };
      sessionIdRef.current = answer.sessionId;
      await peer.setRemoteDescription({ type: "answer", sdp: answer.sdp });
    } catch {
      cleanup();
      setStatus("error");
      onStatusChange("voiceUnavailable");
    }
  };

  const active = status === "connecting" || status === "connected";
  return (
    <>
      <audio ref={audioRef} autoPlay playsInline className="hidden" />
      {active ? (
        <Button variant="destructive" size="icon" className="ml-auto" aria-label="End call" onClick={() => void endCall()}><PhoneOff className="size-4" /></Button>
      ) : (
        <Button variant="outline" size="icon" className={cn("ml-auto", className)} aria-label="Talk to us live" onClick={() => void startCall()} disabled={status === "ending"}><Phone className="size-4" /></Button>
      )}
    </>
  );
}

function LeadOverlay({ lead, setLead, onSubmit, submitting, onClose, config, t }: { lead: { name: string; email: string; phone: string }; setLead: (value: { name: string; email: string; phone: string }) => void; onSubmit: (event: FormEvent) => void; submitting: boolean; onClose: () => void; config: WidgetConfigPayload["config"] | undefined; t: (key: string) => string }) {
  return (
    <div className="absolute inset-0 z-10 flex items-end bg-black/30 p-4 sm:items-center">
      <form className="w-full rounded-2xl bg-white p-4 shadow-xl" onSubmit={onSubmit}>
        <h2 className="text-sm font-semibold">{t("lead.heading")}</h2>
        <p className="mb-3 text-xs text-zinc-500">{t("lead.description")}</p>
        <div className="space-y-3">
          <label className="block text-xs font-medium text-zinc-700">{t("lead.name")}<Input className="mt-1" value={lead.name} onChange={(event) => setLead({ ...lead, name: event.target.value })} /></label>
          <label className="block text-xs font-medium text-zinc-700">{t("lead.email")}<Input className="mt-1" type="email" value={lead.email} onChange={(event) => setLead({ ...lead, email: event.target.value })} /></label>
          <label className="block text-xs font-medium text-zinc-700">{t("lead.phone")}<Input className="mt-1" type="tel" value={lead.phone} onChange={(event) => setLead({ ...lead, phone: event.target.value })} /></label>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>{t("lead.skip")}</Button>
          <Button type="submit" loading={submitting}>{t("lead.submit")}</Button>
        </div>
      </form>
    </div>
  );
}

function LeadForm({ lead, setLead, onSubmit, submitting, onSkip, config, t, className }: { lead: { name: string; email: string; phone: string }; setLead: (value: { name: string; email: string; phone: string }) => void; onSubmit: (event: FormEvent) => void; submitting: boolean; onSkip: () => void; config: WidgetConfigPayload["config"] | undefined; t: (key: string) => string; className?: string }) {
  return (
    <form className={cn("space-y-3", className)} onSubmit={onSubmit}>
      <div>
        <h2 className="text-sm font-semibold">{t("lead.beforeChatHeading")}</h2>
        <p className="text-xs text-zinc-500">{t("lead.description")}</p>
      </div>
      <Input placeholder={t("lead.name")} value={lead.name} onChange={(event) => setLead({ ...lead, name: event.target.value })} />
      <Input placeholder={t("lead.email")} type="email" value={lead.email} onChange={(event) => setLead({ ...lead, email: event.target.value })} />
      <Input placeholder={t("lead.phone")} type="tel" value={lead.phone} onChange={(event) => setLead({ ...lead, phone: event.target.value })} />
      <div className="flex gap-2">
        <Button type="submit" className="flex-1" loading={submitting}>{t("lead.submit")}</Button>
        <Button type="button" variant="ghost" onClick={onSkip}>{t("lead.skip")}</Button>
      </div>
    </form>
  );
}
