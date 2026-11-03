import { randomUUID } from "node:crypto";

import { createReceptionistAgent } from "@lobbystack/agent-core/agent";
import { createAgentModel, describeAgentUsage } from "@lobbystack/agent-core/model";
import { activeAgentExistsInTransaction, getBusinessSnapshotForAgent, recordAiGenerationEvent, recordTestChatReply } from "@lobbystack/domain";
import { normalizeRuntimeLocale, runtimeLocaleName, testChatRequestSchema } from "@lobbystack/shared";

import { jsonError } from "@/lib/api-helpers";
import { createWorkerDomainContext } from "@/lib/domain-context";
import { operatorRoute } from "@/lib/operator-request";
import { enforceTestChatRateLimits } from "@/lib/test-chat-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * One turn of a test chat, on the website chat's agent. The browser holds the
 * chat and the agent gets only its read-only tools, so this writes no
 * conversation, message or alert, reserves no chat session, and leaves the
 * inbox alone. It only notes when a reply came, for the plans offer. The rate limit stands in for the allowance. The generation still
 * goes on the host's cost record, under its own operation.
 */
export const POST = operatorRoute(async ({ request, userId, body, businessId, transaction }) => {
  const { agentId, messages } = testChatRequestSchema.parse(body);
  const agentFound = await transaction(async (tx) => agentId ? await activeAgentExistsInTransaction(tx, { businessId, agentId }) : true, { minimumRole: "business_admin" });
  if (!agentFound) throw jsonError("Agent not found.", 404, "agent_not_found");
  const rate = await enforceTestChatRateLimits({ businessId, userId });
  if (!rate.allowed) throw jsonError("Too many test messages. Try again later.", rate.status, "test_chat_rate_limited");
  const model = createAgentModel();
  if (!model) throw jsonError("The AI chat provider is not configured.", 503, "ai_provider_unavailable");

  const domain = createWorkerDomainContext();
  const snapshot = await getBusinessSnapshotForAgent(domain, { businessId, agentId });
  if (!snapshot) throw jsonError("The agent isn't ready yet.", 409, "snapshot_missing");

  const agent = createReceptionistAgent({
    model,
    context: { domain, snapshot, channel: "web_chat", testChat: true },
    extraInstructions: `Reply in ${runtimeLocaleName(normalizeRuntimeLocale(snapshot.defaultLocale))} unless the visitor clearly asks to switch languages.`,
  });
  const startedAt = performance.now();
  const generation = await agent.stream({ messages, abortSignal: request.signal });
  void Promise.resolve(generation.totalUsage)
    .then((usage) => recordAiGenerationEvent(domain, { businessId, operation: "agent.test_chat", traceId: randomUUID(), isStreaming: true, ...describeAgentUsage(usage, performance.now() - startedAt) }))
    .catch((cause: unknown) => console.error("Test chat generation failed", { errorType: cause instanceof Error ? cause.name : typeof cause }));
  // An empty reply isn't a working test, so only text counts towards the plans offer.
  void Promise.resolve(generation.text)
    .then((text) => text.trim() ? recordTestChatReply(domain, { businessId }) : undefined)
    .catch((cause: unknown) => console.error("Test chat reply was not recorded", { errorType: cause instanceof Error ? cause.name : typeof cause }));
  return generation.toUIMessageStreamResponse({ headers: { "cache-control": "no-cache, no-transform", "x-accel-buffering": "no" } });
});
