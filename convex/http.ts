import { httpRouter } from "convex/server";
import {
  escapeXmlText,
  normalizeTwilioFormFields,
  validateTwilioSignature,
} from "./lib/twilioSecurity";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { auth } from "./auth";
import { streamPreviewResponse } from "./ai/preview/stream";

const http = httpRouter();

async function requireTwilioSignature(
  request: Request,
  params: Record<string, string>,
): Promise<Response | null> {
  const isValid = await validateTwilioSignature({
    authToken: process.env.TWILIO_AUTH_TOKEN,
    signatureHeader: request.headers.get("x-twilio-signature"),
    url: request.url,
    params,
  });

  if (!isValid) {
    return new Response("Invalid Twilio signature", { status: 403 });
  }

  return null;
}

function requireServiceToken(request: Request): Response | null {
  if (
    !process.env.INTERNAL_SERVICE_TOKEN ||
    request.headers.get("x-internal-service-token") !== process.env.INTERNAL_SERVICE_TOKEN
  ) {
    return new Response("Unauthorized", { status: 401 });
  }
  return null;
}

auth.addHttpRoutes(http);

http.route({
  path: "/twilio/sms/inbound",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const form = await request.formData();
    const payload = normalizeTwilioFormFields(form.entries());
    const invalidSignature = await requireTwilioSignature(request, payload);
    if (invalidSignature) {
      return invalidSignature;
    }

    const result = await ctx.runAction(internal.conversations.webhooks.handleTwilioSmsInbound, {
      from: payload.From ?? "",
      to: payload.To ?? "",
      body: payload.Body ?? "",
      messageSid: payload.MessageSid ?? "",
    });

    const twiml = [
      "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
      "<Response>",
      `<Message>${escapeXmlText(result.reply)}</Message>`,
      "</Response>",
    ].join("");

    return new Response(twiml, {
      status: 200,
      headers: { "Content-Type": "text/xml" },
    });
  }),
});

http.route({
  path: "/preview/stream",
  method: "POST",
  handler: streamPreviewResponse,
});

http.route({
  path: "/voice/context",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const unauthorized = requireServiceToken(request);
    if (unauthorized) {
      return unauthorized;
    }

    const body = (await request.json()) as {
      phoneNumber: string;
      channel?: "voice" | "sms";
    };
    const phoneNumber = await ctx.runQuery(
      internal.businesses.catalog.resolveBusinessByPhoneNumber,
      {
        e164: body.phoneNumber,
        channel: body.channel ?? "voice",
      },
    );

    if (!phoneNumber) {
      return new Response("Not found", { status: 404 });
    }

    const snapshot = await ctx.runQuery(internal.ai.context.snapshots.getByBusinessId, {
      businessId: phoneNumber.businessId,
    });

    if (!snapshot) {
      return new Response("Snapshot not ready", { status: 404 });
    }

    return Response.json({
      businessId: phoneNumber.businessId,
      snapshot,
    });
  }),
});

http.route({
  path: "/voice/call/start",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const unauthorized = requireServiceToken(request);
    if (unauthorized) {
      return unauthorized;
    }

    const body = (await request.json()) as {
      businessId: string;
      twilioCallSid: string;
      gatewaySessionId?: string;
      from: string;
      to: string;
      startedAt: string;
    };

    const result = await ctx.runMutation(internal.voice.runtime.startCall, {
      businessId: body.businessId as Id<"businesses">,
      twilioCallSid: body.twilioCallSid,
      ...(body.gatewaySessionId !== undefined
        ? { gatewaySessionId: body.gatewaySessionId }
        : {}),
      from: body.from,
      to: body.to,
      startedAt: body.startedAt,
    });

    return Response.json(result);
  }),
});

http.route({
  path: "/voice/call/transcript",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const unauthorized = requireServiceToken(request);
    if (unauthorized) {
      return unauthorized;
    }

    const body = (await request.json()) as {
      businessId: string;
      callId: string;
      sequence: number;
      speaker: string;
      text: string;
      final: boolean;
      confidence?: number;
    };

    const transcriptId = await ctx.runMutation(internal.voice.runtime.appendTranscriptSegment, {
      businessId: body.businessId as Id<"businesses">,
      callId: body.callId as Id<"calls">,
      sequence: body.sequence,
      speaker: body.speaker,
      text: body.text,
      final: body.final,
      ...(body.confidence !== undefined ? { confidence: body.confidence } : {}),
    });

    return Response.json({ transcriptId });
  }),
});

http.route({
  path: "/voice/call/transfer-state",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const unauthorized = requireServiceToken(request);
    if (unauthorized) {
      return unauthorized;
    }

    const body = (await request.json()) as {
      callId: string;
      transferState: string;
    };

    await ctx.runMutation(internal.voice.runtime.setTransferState, {
      callId: body.callId as Id<"calls">,
      transferState: body.transferState,
    });

    return Response.json({ ok: true });
  }),
});

http.route({
  path: "/voice/call/complete",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const unauthorized = requireServiceToken(request);
    if (unauthorized) {
      return unauthorized;
    }

    const body = (await request.json()) as {
      callId: string;
      status: string;
      endedAt: string;
      disposition?: string;
    };

    await ctx.runMutation(internal.voice.runtime.completeCall, {
      callId: body.callId as Id<"calls">,
      status: body.status,
      endedAt: body.endedAt,
      ...(body.disposition !== undefined ? { disposition: body.disposition } : {}),
    });

    return Response.json({ ok: true });
  }),
});

http.route({
  path: "/voice/call/reconcile-status",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const unauthorized = requireServiceToken(request);
    if (unauthorized) {
      return unauthorized;
    }

    const body = (await request.json()) as {
      twilioCallSid: string;
      callStatus: string;
      sequenceNumber?: number;
      callbackSource?: string;
      providerUpdatedAt: string;
      providerDurationSeconds?: number;
    };

    const result = await ctx.runMutation(internal.voice.runtime.reconcileTwilioCallStatus, {
      twilioCallSid: body.twilioCallSid,
      callStatus: body.callStatus,
      providerUpdatedAt: body.providerUpdatedAt,
      ...(body.sequenceNumber !== undefined
        ? { sequenceNumber: body.sequenceNumber }
        : {}),
      ...(body.callbackSource !== undefined
        ? { callbackSource: body.callbackSource }
        : {}),
      ...(body.providerDurationSeconds !== undefined
        ? { providerDurationSeconds: body.providerDurationSeconds }
        : {}),
    });

    return Response.json(result);
  }),
});

http.route({
  path: "/voice/call/recording",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const unauthorized = requireServiceToken(request);
    if (unauthorized) {
      return unauthorized;
    }

    const url = new URL(request.url);
    const callId = url.searchParams.get("callId");
    const durationMs = url.searchParams.get("durationMs");

    if (!callId) {
      return new Response("Missing callId", { status: 400 });
    }

    const blob = await request.blob();
    const recordingStorageId = await ctx.storage.store(blob);

    await ctx.runMutation(internal.voice.runtime.attachCallRecording, {
      callId: callId as Id<"calls">,
      recordingStorageId,
      recordingContentType: blob.type || "audio/wav",
      recordingByteLength: blob.size,
      ...(durationMs ? { recordingDurationMs: Number(durationMs) } : {}),
    });

    return Response.json({
      recordingStorageId,
    });
  }),
});

http.route({
  path: "/voice/tool/find-availability",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const unauthorized = requireServiceToken(request);
    if (unauthorized) {
      return unauthorized;
    }

    const body = (await request.json()) as {
      businessId: string;
      serviceName: string;
      date: string;
      timezone: string;
      preferredStaffId?: string;
      preferredHour24?: number;
      preferredMinute?: number;
      limit?: number;
    };

    const result = await ctx.runAction(internal.voice.runtime.findAvailabilityForVoice, {
      businessId: body.businessId as Id<"businesses">,
      serviceName: body.serviceName,
      date: body.date,
      timezone: body.timezone,
      ...(body.preferredStaffId !== undefined
        ? { preferredStaffId: body.preferredStaffId as Id<"staff"> }
        : {}),
      ...(body.preferredHour24 !== undefined
        ? { preferredHour24: body.preferredHour24 }
        : {}),
      ...(body.preferredMinute !== undefined
        ? { preferredMinute: body.preferredMinute }
        : {}),
      ...(body.limit !== undefined ? { limit: body.limit } : {}),
    });

    return Response.json(result);
  }),
});

http.route({
  path: "/voice/tool/check-availability",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const unauthorized = requireServiceToken(request);
    if (unauthorized) {
      return unauthorized;
    }

    const body = (await request.json()) as {
      businessId: string;
      serviceName: string;
      startsAt: string;
      timezone: string;
      preferredStaffId?: string;
    };

    const result = await ctx.runAction(internal.voice.runtime.checkAvailabilityForVoice, {
      businessId: body.businessId as Id<"businesses">,
      serviceName: body.serviceName,
      startsAt: body.startsAt,
      timezone: body.timezone,
      ...(body.preferredStaffId !== undefined
        ? { preferredStaffId: body.preferredStaffId as Id<"staff"> }
        : {}),
    });

    return Response.json(result);
  }),
});

http.route({
  path: "/voice/tool/book-appointment",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const unauthorized = requireServiceToken(request);
    if (unauthorized) {
      return unauthorized;
    }

    const body = (await request.json()) as {
      businessId: string;
      serviceName: string;
      startsAt: string;
      timezone: string;
      preferredStaffId?: string;
      contactName?: string;
      contactPhone: string;
    };

    const result = await ctx.runAction(internal.voice.runtime.bookAppointmentForVoice, {
      businessId: body.businessId as Id<"businesses">,
      serviceName: body.serviceName,
      startsAt: body.startsAt,
      timezone: body.timezone,
      ...(body.preferredStaffId !== undefined
        ? { preferredStaffId: body.preferredStaffId as Id<"staff"> }
        : {}),
      ...(body.contactName !== undefined ? { contactName: body.contactName } : {}),
      contactPhone: body.contactPhone,
    });

    return Response.json(result);
  }),
});

http.route({
  path: "/voice/tool/take-message",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const unauthorized = requireServiceToken(request);
    if (unauthorized) {
      return unauthorized;
    }

    const body = (await request.json()) as {
      businessId: string;
      callId: string;
      conversationId?: string;
      callerName?: string;
      callbackPhone?: string;
      message: string;
      urgency?: string;
      callbackWindow?: string;
    };

    const result = await ctx.runMutation(internal.voice.runtime.takeMessageForVoice, {
      businessId: body.businessId as Id<"businesses">,
      callId: body.callId as Id<"calls">,
      ...(body.conversationId !== undefined
        ? { conversationId: body.conversationId as Id<"conversations"> }
        : {}),
      ...(body.callerName !== undefined ? { callerName: body.callerName } : {}),
      ...(body.callbackPhone !== undefined
        ? { callbackPhone: body.callbackPhone }
        : {}),
      message: body.message,
      ...(body.urgency !== undefined ? { urgency: body.urgency } : {}),
      ...(body.callbackWindow !== undefined
        ? { callbackWindow: body.callbackWindow }
        : {}),
    });

    return Response.json(result);
  }),
});

export default http;
