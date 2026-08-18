import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { buildChatSystemPrompt } from "@lobbystack/ai";
import { appendMessage, getCachedBusinessSnapshot, getOrCreateWidgetConversation, getWidgetChatAllowance, loadWidgetChatHistory, registerWidgetVisitor, reserveWidgetChatUsageInTransaction, type DomainContext } from "@lobbystack/domain";
import { conversations, withBusinessTransaction } from "@lobbystack/db";
import { OpenAiCompatibleTextProvider } from "@lobbystack/providers";
import { widgetChatRequestSchema, type BusinessContextSnapshot } from "@lobbystack/shared";

import { getWorkerDatabase, readJson } from "@/lib/api-helpers";
import { createWorkerDomainContext } from "@/lib/domain-context";
import { resolveWidgetAccess, type WidgetSession } from "@/lib/widget-access";
import { requestIpHash } from "@/lib/widget-keys";
import { enforceWidgetRateLimits } from "@/lib/widget-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

function sseChunk(encoder: TextEncoder, payload: unknown): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(payload)}\n\n`);
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
    const access = await resolveWidgetAccess(request, body.widgetKey);
    if (!access.ok) return access.response;
    const { session } = access;
    const rate = await enforceWidgetRateLimits({ businessId: session.businessId, widgetKeyId: session.widgetKeyId, visitorId: body.visitorId, ...(requestIpHash(request) ? { ipHash: requestIpHash(request) } : {}), operation: "chat" }, { consume: true });
    if (!rate.allowed) {
      return NextResponse.json({ error: "Chat rate limit reached.", code: rate.code }, { status: rate.status });
    }

    const encoder = new TextEncoder();
    const context = createWorkerDomainContext();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const emit = (payload: unknown) => controller.enqueue(sseChunk(encoder, payload));
        try {
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
          emit({ type: "start", chatId: conversationId, messageId: inboundMessageId });

          const automationState = await loadAutomationState(context, session.businessId, conversationId);
          if (automationState === "human_handoff") {
            emit({ type: "handoff", chatId: conversationId });
            emit({ type: "finish", message: null, automationState: "human_handoff" });
            return;
          }

          const billing = await getWidgetChatAllowance(context, { businessId: session.businessId });
          if (!billing.allowed) {
            const fallback = "Thanks for your message! Our team will reply shortly.";
            await appendMessage(context, { businessId: session.businessId, conversationId, body: fallback, direction: "outbound", channel: "web_chat", aiGenerated: false });
            emit({ type: "error", code: "chat_ai_limit_reached", message: "This month's chat session limit has been reached." });
            emit({ type: "finish", message: { id: "", role: "assistant", content: fallback, createdAt: new Date().toISOString() }, automationState: "ai_active" });
            return;
          }

          const snapshot = await getCachedBusinessSnapshot(context, { businessId: session.businessId });
          const activeSnapshot = snapshot ?? fallbackSnapshot(session);
          await withBusinessTransaction(getWorkerDatabase().db, { businessId: session.businessId, actorType: "worker" }, async (tx) => {
            await reserveWidgetChatUsageInTransaction(tx, { businessId: session.businessId, conversationId });
          });
          const history = await loadWidgetChatHistory(context, { businessId: session.businessId, conversationId });
          const historyText = history.slice(-20).map((row) => `${row.direction === "inbound" ? "Visitor" : "Assistant"}: ${row.body}`).join("\n");
          const apiKey = process.env.AI_CHAT_API_KEY ?? process.env.OPENAI_API_KEY;

          if (!apiKey) {
            const fallback = "Thanks for your message! Our team will reply shortly.";
            await appendMessage(context, { businessId: session.businessId, conversationId, body: fallback, direction: "outbound", channel: "web_chat", aiGenerated: false });
            emit({ type: "text-delta", delta: "" });
            emit({ type: "finish", message: { id: "", role: "assistant", content: fallback, createdAt: new Date().toISOString() }, automationState: "ai_active" });
            return;
          }

          const provider = new OpenAiCompatibleTextProvider({
            apiKey,
            ...(process.env.AI_CHAT_MODEL ? { model: process.env.AI_CHAT_MODEL } : {}),
            ...(process.env.AI_CHAT_BASE_URL ? { baseURL: process.env.AI_CHAT_BASE_URL } : {}),
            ...(process.env.AI_CHAT_PROVIDER_NAME ? { name: process.env.AI_CHAT_PROVIDER_NAME } : {}),
          });
          const text: string[] = [];
          for await (const part of provider.streamReply({
            instructions: buildChatSystemPrompt(activeSnapshot),
            prompt: body.content,
            context: historyText,
          })) {
            text.push(part);
            emit({ type: "text-delta", delta: part });
          }
          const reply = text.join("");
          if (!reply.trim()) throw new Error("The AI assistant returned an empty reply.");
          await appendMessage(context, { businessId: session.businessId, conversationId, body: reply, direction: "outbound", channel: "web_chat", aiGenerated: true });
          emit({ type: "finish", message: { id: "", role: "assistant", content: reply, createdAt: new Date().toISOString() }, automationState: "ai_active" });
        } catch (cause) {
          const message = cause instanceof Error ? cause.message : "The chat could not be processed.";
          emit({ type: "error", code: "chat_failed", message });
          emit({ type: "finish", message: null, automationState: "ai_active" });
        } finally {
          controller.close();
        }
      },
    });

    return new NextResponse(stream, {
      headers: {
        "content-type": "text/event-stream",
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
