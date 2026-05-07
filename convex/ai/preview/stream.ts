import {
  StreamId,
  StreamIdValidator,
} from "@convex-dev/persistent-text-streaming";
import {
  observedInternalMutation as internalMutation,
  observedMutation as mutation,
} from "../../telemetry/observedFunctions";
import { query } from "../../_generated/server";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { v } from "convex/values";
import { ensureCurrentUser, requireCurrentUser, requireMembership } from "../../lib/auth";
import { persistentTextStreaming } from "../../lib/components";
import { getSensitiveContentExpiresAt } from "../../privacy/retention";

import { observedHttpAction as httpAction } from "../../telemetry/observedFunctions";
// Convex component types can exceed local tsc recursion depth on these builders.
// @ts-ignore Deep type instantiation from Convex component generics.
export const createPreviewSession = mutation({
  args: {
    businessId: v.id("businesses"),
    prompt: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ensureCurrentUser(ctx);
    await requireMembership(ctx, args.businessId);
    const streamId = await persistentTextStreaming.createStream(ctx);
    // @ts-ignore Deep type instantiation from Convex component generics.
    const previewSessionId = await ctx.db.insert("preview_sessions", {
      businessId: args.businessId,
      userId: user._id,
      prompt: args.prompt,
      streamId,
      expiresAt: getSensitiveContentExpiresAt(),
    });
    return { previewSessionId, streamId };
  },
});

// @ts-ignore Deep type instantiation from Convex component generics.
export const getPreviewBody = query({
  args: {
    streamId: StreamIdValidator,
  },
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const previewSession = await ctx.db
      .query("preview_sessions")
      .withIndex("by_stream_id", (q) => q.eq("streamId", String(args.streamId)))
      .unique();

    if (!previewSession || previewSession.userId !== user._id) {
      throw new Error("Preview session not found.");
    }

    await requireMembership(ctx, previewSession.businessId);

    return await persistentTextStreaming.getStreamBody(
      ctx,
      args.streamId as StreamId,
    );
  },
});

export const recordPreviewOutput = internalMutation({
  args: {
    streamId: v.string(),
    threadId: v.string(),
  },
  handler: async (ctx, args) => {
    const previewSession = await ctx.db
      .query("preview_sessions")
      .withIndex("by_stream_id", (q) => q.eq("streamId", args.streamId))
      .unique();

    if (!previewSession) {
      return null;
    }

    await ctx.db.patch(previewSession._id, {
      threadId: args.threadId,
    });
    return null;
  },
});

export const streamPreviewResponse = httpAction(async (ctx, request) => {
  const internalServiceToken = process.env.INTERNAL_SERVICE_TOKEN;
  if (
    !internalServiceToken ||
    request.headers.get("x-internal-service-token") !== internalServiceToken
  ) {
    return new Response("Unauthorized.", { status: 401 });
  }

  const body = (await request.json()) as {
    businessId: Id<"businesses">;
    prompt: string;
    streamId: StreamId;
  };

  const preview = await ctx.runAction(
    internal.ai.context.knowledge.generatePreviewKnowledgeAnswer,
    {
      businessId: body.businessId,
      prompt: body.prompt,
    },
  );
  await ctx.runMutation(internal.ai.preview.stream.recordPreviewOutput, {
    streamId: body.streamId,
    threadId: preview.threadId,
  });

  const response = await persistentTextStreaming.stream(
    ctx,
    request,
    body.streamId,
    async (_streamCtx, _streamRequest, _streamId, appendChunk) => {
      const chunks = preview.text
        .split(/(?<=[.!?])\s+/)
        .map((chunk: string) => chunk.trim())
        .filter((chunk: string) => chunk.length > 0);

      for (const chunk of chunks) {
        await appendChunk(`${chunk} `);
      }
    },
  );

  return response;
});
