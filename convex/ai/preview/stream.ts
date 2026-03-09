// @ts-nocheck
import {
  StreamId,
  StreamIdValidator,
} from "@convex-dev/persistent-text-streaming";
import { httpAction, mutation, query } from "../../_generated/server";
import { internal } from "../../_generated/api";
import { v } from "convex/values";
import { ensureCurrentUser, requireMembership } from "../../lib/auth";
import { persistentTextStreaming } from "../../lib/components";

export const createPreviewSession = mutation({
  args: {
    businessId: v.id("businesses"),
    prompt: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ensureCurrentUser(ctx);
    await requireMembership(ctx, args.businessId);
    const streamId = await persistentTextStreaming.createStream(ctx);
    const previewSessionId = await ctx.db.insert("preview_sessions", {
      businessId: args.businessId,
      userId: user._id,
      prompt: args.prompt,
      streamId,
    });
    return { previewSessionId, streamId };
  },
});

export const getPreviewBody = query({
  args: {
    streamId: StreamIdValidator,
  },
  handler: async (ctx, args) => {
    return await persistentTextStreaming.getStreamBody(
      ctx,
      args.streamId as StreamId,
    );
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
    businessId: string;
    prompt: string;
    streamId: string;
  };

  const preview = await ctx.runAction(
    internal["ai/context/knowledge"].generatePreviewKnowledgeAnswer,
    {
      businessId: body.businessId as any,
      prompt: body.prompt,
    },
  );

  const response = await persistentTextStreaming.stream(
    ctx,
    request,
    body.streamId as StreamId,
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
