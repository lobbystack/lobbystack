"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useChat } from "@ai-sdk/react";
import { useQuery } from "@tanstack/react-query";
import { DefaultChatTransport, type UIMessage } from "ai";
import { ArrowUp } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useTelemetry } from "@/components/product-analytics";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FieldError } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Skeleton } from "@/components/ui/skeleton";
import { useUpgradePlanDialogOpener } from "@/components/upgrade-plan-dialog-context";
import { AuraVoiceDemo } from "@/components/web-voice/AuraVoiceDemo";
import { formatPhoneNumberDisplay } from "@/lib/phone";
import { requestJson } from "@/lib/request-json";
import { announceTestChatReplied, finishTestCall, registerTestWindow, setTestCallActive, type TestWindowOptions } from "@/lib/test-window";
import { cn } from "@/lib/utils";
import { renderSafeMarkdown } from "@/lib/widget-markdown";
import { DASHBOARD_TEST_CALL_WIDGET_ID, TEST_CHAT_MAX_MESSAGES } from "@lobbystack/shared";
import type { TelemetryEventName, TelemetryProperties } from "@lobbystack/telemetry";
import { LIVE_WEB_CALL_ENDPOINT } from "@lobbystack/web-voice";
import { useBusinessCan } from "./business-capabilities-provider";

type TestWindowAgent = { agentId: string; agentName: string; businessName: string; phoneNumber: string | null };

type WebVoiceControls = {
  forceEndCall: () => Promise<void>;
  startCall: () => Promise<void>;
};

function useTestWindowAgent(businessId: string, agentId: string | undefined) {
  return useQuery({
    queryKey: ["test-window", businessId, agentId ?? "default"],
    queryFn: () => requestJson<TestWindowAgent>(`/api/agent/test-window?businessId=${encodeURIComponent(businessId)}${agentId ? `&agentId=${encodeURIComponent(agentId)}` : ""}`),
  });
}

function messageText(message: UIMessage): string {
  return message.parts.flatMap((part) => part.type === "text" ? [part.text] : []).join("");
}

/** The chat with the agent. `children` scroll above the messages, and the box stays at the bottom. The browser alone holds the chat. */
function TestChat({ agentId, businessId, children }: { agentId: string | undefined; businessId: string; children: ReactNode }) {
  const { t } = useTranslation("common");
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [transport] = useState(() => new DefaultChatTransport({
    api: `/api/agent/test-chat?businessId=${encodeURIComponent(businessId)}`,
    prepareSendMessagesRequest: ({ messages }) => ({
      body: {
        ...(agentId ? { agentId } : {}),
        messages: messages.flatMap((message) => {
          const content = messageText(message).trim();
          return content && message.role !== "system" ? [{ role: message.role, content }] : [];
        }).slice(-TEST_CHAT_MAX_MESSAGES),
      },
    }),
  }));
  const { error, messages, sendMessage, status } = useChat({ transport, onFinish: ({ message }) => { if (messageText(message).trim()) announceTestChatReplied(); } });
  const busy = status === "submitted" || status === "streaming";
  const lastMessage = messages.at(-1);
  // A reply can come back empty when the model runs out of room before it writes.
  const failed = Boolean(error) || (status === "ready" && lastMessage?.role === "assistant" && !messageText(lastMessage).trim());

  useEffect(() => {
    const list = scrollRef.current;
    if (list && messages.length) list.scrollTop = list.scrollHeight;
  }, [messages]);

  const send = (event: FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    setDraft("");
    void sendMessage({ text });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex min-h-0 flex-1 flex-col items-center gap-4 overflow-y-auto" ref={scrollRef}>
        {children}
        {messages.length ? (
          <div className="flex w-full flex-col gap-2">
            {messages.map((message) => {
              const text = messageText(message);
              if (!text) return null;
              return message.role === "user"
                ? <p className="ml-auto max-w-[85%] rounded-xl bg-primary px-3 py-2 text-sm wrap-break-word whitespace-pre-wrap text-primary-foreground" key={message.id}>{text}</p>
                : <div className="mr-auto max-w-[85%] rounded-xl bg-muted px-3 py-2 text-sm wrap-break-word [&_a]:underline [&_a]:underline-offset-2" dangerouslySetInnerHTML={{ __html: renderSafeMarkdown(text) }} key={message.id} />;
            })}
          </div>
        ) : null}
        {failed ? <FieldError className="w-full">{t("testWindow.sendFailed")}</FieldError> : null}
      </div>
      <form className="shrink-0" onSubmit={send}>
        <InputGroup>
          <InputGroupInput aria-label={t("testWindow.message")} autoComplete="off" maxLength={4_000} onChange={(event) => setDraft(event.target.value)} placeholder={t("testWindow.message")} value={draft} />
          <InputGroupAddon align="inline-end">
            <InputGroupButton aria-label={t("testWindow.send")} disabled={busy || !draft.trim()} size="icon-xs" type="submit" variant="default"><ArrowUp /></InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </form>
    </div>
  );
}

type TestPanelProps = {
  agentId?: string | undefined;
  businessId: string;
  businessSlug: string;
  /** Hears when a call finishes, after the window has announced it. */
  onCallEnded?: () => void;
  onRegisterControls?: (controls: WebVoiceControls) => void;
  onUpgrade?: (() => void) | undefined;
};

/** The call, the agent's number and the chat. The window shows it, and Meet your agent embeds it. */
export function TestPanel({ agentId, businessId, businessSlug, onCallEnded, onRegisterControls, onUpgrade }: TestPanelProps) {
  const { t } = useTranslation("common");
  const telemetry = useTelemetry();
  const { resolvedTheme } = useTheme();
  const phoneNumber = useTestWindowAgent(businessId, agentId).data?.phoneNumber;

  const handleVoiceEvent = useCallback((eventName: TelemetryEventName, properties?: Record<string, unknown>) => {
    if (eventName === "web.voice.test_call_started") setTestCallActive(true);
    if (eventName === "web.voice.test_call_error") setTestCallActive(false);
    telemetry.track(eventName, { businessId, ...properties } as TelemetryProperties);
  }, [businessId, telemetry]);
  const handleCallEnded = useCallback(() => {
    finishTestCall();
    onCallEnded?.();
  }, [onCallEnded]);

  // The flag lives in a module, so it outlives this panel: leaving mid-call
  // must not keep every other surface waiting on a call that no longer exists.
  useEffect(() => () => setTestCallActive(false), []);

  return (
    <TestChat agentId={agentId} businessId={businessId}>
      <AuraVoiceDemo
        auraTone={resolvedTheme === "dark" ? "dark" : "light"}
        businessSlug={businessSlug}
        className="max-w-80 shrink-0"
        // The operator's login authorizes the call; the ID picks the workspace.
        endpoint={`${LIVE_WEB_CALL_ENDPOINT}?businessId=${encodeURIComponent(businessId)}`}
        {...(agentId ? { getStartPayload: async () => ({ agentId }) } : {})}
        onCallEnded={handleCallEnded}
        onEvent={handleVoiceEvent}
        {...(onRegisterControls ? { onRegisterControls } : {})}
        {...(onUpgrade ? { onUpgrade } : {})}
        widgetId={DASHBOARD_TEST_CALL_WIDGET_ID}
      />
      {phoneNumber ? (
        <p className="flex shrink-0 items-center gap-2 text-sm">
          <span className="text-muted-foreground">{t("testWindow.orCall")}</span>
          <a className="font-medium text-foreground underline-offset-4 hover:underline" href={`tel:${phoneNumber}`}>{formatPhoneNumberDisplay(phoneNumber)}</a>
        </p>
      ) : null}
    </TestChat>
  );
}

function TestWindowBody({ agentId, businessId, ...panel }: TestPanelProps) {
  const { t } = useTranslation("common");
  const agent = useTestWindowAgent(businessId, agentId);
  return (
    <>
      <DialogHeader className="gap-1 pr-8">
        <DialogTitle className="truncate leading-5">{agent.isPending ? <Skeleton className="h-5 w-32" /> : agent.data?.agentName ?? t("testCall.trigger")}</DialogTitle>
        <DialogDescription className="truncate" render={<div />}>{agent.isPending ? <Skeleton className="h-5 w-40" /> : agent.data?.businessName}</DialogDescription>
      </DialogHeader>
      <TestPanel agentId={agentId} businessId={businessId} {...panel} />
    </>
  );
}

type TestWindowProps = {
  businessId?: string;
  businessSlug?: string;
  className?: string;
};

/** The window for testing an agent, and its button in the utility bar. Anything else opens it with openTestWindow. */
export function TestWindow({ businessId, businessSlug, className }: TestWindowProps) {
  const { t } = useTranslation("common");
  const [opened, setOpened] = useState<TestWindowOptions | null>(null);
  const voiceControlsRef = useRef<WebVoiceControls | null>(null);
  // Only a business with billing gets an upgrade offer.
  const openUpgradePlanDialog = useUpgradePlanDialogOpener();
  const can = useBusinessCan();
  const billing = useQuery({ queryKey: ["billing", businessId], enabled: Boolean(businessId) && can("billing"), queryFn: () => requestJson<{ effectivePlan: string }>(`/api/billing?businessId=${encodeURIComponent(businessId!)}`) });

  useEffect(() => {
    if (!businessSlug) return;
    return registerTestWindow(setOpened);
  }, [businessSlug]);

  const close = () => {
    void voiceControlsRef.current?.forceEndCall();
    finishTestCall();
    setOpened(null);
  };

  if (!businessId || !businessSlug) return null;

  return (
    <div className={cn("hidden items-center md:flex", className)}>
      <Button aria-label={t("testCall.trigger")} onClick={() => setOpened({})} size="sm" type="button" variant="outline">
        <span className="text-sidebar-foreground">{t("testCall.trigger")}</span>
      </Button>

      {/* A stray click beside the window must not hang up a call. */}
      <Dialog disablePointerDismissal onOpenChange={(open) => { if (!open) close(); }} open={opened !== null}>
        <DialogContent className="flex h-dvh max-h-dvh max-w-none flex-col gap-4 rounded-none p-4 sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:max-w-md sm:rounded-4xl sm:p-6">
          {opened ? (
            <TestWindowBody
              agentId={opened.agentId}
              businessId={businessId}
              businessSlug={businessSlug}
              onRegisterControls={(controls) => { voiceControlsRef.current = controls; }}
              // A paid plan at its spending cap raises the cap instead; it has no plan to buy.
              onUpgrade={openUpgradePlanDialog && billing.data?.effectivePlan === "free_cloud" ? () => { close(); openUpgradePlanDialog(); } : undefined}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
