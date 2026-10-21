import { randomUUID } from "node:crypto";

import { createUIMessageStream, createUIMessageStreamResponse, type LanguageModelUsage } from "ai";
import { NextResponse } from "next/server";

import { createReceptionistAgent } from "@lobbystack/agent-core/agent";
import { createAgentModel, describeAgentUsage } from "@lobbystack/agent-core/model";
import { announceLateWidgetReply, appendMessage, getCachedBusinessSnapshot, getOrCreateWidgetConversation, loadWidgetChatHistory, recordAiGenerationEvent, reserveWidgetChatUsageInTransaction, returnQuietTeamChat } from "@lobbystack/domain";
import { withBusinessTransaction } from "@lobbystack/db";
import { normalizeRuntimeLocale, runtimeLocaleName, widgetChatRequestSchema, type BusinessContextSnapshot, type RuntimeLocale } from "@lobbystack/shared";

import { getWorkerDatabase, readJson } from "@/lib/api-helpers";
import { createWorkerDomainContext } from "@/lib/domain-context";
import { resolveWidgetSessionAccess, type WidgetSession } from "@/lib/widget-access";
import { requestIpHash } from "@/lib/widget-keys";
import { enforceWidgetRateLimits } from "@/lib/widget-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const SAFE_CHAT_ERROR = "The chat could not be processed.";

// The reply when a model step hits the agent's output cap before writing any
// text: OpenAI counts reasoning toward the cap, so high reasoning can use it up.
const CUT_OFF_REPLY: Record<RuntimeLocale, string> = {
  en: "Sorry, my answer got cut off. Please ask again, or leave your name and number and someone from the team will get back to you.",
  fr: "Désolé, ma réponse a été coupée. Posez votre question à nouveau, ou laissez votre nom et votre numéro, et quelqu'un de l'équipe vous recontactera.",
  es: "Lo siento, mi respuesta se cortó. Vuelva a preguntar, o deje su nombre y su número y alguien del equipo se pondrá en contacto con usted.",
  sr: "Izvinite, moj odgovor se prekinuo. Pitajte ponovo, ili ostavite ime i broj telefona i neko iz tima će vam se javiti.",
  de: "Entschuldigung, meine Antwort wurde abgeschnitten. Bitte fragen Sie noch einmal, oder hinterlassen Sie Ihren Namen und Ihre Nummer, dann meldet sich jemand aus dem Team bei Ihnen.",
  pt: "Desculpe, minha resposta foi cortada. Pergunte de novo, ou deixe seu nome e número que alguém da equipe vai entrar em contato.",
  it: "Mi scusi, la mia risposta si è interrotta. Ripeta la domanda, oppure lasci il suo nome e il suo numero e qualcuno del team la ricontatterà.",
  nl: "Sorry, mijn antwoord werd afgebroken. Stel uw vraag nog een keer, of laat uw naam en nummer achter, dan neemt iemand van het team contact met u op.",
};

function logGenerationFailure(cause: unknown): void {
  console.error("Widget chat generation failed", {
    errorType: cause instanceof Error ? cause.name : typeof cause,
  });
}

function fallbackSnapshot(session: WidgetSession): BusinessContextSnapshot {
  return {
    businessId: session.businessId,
    version: "widget-fallback",
    generatedAt: new Date().toISOString(),
    displayName: session.businessName,
    timezone: "UTC",
    defaultLocale: session.defaultLocale,
    businessType: "other",
    greeting: session.config.greeting ?? "Welcome!",
    voiceInstructions: "",
    smsInstructions: "",
    chatInstructions: "Be friendly and concise in the chat widget.",
    summary: session.businessName,
    bookingPolicy: "Confirm availability before booking.",
    knowledgeDigest: "",
    transferPolicy: { mode: "never" },
    hours: [],
    closures: [],
    services: [],
    contactChannels: {},
  };
}

export async function POST(request: Request) {
  try {
    const body = widgetChatRequestSchema.parse(await readJson(request));
    const access = await resolveWidgetSessionAccess(request);
    if (!access.ok) return access.response;
    const { session } = access;
    if (session.visitorId !== body.visitorId) return NextResponse.json({ error: "The visitor does not match the widget session.", code: "widget_visitor_mismatch" }, { status: 403 });
    const rate = await enforceWidgetRateLimits({ businessId: session.businessId, widgetKeyId: session.widgetKeyId, visitorId: body.visitorId, ...(requestIpHash(request) ? { ipHash: requestIpHash(request) } : {}), operation: "chat" });
    if (!rate.allowed) {
      return NextResponse.json({ error: "Chat rate limit reached.", code: rate.code }, { status: rate.status });
    }

    const context = createWorkerDomainContext();
    const conversation = await getOrCreateWidgetConversation(context, { businessId: session.businessId, widgetVisitorId: body.visitorId });
    const { conversationId } = conversation;
    // With live chat on, a chat the team joined after the visitor asked for a
    // person goes back to the receptionist once the team goes quiet in it. A
    // chat the team took over itself stays paused until someone presses
    // Resume AI.
    const liveChatOn = session.config.liveChat?.enabled === true;
    const automationState = conversation.automationState === "human_handoff" && liveChatOn ? await returnQuietTeamChat(context, { businessId: session.businessId, conversationId }) : conversation.automationState;
    await appendMessage(context, { businessId: session.businessId, conversationId, body: body.content, direction: "inbound", channel: "web_chat" });
    const { queueOperatorAlert } = await import("@lobbystack/domain");
    await queueOperatorAlert(context, {
      businessId: session.businessId,
      eventKind: "widgetChat",
      // One alert per chat per day: the unique event key drops the rest.
      eventKey: `widget-chat:${conversationId}:${new Date().toISOString().slice(0, 10)}`,
      subject: "New website chat message",
      body: body.content.slice(0, 240) || "A website visitor sent a chat message.",
    });
    const model = automationState === "ai_active" ? createAgentModel() : undefined;
    if (automationState === "ai_active" && !model) {
      return NextResponse.json({ error: "The AI chat provider is not configured.", code: "ai_provider_unavailable" }, { status: 503 });
    }
    if (automationState === "ai_active") {
      const reservation = await withBusinessTransaction(getWorkerDatabase().db, { businessId: session.businessId, actorType: "worker" }, async (tx) => await reserveWidgetChatUsageInTransaction(tx, { businessId: session.businessId, conversationId }));
      if (!reservation.allowed) return NextResponse.json({ error: "This month's chat session limit has been reached.", code: "chat_ai_limit_reached" }, { status: 402 });
    }
    const assistantMessageId = randomUUID();
    const traceId = randomUUID();
    const generationStartedAt = performance.now();
    // Set when the receptionist asks the team to join: the chat then waits for them.
    let teamRequested = false;
    const replyMetadata = () => teamRequested ? { automationState: "human_handoff", waitingForTeam: true } : { automationState: "ai_active" };
    const stream = createUIMessageStream({
      onError: () => SAFE_CHAT_ERROR,
      execute: async ({ writer }) => {
        writer.write({ type: "start", messageId: assistantMessageId });
        // The reply as far as the visitor has seen it.
        const text: string[] = [];
        let replySaved = false;
        let generationUsage: (() => PromiseLike<LanguageModelUsage>) | undefined;
        // A visitor who leaves mid-reply, for another page or by reloading,
        // stops the model and its tool calls. The words they saw are the reply,
        // and the widget on their next page hears about it in case it loaded
        // the chat first.
        const keepReplyTheVisitorLeft = async () => {
          const reply = text.join("");
          const messageId = reply.trim() ? await appendMessage(context, { businessId: session.businessId, conversationId, body: reply, direction: "outbound", channel: "web_chat", aiGenerated: true }) : undefined;
          if (messageId) await announceLateWidgetReply(context, { businessId: session.businessId, conversationId, messageId });
          const rawUsage = await generationUsage?.().then((usage) => usage, () => undefined);
          void recordAiGenerationEvent(context, {
            businessId: session.businessId,
            operation: "widget.chat",
            conversationId,
            ...(messageId ? { messageId } : {}),
            traceId,
            isStreaming: true,
            ...describeAgentUsage(rawUsage, performance.now() - generationStartedAt),
            isError: true,
            error: "request_aborted",
          }).catch((cause: unknown) => logGenerationFailure(cause));
        };
        try {
          if (automationState === "human_handoff") {
            writer.write({ type: "finish", finishReason: "stop", messageMetadata: { automationState: "human_handoff" } });
            return;
          }

          const snapshot = await getCachedBusinessSnapshot(context, { businessId: session.businessId });
          const activeSnapshot = snapshot ?? fallbackSnapshot(session);
          const history = await loadWidgetChatHistory(context, { businessId: session.businessId, conversationId });
          // The widget's language answers; when it shows English, the widget's set language, else the business's caller language.
          // The widget's interface falls back to English for languages it lacks, so "en" says nothing about the visitor.
          const locale = normalizeRuntimeLocale(body.locale && body.locale !== "en" ? body.locale : session.config.localeOverride ?? session.defaultLocale);
          const agent = createReceptionistAgent({
            model: model!,
            context: {
              domain: context,
              snapshot: activeSnapshot,
              channel: "web_chat",
              conversationId,
              // With live chat on, a visitor who asks for a person can get someone from the team here.
              ...(liveChatOn ? { liveChat: { locale, onTeamRequested: () => { teamRequested = true; } } } : {}),
            },
            extraInstructions: `Reply in ${runtimeLocaleName(locale)} unless the visitor clearly asks to switch languages.`,
          });
          writer.write({ type: "text-start", id: assistantMessageId });
          // The history already ends with the visitor's new message.
          const generation = await agent.stream({
            messages: history.slice(-20).map((row) => ({ role: row.direction === "inbound" ? "user" as const : "assistant" as const, content: row.body })),
            abortSignal: request.signal,
          });
          generationUsage = () => generation.totalUsage;
          for await (const part of generation.textStream) {
            text.push(part);
            writer.write({ type: "text-delta", id: assistantMessageId, delta: part });
          }
          if (request.signal.aborted) {
            await keepReplyTheVisitorLeft().catch((cause: unknown) => logGenerationFailure(cause));
            return;
          }
          let reply = text.join("");
          const [rawUsage, finishReason] = await Promise.all([generation.totalUsage, generation.finishReason]);
          if (!reply.trim() && finishReason === "length") {
            reply = CUT_OFF_REPLY[locale];
            writer.write({ type: "text-delta", id: assistantMessageId, delta: reply });
          }
          if (!reply.trim()) throw new Error("The AI assistant returned an empty reply.");
          const usage = describeAgentUsage(rawUsage, performance.now() - generationStartedAt);
          const persistedAssistantMessageId = await appendMessage(context, { businessId: session.businessId, conversationId, body: reply, direction: "outbound", channel: "web_chat", aiGenerated: true });
          replySaved = true;
          // The widget on the visitor's next page may have loaded the chat before the reply was saved.
          if (request.signal.aborted) await announceLateWidgetReply(context, { businessId: session.businessId, conversationId, messageId: persistedAssistantMessageId });
          void recordAiGenerationEvent(context, {
            businessId: session.businessId,
            operation: "widget.chat",
            conversationId,
            messageId: persistedAssistantMessageId,
            traceId,
            isStreaming: true,
            ...usage,
          }).catch((cause: unknown) => logGenerationFailure(cause));
          writer.write({ type: "text-end", id: assistantMessageId });
          writer.write({ type: "message-metadata", messageMetadata: replyMetadata() });
          writer.write({ type: "finish", finishReason });
        } catch (cause) {
          // A model call stopped by the visitor leaving can end in an error.
          if (request.signal.aborted && !replySaved) {
            await keepReplyTheVisitorLeft().catch((recordingError: unknown) => logGenerationFailure(recordingError));
            return;
          }
          logGenerationFailure(cause);
          // The event deliberately contains only a stable category: provider
          // errors can include request or customer content in their messages.
          void recordAiGenerationEvent(context, {
            businessId: session.businessId,
            operation: "widget.chat",
            conversationId,
            traceId,
            provider: "unknown",
            model: "unknown",
            latencyMs: performance.now() - generationStartedAt,
            isStreaming: true,
            isError: true,
            error: "generation_failed",
          }).catch((recordingError: unknown) => logGenerationFailure(recordingError));
          writer.write({ type: "error", errorText: SAFE_CHAT_ERROR });
          writer.write({ type: "message-metadata", messageMetadata: replyMetadata() });
          writer.write({ type: "finish", finishReason: "error" });
        }
      },
    });

    return createUIMessageStreamResponse({
      stream,
      headers: {
        "cache-control": "no-cache, no-transform",
        "x-accel-buffering": "no",
      },
    });
  } catch (error) {
    if (error instanceof NextResponse) return error;
    const status = error !== null && typeof error === "object" && "status" in error && typeof (error as { status?: unknown }).status === "number" ? (error as { status: number }).status : 500;
    return NextResponse.json({ error: status >= 500 ? "Request failed." : error instanceof Error ? error.message : "Request failed." }, { status });
  }
}
