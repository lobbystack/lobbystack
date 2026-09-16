import { randomUUID } from "node:crypto";

import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { buildChatSystemPrompt } from "@lobbystack/ai";
import { appendMessage, getCachedBusinessSnapshot, getOrCreateWidgetConversation, loadWidgetChatHistory, recordAiGenerationEvent, registerWidgetVisitor, reserveWidgetChatUsageInTransaction, type DomainContext } from "@lobbystack/domain";
import { conversations, withBusinessTransaction } from "@lobbystack/db";
import { createTextAiProvider } from "@lobbystack/providers";
import { widgetChatRequestSchema, type BusinessContextSnapshot } from "@lobbystack/shared";

import { getWorkerDatabase, readJson } from "@/lib/api-helpers";
import { createWorkerDomainContext } from "@/lib/domain-context";
import { resolveWidgetSessionAccess, type WidgetSession } from "@/lib/widget-access";
import { requestIpHash } from "@/lib/widget-keys";
import { enforceWidgetRateLimits } from "@/lib/widget-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const SAFE_CHAT_ERROR = "The chat could not be processed.";

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

async function loadAutomationState(context: DomainContext, businessId: string, conversationId: string): Promise<"ai_active" | "human_handoff"> {
  return await withBusinessTransaction(context.db, { businessId, actorType: "worker" }, async (tx) => {
    const row = (await tx.select({ automationState: conversations.automationState }).from(conversations).where(eq(conversations.id, conversationId)).limit(1))[0];
    return row?.automationState === "human_handoff" ? "human_handoff" : "ai_active";
  });
}

export async function POST(request: Request) {
  try {
    const body = widgetChatRequestSchema.parse(await readJson(request));
    const access = await resolveWidgetSessionAccess(request);
    if (!access.ok) return access.response;
    const { session } = access;
    if (session.visitorId !== body.visitorId) return NextResponse.json({ error: "The visitor does not match the widget session.", code: "widget_visitor_mismatch" }, { status: 403 });
    const rate = await enforceWidgetRateLimits({ businessId: session.businessId, widgetKeyId: session.widgetKeyId, visitorId: body.visitorId, ...(requestIpHash(request) ? { ipHash: requestIpHash(request) } : {}), operation: "chat" }, { consume: true });
    if (!rate.allowed) {
      return NextResponse.json({ error: "Chat rate limit reached.", code: rate.code }, { status: rate.status });
    }

    const context = createWorkerDomainContext();
    await registerWidgetVisitor(context, { businessId: session.businessId, visitorId: body.visitorId, metadata: { userAgent: request.headers.get("user-agent") ?? undefined } });
    const { conversationId } = await getOrCreateWidgetConversation(context, { businessId: session.businessId, widgetVisitorId: body.visitorId });
    const inboundMessageId = await appendMessage(context, { businessId: session.businessId, conversationId, body: body.content, direction: "inbound", channel: "web_chat" });
    const { queueOperatorAlert } = await import("@lobbystack/domain");
    await queueOperatorAlert(context, {
      businessId: session.businessId,
      eventKind: "widgetChat",
      eventKey: `widget-chat:${inboundMessageId}`,
      subject: "New website chat message",
      body: body.content.slice(0, 240) || "A website visitor sent a chat message.",
    });
    const automationState = await loadAutomationState(context, session.businessId, conversationId);
    const provider = automationState === "ai_active" ? createTextAiProvider() : undefined;
    if (automationState === "ai_active" && !provider) {
      return NextResponse.json({ error: "The AI chat provider is not configured.", code: "ai_provider_unavailable" }, { status: 503 });
    }
    if (automationState === "ai_active") {
      const reservation = await withBusinessTransaction(getWorkerDatabase().db, { businessId: session.businessId, actorType: "worker" }, async (tx) => await reserveWidgetChatUsageInTransaction(tx, { businessId: session.businessId, conversationId }));
      if (!reservation.allowed) return NextResponse.json({ error: "This month's chat session limit has been reached.", code: "chat_ai_limit_reached" }, { status: 402 });
    }
    const assistantMessageId = randomUUID();
    const traceId = randomUUID();
    const generationStartedAt = performance.now();
    const stream = createUIMessageStream({
      onError: () => SAFE_CHAT_ERROR,
      execute: async ({ writer }) => {
        writer.write({ type: "start", messageId: assistantMessageId });
        try {
          if (automationState === "human_handoff") {
            writer.write({ type: "finish", finishReason: "stop", messageMetadata: { automationState: "human_handoff" } });
            return;
          }

          const snapshot = await getCachedBusinessSnapshot(context, { businessId: session.businessId });
          const activeSnapshot = snapshot ?? fallbackSnapshot(session);
          const history = await loadWidgetChatHistory(context, { businessId: session.businessId, conversationId });
          const historyText = history.slice(-20).map((row) => `${row.direction === "inbound" ? "Visitor" : "Assistant"}: ${row.body}`).join("\n");
          writer.write({ type: "text-start", id: assistantMessageId });
          const text: string[] = [];
          const generation = provider!.streamReply({
            instructions: `${buildChatSystemPrompt(activeSnapshot)}\nReply in ${body.locale === "fr" || (!body.locale && (session.config.localeOverride === "fr" || session.defaultLocale === "fr")) ? "French" : "English"} unless the visitor clearly asks to switch languages.`,
            prompt: body.content,
            context: historyText,
            abortSignal: request.signal,
            onError: (error) => logGenerationFailure(error),
            onAbort: () => console.warn("Widget chat generation aborted"),
          });
          for await (const part of generation.textStream) {
            text.push(part);
            writer.write({ type: "text-delta", id: assistantMessageId, delta: part });
          }
          const reply = text.join("");
          if (!reply.trim()) throw new Error("The AI assistant returned an empty reply.");
          const [usage, finishReason] = await Promise.all([generation.usage, generation.finishReason]);
          const persistedAssistantMessageId = await appendMessage(context, { businessId: session.businessId, conversationId, body: reply, direction: "outbound", channel: "web_chat", aiGenerated: true });
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
          writer.write({ type: "message-metadata", messageMetadata: { automationState: "ai_active" } });
          writer.write({ type: "finish", finishReason });
        } catch (cause) {
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
            error: request.signal.aborted ? "request_aborted" : "generation_failed",
          }).catch((recordingError: unknown) => logGenerationFailure(recordingError));
          writer.write({ type: "error", errorText: request.signal.aborted ? "The chat request was cancelled." : SAFE_CHAT_ERROR });
          writer.write({ type: "message-metadata", messageMetadata: { automationState: "ai_active" } });
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
