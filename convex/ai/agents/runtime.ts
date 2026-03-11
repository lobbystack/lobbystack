// @ts-nocheck
import { createThread } from "@convex-dev/agent";
import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "../../_generated/server";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { receptionistAgent } from "../../lib/components";

function buildGroundedPrompt(input: {
  summary: string;
  bookingPolicy: string;
  knowledgeDigest: string;
  hoursCount: number;
  knowledge: Array<{ text: string }>;
  prompt: string;
}): string {
  return [
    `Business summary: ${input.summary}`,
    `Booking policy: ${input.bookingPolicy}`,
    `Knowledge digest: ${input.knowledgeDigest || "No long-form knowledge configured."}`,
    `Business hours count: ${input.hoursCount}`,
    `Relevant knowledge:\n${input.knowledge.map((entry) => entry.text).join("\n---\n")}`,
    `User message: ${input.prompt}`,
  ].join("\n\n");
}

export const requireMembershipByUserId = internalQuery({
  args: {
    businessId: v.id("businesses"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("business_memberships")
      .withIndex("by_user_id_and_business_id", (q) =>
        q.eq("userId", args.userId).eq("businessId", args.businessId),
      )
      .unique();
  },
});

export const getConversationAiState = internalQuery({
  args: {
    conversationId: v.id("conversations"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("conversation_ai_state")
      .withIndex("by_conversation_id", (q) => q.eq("conversationId", args.conversationId))
      .unique();
  },
});

export const storeConversationThread = internalMutation({
  args: {
    businessId: v.id("businesses"),
    conversationId: v.id("conversations"),
    threadId: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("conversation_ai_state")
      .withIndex("by_conversation_id", (q) => q.eq("conversationId", args.conversationId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { threadId: args.threadId });
      return existing._id;
    }

    return await ctx.db.insert("conversation_ai_state", args);
  },
});

async function ensureConversationThread(
  ctx: Parameters<typeof createThread>[0],
  businessId: Id<"businesses">,
  conversationId: Id<"conversations">,
): Promise<string> {
  const existing = await (ctx as any).runQuery(
    internal["ai/agents/runtime"].getConversationAiState,
    { conversationId },
  );

  if (existing) {
    return existing.threadId;
  }

  const threadId = await createThread(ctx as any, receptionistAgent.component, {
    title: `Conversation ${String(conversationId)}`,
    summary: `Business ${String(businessId)} conversation`,
  });

  await (ctx as any).runMutation(internal["ai/agents/runtime"].storeConversationThread, {
    businessId,
    conversationId,
    threadId,
  });

  return threadId;
}

async function generateGroundedReply(
  ctx: Parameters<typeof createThread>[0],
  businessId: Id<"businesses">,
  conversationId: Id<"conversations">,
  prompt: string,
): Promise<string> {
  const snapshot = await (ctx as any).runQuery(internal["ai/context/snapshots"].getByBusinessId, {
    businessId,
  });
  if (!snapshot) {
    throw new Error("Business context snapshot is missing.");
  }

  const knowledge = await (ctx as any).runAction(
    internal["ai/context/knowledge"].searchKnowledgeInternal,
    {
      businessId,
      query: prompt,
      limit: 4,
    },
  );

  const threadId = await ensureConversationThread(ctx, businessId, conversationId);
  const result = await receptionistAgent.generateText(
    ctx as any,
    { threadId },
    {
      prompt: buildGroundedPrompt({
        summary: snapshot.summary,
        bookingPolicy: snapshot.bookingPolicy,
        knowledgeDigest: snapshot.knowledgeDigest,
        hoursCount: snapshot.hours.length,
        knowledge,
        prompt,
      }),
    } as any,
  );
  return result.text;
}

export const generateSmsReply = internalAction({
  args: {
    businessId: v.id("businesses"),
    conversationId: v.id("conversations"),
    prompt: v.string(),
  },
  handler: async (ctx, args) => {
    return await generateGroundedReply(
      ctx,
      args.businessId,
      args.conversationId,
      args.prompt,
    );
  },
});

export const previewReplyInternal = internalAction({
  args: {
    businessId: v.id("businesses"),
    conversationId: v.id("conversations"),
    prompt: v.string(),
  },
  handler: async (ctx, args) => {
    return {
      text: await generateGroundedReply(
        ctx,
        args.businessId,
        args.conversationId,
        args.prompt,
      ),
    };
  },
});
