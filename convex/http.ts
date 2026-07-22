import { httpRouter } from "convex/server";
import { z } from "zod";
import { billingErrorCodes } from "../packages/shared/src/billing";
import { MAX_WEB_CALL_MAX_DURATION_MS } from "../packages/shared/src/index";
import {
  normalizeTwilioFormFields,
} from "./lib/twilioSecurity";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { auth } from "./auth";
import { streamPreviewResponse } from "./ai/preview/stream";
import { registerBillingRoutes } from "./billing";

import { observedHttpAction as httpAction } from "./telemetry/observedFunctions";
const http = httpRouter();

registerBillingRoutes(http);

type ParseResult<T> = { ok: true; data: T } | { ok: false; response: Response };

function isErrorMessage(error: unknown, code: string): boolean {
  return error instanceof Error && error.message.includes(code);
}

const twilioSmsInboundSchema = z.object({
  From: z.string().min(1),
  To: z.string().min(1),
  Body: z.string(),
  MessageSid: z.string().min(1).optional(),
  SmsSid: z.string().min(1).optional(),
  NumMedia: z.string().min(1).optional(),
  OptOutType: z.string().min(1).optional(),
});

const twilioSmsStatusSchema = z.object({
  MessageSid: z.string().min(1).optional(),
  SmsSid: z.string().min(1).optional(),
  MessageStatus: z.string().min(1),
  ErrorCode: z.string().min(1).optional(),
  RawDlrDoneDate: z.string().min(1).optional(),
});

const voiceContextSchema = z.object({
  phoneNumber: z.string().min(1),
  channel: z.enum(["voice", "sms"]).optional(),
});

const voiceContextBySlugSchema = z.object({
  businessSlug: z.string().min(1),
  dashboardTestCallToken: z.string().min(1).optional(),
  origin: z.string().min(1).optional(),
  ipHash: z.string().min(1).optional(),
  visitorId: z.string().min(1).optional(),
  widgetId: z.string().min(1).optional(),
  prospectDemoToken: z.string().min(1).optional(),
});

const webCallRecordingTargetSchema = z.object({
  gatewaySessionId: z.string().min(1),
});

const startCallSchema = z.object({
  businessId: z.string().min(1),
  twilioCallSid: z.string().min(1),
  gatewaySessionId: z.string().min(1).optional(),
  from: z.string().min(1),
  to: z.string().min(1),
  startedAt: z.string().min(1),
});

const startWebCallSchema = z.object({
  businessSlug: z.string().min(1),
  providerCallId: z.string().min(1),
  gatewaySessionId: z.string().min(1).optional(),
  originUrl: z.string().min(1).optional(),
  userAgent: z.string().min(1).optional(),
  widgetId: z.string().min(1).optional(),
  maxDurationMs: z.number().positive().max(MAX_WEB_CALL_MAX_DURATION_MS).optional(),
  startedAt: z.string().min(1),
  prospectDemoToken: z.string().min(1).optional(),
});

const appendTranscriptSchema = z.object({
  businessId: z.string().min(1),
  callId: z.string().min(1),
  sequence: z.number(),
  speaker: z.string().min(1),
  text: z.string(),
  final: z.boolean(),
  confidence: z.number().optional(),
});

const transferStateSchema = z.object({
  callId: z.string().min(1),
  transferState: z.string().min(1),
});

const prepareTransferSchema = z
  .object({
    callId: z.string().min(1).optional(),
    twilioCallSid: z.string().min(1).optional(),
    recordedAt: z.string().min(1),
  })
  .refine((value) => value.callId !== undefined || value.twilioCallSid !== undefined, {
    message: "callId or twilioCallSid is required",
  });

const completeCallSchema = z.object({
  callId: z.string().min(1),
  status: z.string().min(1),
  endedAt: z.string().min(1),
  disposition: z.string().min(1).optional(),
  providerDurationSeconds: z.number().optional(),
});

const systemBlockContactForVoiceCallSchema = z.object({
  callId: z.string().min(1),
  blockedAt: z.string().min(1),
});

const recordVoiceAiCostSchema = z.object({
  businessId: z.string().min(1),
  callId: z.string().min(1),
  occurredAt: z.string().min(1),
  eventKey: z.string().min(1),
  costUsd: z.number(),
  provider: z.string().min(1),
  model: z.string().min(1),
  operation: z.string().min(1).optional(),
  conversationId: z.string().min(1).optional(),
});

const reconcileStatusSchema = z.object({
  twilioCallSid: z.string().min(1),
  callStatus: z.string().min(1),
  sequenceNumber: z.number().optional(),
  callbackSource: z.string().min(1).optional(),
  providerUpdatedAt: z.string().min(1),
  providerDurationSeconds: z.number().optional(),
});

const recordingQuerySchema = z.object({
  callId: z.string().min(1),
  durationMs: z.coerce.number().optional(),
});

const findAvailabilitySchema = z.object({
  businessId: z.string().min(1),
  serviceName: z.string().min(1),
  date: z.string().min(1),
  timezone: z.string().min(1),
  preferredStaffId: z.string().min(1).optional(),
  preferredHour24: z.number().optional(),
  preferredMinute: z.number().optional(),
  limit: z.number().optional(),
});

const checkAvailabilitySchema = z.object({
  businessId: z.string().min(1),
  serviceName: z.string().min(1),
  startsAt: z.string().min(1),
  timezone: z.string().min(1),
  preferredStaffId: z.string().min(1).optional(),
});

const bookAppointmentSchema = z.object({
  businessId: z.string().min(1),
  serviceName: z.string().min(1),
  startsAt: z.string().min(1),
  timezone: z.string().min(1),
  channel: z.enum(["voice", "web_voice"]).optional(),
  preferredStaffId: z.string().min(1).optional(),
  conversationId: z.string().min(1).optional(),
  contactName: z.string().min(1).optional(),
  contactPhone: z.string().min(1),
  smsConsentGranted: z.boolean(),
});

const lookupAppointmentForChangeSchema = z.object({
  businessId: z.string().min(1),
  callerPhone: z.string().min(1),
});

const verifyAppointmentForChangeSchema = z.object({
  businessId: z.string().min(1),
  appointmentId: z.string().min(1).optional(),
  action: z.enum(["cancel", "reschedule"]),
  callerPhone: z.string().min(1),
  callerName: z.string().min(1).optional(),
  appointmentStartsAt: z.string().min(1).optional(),
  serviceName: z.string().min(1).optional(),
  callId: z.string().min(1).optional(),
  conversationId: z.string().min(1).optional(),
});

const appointmentChangeOtpStartSchema = z.object({
  verificationId: z.string().min(1),
});

const appointmentChangeOtpVerifySchema = z.object({
  verificationId: z.string().min(1),
  code: z.string().min(1),
});

const cancelAppointmentSchema = z.object({
  businessId: z.string().min(1),
  appointmentId: z.string().min(1),
  callerPhone: z.string().min(1),
  finalConfirmation: z.boolean(),
  verificationId: z.string().min(1).optional(),
  callId: z.string().min(1).optional(),
  conversationId: z.string().min(1).optional(),
});

const rescheduleAppointmentSchema = cancelAppointmentSchema.extend({
  startsAt: z.string().min(1),
  timezone: z.string().min(1).optional(),
  preferredStaffId: z.string().min(1).optional(),
});

const takeMessageSchema = z.object({
  businessId: z.string().min(1),
  callId: z.string().min(1),
  conversationId: z.string().min(1).optional(),
  channel: z.enum(["voice", "web_voice"]).optional(),
  callerName: z.string().min(1).optional(),
  callbackPhone: z.string().min(1).optional(),
  message: z.string().min(1),
  urgency: z.string().min(1).optional(),
  callbackWindow: z.string().min(1).optional(),
});

const searchKnowledgeSchema = z.object({
  businessId: z.string().min(1),
  query: z.string().min(1),
});

const googleCalendarCallbackQuerySchema = z.object({
  code: z.string().min(1).optional(),
  state: z.string().min(1).optional(),
  error: z.string().min(1).optional(),
  error_description: z.string().min(1).optional(),
});

const messageAttachmentDownloadQuerySchema = z.object({
  token: z.string().min(1),
});

const callRecordingDownloadQuerySchema = z.object({
  token: z.string().min(1),
});

function badRequest(message: string): Response {
  return new Response(message, { status: 400 });
}

function asId<TableName extends keyof IdFieldMap>(_table: TableName, value: string): Id<TableName> {
  return value as Id<TableName>;
}

type IdFieldMap = {
  _storage: "_storage";
  appointments: "appointments";
  businesses: "businesses";
  calls: "calls";
  contacts: "contacts";
  conversations: "conversations";
  appointment_change_verifications: "appointment_change_verifications";
  prospect_demos: "prospect_demos";
  staff: "staff";
};

async function parseJsonBody<TSchema extends z.ZodTypeAny>(
  request: Request,
  schema: TSchema,
): Promise<ParseResult<z.infer<TSchema>>> {
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return { ok: false, response: badRequest("Invalid JSON body") };
    }
    return { ok: true, data: parsed.data };
  } catch {
    return { ok: false, response: badRequest("Invalid JSON body") };
  }
}

async function parseNormalizedForm(request: Request): Promise<ParseResult<Record<string, string>>> {
  try {
    const form = await request.formData();
    return {
      ok: true,
      data: normalizeTwilioFormFields(form.entries()),
    };
  } catch {
    return { ok: false, response: badRequest("Invalid form body") };
  }
}

function parseSearchParams<TSchema extends z.ZodTypeAny>(
  url: URL,
  schema: TSchema,
): ParseResult<z.infer<TSchema>> {
  const parsed = schema.safeParse(Object.fromEntries(url.searchParams.entries()));
  if (!parsed.success) {
    return { ok: false, response: badRequest("Invalid query parameters") };
  }
  return { ok: true, data: parsed.data };
}

function parseTwilioMedia(params: Record<string, string>): Array<{ url: string; contentType?: string }> {
  const mediaCount = Number.parseInt(params.NumMedia ?? "0", 10);
  if (!Number.isFinite(mediaCount) || mediaCount <= 0) {
    return [];
  }

  const attachments: Array<{ url: string; contentType?: string }> = [];
  for (let index = 0; index < mediaCount; index += 1) {
    const url = params[`MediaUrl${index}`];
    if (!url) {
      continue;
    }

    const contentType = params[`MediaContentType${index}`];
    attachments.push({
      url,
      ...(contentType ? { contentType } : {}),
    });
  }

  return attachments;
}

async function requireTwilioSmsSignature(
  ctx: {
    runAction: (
      action: typeof internal.integrations.twilioSms.validateWebhookSignature,
      args: {
        signatureHeader?: string;
        url: string;
        params: Record<string, string>;
      },
    ) => Promise<boolean>;
  },
  request: Request,
  params: Record<string, string>,
): Promise<Response | null> {
  const signatureHeader = request.headers.get("x-twilio-signature");
  const isValid: boolean = await ctx.runAction(
    internal.integrations.twilioSms.validateWebhookSignature,
    {
      ...(signatureHeader ? { signatureHeader } : {}),
      url: request.url,
      params,
    },
  );

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

type MessageAttachmentDownloadCtx = {
  runQuery: (
    query: typeof internal.dashboard.messages.getMessageAttachmentDownloadToken,
    args: { token: string },
  ) => Promise<Doc<"message_attachment_download_tokens"> | null>;
  storage: {
    get: (
      storageId: Id<"_storage">,
    ) => Promise<Blob | null>;
  };
};

type CallRecordingDownloadCtx = {
  runQuery: (
    query: typeof internal.voice.runtime.getCallRecordingDownloadToken,
    args: { token: string },
  ) => Promise<Doc<"call_recording_download_tokens"> | null>;
  storage: {
    get: (
      storageId: Id<"_storage">,
    ) => Promise<Blob | null>;
  };
};

function parseRangeHeader(rangeHeader: string | null, size: number) {
  if (!rangeHeader) {
    return null;
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (!match) {
    return { error: "invalid" as const };
  }

  const [, rawStart, rawEnd] = match;
  if (!rawStart && !rawEnd) {
    return { error: "invalid" as const };
  }

  if (!rawStart) {
    const suffixLength = Number(rawEnd);
    if (!Number.isInteger(suffixLength) || suffixLength <= 0) {
      return { error: "invalid" as const };
    }
    const start = Math.max(0, size - suffixLength);
    return { start, end: size - 1 };
  }

  const start = Number(rawStart);
  const end = rawEnd ? Number(rawEnd) : size - 1;
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    end < start ||
    start >= size
  ) {
    return { error: "invalid" as const };
  }

  return { start, end: Math.min(end, size - 1) };
}

async function handleMessageAttachmentDownload(
  ctx: MessageAttachmentDownloadCtx,
  request: Request,
): Promise<Response> {
  const parsedQuery = parseSearchParams(new URL(request.url), messageAttachmentDownloadQuerySchema);
  if (!parsedQuery.ok) {
    return parsedQuery.response;
  }

  const token = await ctx.runQuery(internal.dashboard.messages.getMessageAttachmentDownloadToken, {
    token: parsedQuery.data.token,
  });
  if (!token) {
    return new Response("Attachment not found", { status: 404 });
  }

  if (Date.parse(token.expiresAt) < Date.now()) {
    return new Response("Attachment link expired", { status: 410 });
  }

  const blob = await ctx.storage.get(token.storageId);
  if (!blob) {
    return new Response("Attachment not found", { status: 404 });
  }

  const headers = new Headers();
  headers.set("Content-Type", token.contentType);
  headers.set(
    "Content-Disposition",
    `${token.disposition}; filename="${token.fileName}"`,
  );
  const remainingLifetimeMs = Date.parse(token.expiresAt) - Date.now();
  const maxAgeSeconds = Math.max(0, Math.floor(remainingLifetimeMs / 1000));
  headers.set(
    "Cache-Control",
    maxAgeSeconds > 0 ? `public, max-age=${maxAgeSeconds}, immutable` : "no-store",
  );

  if (request.method === "HEAD") {
    headers.set("Content-Length", String(blob.size));
    return new Response(null, { status: 200, headers });
  }

  return new Response(blob, { status: 200, headers });
}

async function handleCallRecordingDownload(
  ctx: CallRecordingDownloadCtx,
  request: Request,
): Promise<Response> {
  const parsedQuery = parseSearchParams(new URL(request.url), callRecordingDownloadQuerySchema);
  if (!parsedQuery.ok) {
    return parsedQuery.response;
  }

  const token = await ctx.runQuery(internal.voice.runtime.getCallRecordingDownloadToken, {
    token: parsedQuery.data.token,
  });
  if (!token) {
    return new Response("Recording not found", { status: 404 });
  }

  if (Date.parse(token.expiresAt) < Date.now()) {
    return new Response("Recording link expired", { status: 410 });
  }

  const blob = await ctx.storage.get(token.storageId);
  if (!blob) {
    return new Response("Recording not found", { status: 404 });
  }

  const remainingLifetimeMs = Date.parse(token.expiresAt) - Date.now();
  const maxAgeSeconds = Math.max(0, Math.floor(remainingLifetimeMs / 1000));
  const baseHeaders = new Headers();
  baseHeaders.set("Content-Type", token.contentType);
  baseHeaders.set("Accept-Ranges", "bytes");
  baseHeaders.set("Access-Control-Allow-Origin", "*");
  baseHeaders.set("Access-Control-Expose-Headers", "Accept-Ranges, Content-Length, Content-Range");
  baseHeaders.set("Content-Disposition", `inline; filename="${token.fileName}"`);
  baseHeaders.set(
    "Cache-Control",
    maxAgeSeconds > 0 ? `public, max-age=${maxAgeSeconds}, immutable` : "no-store",
  );

  const range = parseRangeHeader(request.headers.get("range"), blob.size);
  if (range?.error) {
    baseHeaders.set("Content-Range", `bytes */${blob.size}`);
    return new Response("Invalid range", { status: 416, headers: baseHeaders });
  }

  if (range) {
    const chunk = blob.slice(range.start, range.end + 1, token.contentType);
    baseHeaders.set("Content-Length", String(range.end - range.start + 1));
    baseHeaders.set("Content-Range", `bytes ${range.start}-${range.end}/${blob.size}`);
    return new Response(chunk, { status: 206, headers: baseHeaders });
  }

  baseHeaders.set("Content-Length", String(blob.size));
  return new Response(blob, { status: 200, headers: baseHeaders });
}

http.route({
  path: "/messages/attachments/download",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    return await handleMessageAttachmentDownload(ctx, request);
  }),
});

http.route({
  path: "/calls/recordings/download",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    return await handleCallRecordingDownload(ctx, request);
  }),
});

http.route({
  path: "/integrations/google/callback",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const parsedQuery = parseSearchParams(new URL(request.url), googleCalendarCallbackQuerySchema);
    if (!parsedQuery.ok) {
      return parsedQuery.response;
    }

    if (parsedQuery.data.error) {
      const redirect = await ctx.runAction(
        internal.integrations.googleCalendar.buildCallbackRedirect,
        {
          status: "error",
          message: "Google Calendar access was not granted.",
        },
      );
      return Response.redirect(redirect.redirectUrl, 302);
    }

    if (!parsedQuery.data.code || !parsedQuery.data.state) {
      const redirect = await ctx.runAction(
        internal.integrations.googleCalendar.buildCallbackRedirect,
        {
          status: "error",
          message: "Google Calendar callback was incomplete.",
        },
      );
      return Response.redirect(redirect.redirectUrl, 302);
    }

    try {
      const result = await ctx.runAction(
        internal.integrations.googleCalendar.completeOAuthCallback,
        {
          code: parsedQuery.data.code,
          state: parsedQuery.data.state,
        },
      );
      return Response.redirect(result.redirectUrl, 302);
    } catch (error) {
      const redirect = await ctx.runAction(
        internal.integrations.googleCalendar.buildCallbackRedirect,
        {
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "Google Calendar connection failed. Please try again.",
        },
      );
      return Response.redirect(redirect.redirectUrl, 302);
    }
  }),
});

http.route({
  path: "/twilio/sms/inbound",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const parsedForm = await parseNormalizedForm(request);
    if (!parsedForm.ok) {
      return parsedForm.response;
    }
    const payload = parsedForm.data;
    const invalidSignature = await requireTwilioSmsSignature(ctx, request, payload);
    if (invalidSignature) {
      return invalidSignature;
    }
    const parsedPayload = twilioSmsInboundSchema.safeParse(payload);
    if (!parsedPayload.success) {
      return badRequest("Invalid Twilio SMS payload");
    }

    const media = parseTwilioMedia(payload);
    await ctx.runAction(internal.conversations.webhooks.handleTwilioSmsInbound, {
      from: parsedPayload.data.From,
      to: parsedPayload.data.To,
      body: parsedPayload.data.Body,
      ...(parsedPayload.data.MessageSid !== undefined
        ? { messageSid: parsedPayload.data.MessageSid }
        : {}),
      ...(parsedPayload.data.SmsSid !== undefined ? { smsSid: parsedPayload.data.SmsSid } : {}),
      ...(parsedPayload.data.OptOutType !== undefined
        ? { optOutType: parsedPayload.data.OptOutType }
        : {}),
      ...(media.length > 0 ? { media } : {}),
    });

    const twiml = "<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response></Response>";

    return new Response(twiml, {
      status: 200,
      headers: { "Content-Type": "text/xml" },
    });
  }),
});

http.route({
  path: "/twilio/sms/status",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const parsedForm = await parseNormalizedForm(request);
    if (!parsedForm.ok) {
      return parsedForm.response;
    }

    const payload = parsedForm.data;
    const invalidSignature = await requireTwilioSmsSignature(ctx, request, payload);
    if (invalidSignature) {
      return invalidSignature;
    }

    const parsedPayload = twilioSmsStatusSchema.safeParse(payload);
    if (!parsedPayload.success) {
      return badRequest("Invalid Twilio SMS status payload");
    }

    const providerMessageSid =
      parsedPayload.data.MessageSid ?? parsedPayload.data.SmsSid;
    if (!providerMessageSid) {
      return badRequest("Twilio SMS status payload is missing MessageSid");
    }

    await ctx.runMutation(internal.integrations.twilioMessageStatus.reconcileProviderStatus, {
      providerMessageSid,
      providerStatus: parsedPayload.data.MessageStatus,
      providerUpdatedAt: new Date().toISOString(),
      ...(parsedPayload.data.ErrorCode !== undefined
        ? { providerErrorCode: parsedPayload.data.ErrorCode }
        : {}),
      ...(parsedPayload.data.RawDlrDoneDate !== undefined
        ? { providerRawDlrDoneDate: parsedPayload.data.RawDlrDoneDate }
        : {}),
    });

    try {
      await ctx.runAction(internal.integrations.twilioSms.syncMessagePriceFromProvider, {
        providerMessageSid,
        providerStatus: parsedPayload.data.MessageStatus,
      });
    } catch (error) {
      console.warn("[twilioSms] Failed to start provider price sync", {
        providerMessageSid,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return new Response("OK", { status: 200 });
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

    const body = await parseJsonBody(request, voiceContextSchema);
    if (!body.ok) {
      return body.response;
    }
    const phoneNumber = await ctx.runQuery(
      internal.businesses.catalog.resolveBusinessByPhoneNumber,
      {
        e164: body.data.phoneNumber,
        channel: body.data.channel ?? "voice",
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
  path: "/voice/context/by-slug",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const unauthorized = requireServiceToken(request);
    if (unauthorized) {
      return unauthorized;
    }

    const body = await parseJsonBody(request, voiceContextBySlugSchema);
    if (!body.ok) {
      return body.response;
    }

    const business = await ctx.runQuery(internal.voice.runtime.getActiveBusinessBySlug, {
      businessSlug: body.data.businessSlug,
    });

    if (!business) {
      return new Response("Not found", { status: 404 });
    }

    let prospectDemoId: string | undefined;
    let sessionMode: "prospect_demo" | undefined;
    if (body.data.prospectDemoToken) {
      const demoValidation = await ctx.runQuery(
        internal.demos.validateProspectDemoForWebVoice,
        {
          token: body.data.prospectDemoToken,
          businessSlug: body.data.businessSlug,
        },
      );
      if (!demoValidation.ok) {
        return Response.json(
          {
            code: "prospect_demo_unavailable",
            message: "Prospect demo is not available.",
            reason: demoValidation.reason,
          },
          { status: 403 },
        );
      }
      prospectDemoId = demoValidation.demoId;
      sessionMode = "prospect_demo";
    }

    if (body.data.origin !== undefined) {
      try {
        await ctx.runMutation(internal.voice.runtime.assertWebVoiceStartAllowed, {
          businessId: business._id,
          ...(body.data.dashboardTestCallToken !== undefined
            ? { dashboardTestCallToken: body.data.dashboardTestCallToken }
            : {}),
          origin: body.data.origin,
          ...(body.data.ipHash !== undefined ? { ipHash: body.data.ipHash } : {}),
          ...(body.data.visitorId !== undefined ? { visitorId: body.data.visitorId } : {}),
          ...(body.data.widgetId !== undefined ? { widgetId: body.data.widgetId } : {}),
          ...(prospectDemoId !== undefined
            ? { prospectDemoId: asId("prospect_demos", prospectDemoId) }
            : {}),
        });
      } catch (error) {
        if (isErrorMessage(error, "web_voice_rate_limited")) {
          return Response.json(
            {
              code: "web_voice_rate_limited",
              message: "Too many web voice starts. Please try again shortly.",
            },
            { status: 429 },
          );
        }
        throw error;
      }
    }

    if (sessionMode !== "prospect_demo") {
      try {
        await ctx.runQuery(internal.voice.runtime.assertWebVoiceBillingCanStart, {
          businessId: business._id,
        });
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === billingErrorCodes.voiceLimitReached
        ) {
          return Response.json(
            {
              code: billingErrorCodes.voiceLimitReached,
              message: "Voice quota reached for this billing period.",
            },
            { status: 402 },
          );
        }
        throw error;
      }
    }

    const snapshot = await ctx.runQuery(internal.ai.context.snapshots.getByBusinessId, {
      businessId: business._id,
    });

    if (!snapshot) {
      return new Response("Snapshot not ready", { status: 404 });
    }

    return Response.json({
      businessId: business._id,
      snapshot,
      ...(sessionMode !== undefined ? { sessionMode } : {}),
      ...(prospectDemoId !== undefined ? { prospectDemoId } : {}),
    });
  }),
});

http.route({
  path: "/voice/call/web-recording-target",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const unauthorized = requireServiceToken(request);
    if (unauthorized) {
      return unauthorized;
    }

    const body = await parseJsonBody(request, webCallRecordingTargetSchema);
    if (!body.ok) {
      return body.response;
    }

    const target = await ctx.runQuery(internal.voice.runtime.getWebCallRecordingTarget, {
      gatewaySessionId: body.data.gatewaySessionId,
    });

    if (!target) {
      return new Response("Not found", { status: 404 });
    }

    return Response.json(target);
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

    const body = await parseJsonBody(request, startCallSchema);
    if (!body.ok) {
      return body.response;
    }

    let result;
    try {
      result = await ctx.runMutation(internal.voice.runtime.startCall, {
        businessId: asId("businesses", body.data.businessId),
        twilioCallSid: body.data.twilioCallSid,
        ...(body.data.gatewaySessionId !== undefined
          ? { gatewaySessionId: body.data.gatewaySessionId }
          : {}),
        from: body.data.from,
        to: body.data.to,
        startedAt: body.data.startedAt,
      });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === billingErrorCodes.voiceLimitReached
      ) {
        return Response.json(
          {
            code: billingErrorCodes.voiceLimitReached,
            message: "Voice quota reached for this billing period.",
          },
          { status: 402 },
        );
      }
      throw error;
    }

    return Response.json(result);
  }),
});

http.route({
  path: "/voice/call/start-web",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const unauthorized = requireServiceToken(request);
    if (unauthorized) {
      return unauthorized;
    }

    const body = await parseJsonBody(request, startWebCallSchema);
    if (!body.ok) {
      return body.response;
    }

    let result;
    try {
      result = await ctx.runMutation(internal.voice.runtime.startWebCall, {
        businessSlug: body.data.businessSlug,
        providerCallId: body.data.providerCallId,
        ...(body.data.gatewaySessionId !== undefined
          ? { gatewaySessionId: body.data.gatewaySessionId }
          : {}),
        ...(body.data.originUrl !== undefined ? { originUrl: body.data.originUrl } : {}),
        ...(body.data.userAgent !== undefined ? { userAgent: body.data.userAgent } : {}),
        ...(body.data.widgetId !== undefined ? { widgetId: body.data.widgetId } : {}),
        ...(body.data.maxDurationMs !== undefined
          ? { maxDurationMs: body.data.maxDurationMs }
          : {}),
        startedAt: body.data.startedAt,
        ...(body.data.prospectDemoToken !== undefined
          ? { prospectDemoToken: body.data.prospectDemoToken }
          : {}),
      });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === billingErrorCodes.voiceLimitReached
      ) {
        return Response.json(
          {
            code: billingErrorCodes.voiceLimitReached,
            message: "Voice quota reached for this billing period.",
          },
          { status: 402 },
        );
      }
      throw error;
    }

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

    const body = await parseJsonBody(request, appendTranscriptSchema);
    if (!body.ok) {
      return body.response;
    }

    const transcriptId = await ctx.runMutation(internal.voice.runtime.appendTranscriptSegment, {
      businessId: asId("businesses", body.data.businessId),
      callId: asId("calls", body.data.callId),
      sequence: body.data.sequence,
      speaker: body.data.speaker,
      text: body.data.text,
      final: body.data.final,
      ...(body.data.confidence !== undefined ? { confidence: body.data.confidence } : {}),
    });

    return Response.json({ transcriptId });
  }),
});

http.route({
  path: "/voice/call/ai-cost",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const unauthorized = requireServiceToken(request);
    if (unauthorized) {
      return unauthorized;
    }

    const body = await parseJsonBody(request, recordVoiceAiCostSchema);
    if (!body.ok) {
      return body.response;
    }

    await ctx.runMutation(internal.unitEconomics.recordAiGenerationCost, {
      businessId: asId("businesses", body.data.businessId),
      callId: asId("calls", body.data.callId),
      occurredAt: body.data.occurredAt,
      eventKey: body.data.eventKey,
      eventKind: "voice_ai",
      channel: "voice",
      costUsd: body.data.costUsd,
      provider: body.data.provider,
      model: body.data.model,
      ...(body.data.operation ? { operation: body.data.operation } : {}),
      ...(body.data.conversationId
        ? { conversationId: asId("conversations", body.data.conversationId) }
        : {}),
    });

    return Response.json({ ok: true });
  }),
});

http.route({
  path: "/voice/call/prepare-transfer",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const unauthorized = requireServiceToken(request);
    if (unauthorized) {
      return unauthorized;
    }

    const body = await parseJsonBody(request, prepareTransferSchema);
    if (!body.ok) {
      return body.response;
    }

    const result = await ctx.runMutation(internal.voice.runtime.prepareTransferForVoice, {
      ...(body.data.callId !== undefined ? { callId: asId("calls", body.data.callId) } : {}),
      ...(body.data.twilioCallSid !== undefined
        ? { twilioCallSid: body.data.twilioCallSid }
        : {}),
      recordedAt: body.data.recordedAt,
    });

    if (!result.allowed) {
      return Response.json(
        {
          code:
            result.errorCode ?? billingErrorCodes.outboundCallAttemptLimitReached,
          message: "Outbound transfer quota reached for this billing period.",
        },
        { status: 402 },
      );
    }

    return Response.json({ ok: true });
  }),
});

http.route({
  path: "/voice/call/release-transfer",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const unauthorized = requireServiceToken(request);
    if (unauthorized) {
      return unauthorized;
    }

    const body = await parseJsonBody(request, prepareTransferSchema);
    if (!body.ok) {
      return body.response;
    }

    await ctx.runMutation(internal.voice.runtime.releaseTransferForVoice, {
      ...(body.data.callId !== undefined ? { callId: asId("calls", body.data.callId) } : {}),
      ...(body.data.twilioCallSid !== undefined
        ? { twilioCallSid: body.data.twilioCallSid }
        : {}),
      recordedAt: body.data.recordedAt,
    });

    return Response.json({ ok: true });
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

    const body = await parseJsonBody(request, transferStateSchema);
    if (!body.ok) {
      return body.response;
    }

    await ctx.runMutation(internal.voice.runtime.setTransferState, {
      callId: asId("calls", body.data.callId),
      transferState: body.data.transferState,
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

    const body = await parseJsonBody(request, completeCallSchema);
    if (!body.ok) {
      return body.response;
    }

    await ctx.runMutation(internal.voice.runtime.completeCall, {
      callId: asId("calls", body.data.callId),
      status: body.data.status,
      endedAt: body.data.endedAt,
      ...(body.data.disposition !== undefined ? { disposition: body.data.disposition } : {}),
      ...(body.data.providerDurationSeconds !== undefined
        ? { providerDurationSeconds: body.data.providerDurationSeconds }
        : {}),
    });

    return Response.json({ ok: true });
  }),
});

http.route({
  path: "/voice/call/system-block-contact",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const unauthorized = requireServiceToken(request);
    if (unauthorized) {
      return unauthorized;
    }

    const body = await parseJsonBody(request, systemBlockContactForVoiceCallSchema);
    if (!body.ok) {
      return body.response;
    }

    const result = await ctx.runMutation(internal.voice.runtime.systemBlockContactForVoiceCall, {
      callId: asId("calls", body.data.callId),
      blockedAt: body.data.blockedAt,
    });

    return Response.json(result);
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

    const body = await parseJsonBody(request, reconcileStatusSchema);
    if (!body.ok) {
      return body.response;
    }

    const result = await ctx.runMutation(internal.voice.runtime.reconcileTwilioCallStatus, {
      twilioCallSid: body.data.twilioCallSid,
      callStatus: body.data.callStatus,
      providerUpdatedAt: body.data.providerUpdatedAt,
      ...(body.data.sequenceNumber !== undefined
        ? { sequenceNumber: body.data.sequenceNumber }
        : {}),
      ...(body.data.callbackSource !== undefined
        ? { callbackSource: body.data.callbackSource }
        : {}),
      ...(body.data.providerDurationSeconds !== undefined
        ? { providerDurationSeconds: body.data.providerDurationSeconds }
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
    const query = parseSearchParams(url, recordingQuerySchema);
    if (!query.ok) {
      return query.response;
    }

    const blob = await request.blob();
    const recordingStorageId = await ctx.storage.store(blob);

    await ctx.runMutation(internal.voice.runtime.attachCallRecording, {
      callId: asId("calls", query.data.callId),
      recordingStorageId,
      recordingContentType: blob.type || "audio/wav",
      recordingByteLength: blob.size,
      ...(query.data.durationMs !== undefined
        ? { recordingDurationMs: query.data.durationMs }
        : {}),
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

    const body = await parseJsonBody(request, findAvailabilitySchema);
    if (!body.ok) {
      return body.response;
    }

    const result = await ctx.runAction(internal.voice.runtime.findAvailabilityForVoice, {
      businessId: asId("businesses", body.data.businessId),
      serviceName: body.data.serviceName,
      date: body.data.date,
      timezone: body.data.timezone,
      ...(body.data.preferredStaffId !== undefined
        ? { preferredStaffId: asId("staff", body.data.preferredStaffId) }
        : {}),
      ...(body.data.preferredHour24 !== undefined
        ? { preferredHour24: body.data.preferredHour24 }
        : {}),
      ...(body.data.preferredMinute !== undefined
        ? { preferredMinute: body.data.preferredMinute }
        : {}),
      ...(body.data.limit !== undefined ? { limit: body.data.limit } : {}),
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

    const body = await parseJsonBody(request, checkAvailabilitySchema);
    if (!body.ok) {
      return body.response;
    }

    const result = await ctx.runAction(internal.voice.runtime.checkAvailabilityForVoice, {
      businessId: asId("businesses", body.data.businessId),
      serviceName: body.data.serviceName,
      startsAt: body.data.startsAt,
      timezone: body.data.timezone,
      ...(body.data.preferredStaffId !== undefined
        ? { preferredStaffId: asId("staff", body.data.preferredStaffId) }
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

    const body = await parseJsonBody(request, bookAppointmentSchema);
    if (!body.ok) {
      return body.response;
    }

    const result = await ctx.runAction(internal.voice.runtime.bookAppointmentForVoice, {
      businessId: asId("businesses", body.data.businessId),
      serviceName: body.data.serviceName,
      startsAt: body.data.startsAt,
      timezone: body.data.timezone,
      ...(body.data.channel !== undefined ? { channel: body.data.channel } : {}),
      ...(body.data.preferredStaffId !== undefined
        ? { preferredStaffId: asId("staff", body.data.preferredStaffId) }
        : {}),
      ...(body.data.conversationId !== undefined
        ? { conversationId: asId("conversations", body.data.conversationId) }
        : {}),
      ...(body.data.contactName !== undefined ? { contactName: body.data.contactName } : {}),
      contactPhone: body.data.contactPhone,
      smsConsentGranted: body.data.smsConsentGranted,
    });

    return Response.json(result);
  }),
});

http.route({
  path: "/voice/tool/lookup-appointment-for-change",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const unauthorized = requireServiceToken(request);
    if (unauthorized) {
      return unauthorized;
    }

    const body = await parseJsonBody(request, lookupAppointmentForChangeSchema);
    if (!body.ok) {
      return body.response;
    }

    const result = await ctx.runQuery(internal.appointments.changes.lookupAppointmentsForChange, {
      businessId: asId("businesses", body.data.businessId),
      callerPhone: body.data.callerPhone,
    });

    return Response.json(result);
  }),
});

http.route({
  path: "/voice/tool/verify-appointment-for-change",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const unauthorized = requireServiceToken(request);
    if (unauthorized) {
      return unauthorized;
    }

    const body = await parseJsonBody(request, verifyAppointmentForChangeSchema);
    if (!body.ok) {
      return body.response;
    }

    const result = await ctx.runMutation(
      internal.appointments.changes.verifyAppointmentChangeFacts,
      {
        businessId: asId("businesses", body.data.businessId),
        ...(body.data.appointmentId !== undefined
          ? { appointmentId: asId("appointments", body.data.appointmentId) }
          : {}),
        action: body.data.action,
        channel: "voice",
        callerPhone: body.data.callerPhone,
        ...(body.data.callerName !== undefined ? { callerName: body.data.callerName } : {}),
        ...(body.data.appointmentStartsAt !== undefined
          ? { appointmentStartsAt: body.data.appointmentStartsAt }
          : {}),
        ...(body.data.serviceName !== undefined ? { serviceName: body.data.serviceName } : {}),
        ...(body.data.callId !== undefined ? { callId: asId("calls", body.data.callId) } : {}),
        ...(body.data.conversationId !== undefined
          ? { conversationId: asId("conversations", body.data.conversationId) }
          : {}),
      },
    );

    return Response.json(result);
  }),
});

http.route({
  path: "/voice/tool/send-appointment-change-otp",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const unauthorized = requireServiceToken(request);
    if (unauthorized) {
      return unauthorized;
    }

    const body = await parseJsonBody(request, appointmentChangeOtpStartSchema);
    if (!body.ok) {
      return body.response;
    }

    const result = await ctx.runAction(
      internal.appointments.changeOtp.startAppointmentChangeOtp,
      {
        verificationId: asId(
          "appointment_change_verifications",
          body.data.verificationId,
        ),
      },
    );

    return Response.json(result);
  }),
});

http.route({
  path: "/voice/tool/verify-appointment-change-otp",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const unauthorized = requireServiceToken(request);
    if (unauthorized) {
      return unauthorized;
    }

    const body = await parseJsonBody(request, appointmentChangeOtpVerifySchema);
    if (!body.ok) {
      return body.response;
    }

    const result = await ctx.runAction(
      internal.appointments.changeOtp.verifyAppointmentChangeOtp,
      {
        verificationId: asId(
          "appointment_change_verifications",
          body.data.verificationId,
        ),
        code: body.data.code,
      },
    );

    return Response.json(result);
  }),
});

http.route({
  path: "/voice/tool/cancel-appointment",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const unauthorized = requireServiceToken(request);
    if (unauthorized) {
      return unauthorized;
    }

    const body = await parseJsonBody(request, cancelAppointmentSchema);
    if (!body.ok) {
      return body.response;
    }

    const result = await ctx.runMutation(
      internal.appointments.changes.cancelAppointmentForBusiness,
      {
        businessId: asId("businesses", body.data.businessId),
        appointmentId: asId("appointments", body.data.appointmentId),
        channel: "voice",
        callerPhone: body.data.callerPhone,
        finalConfirmation: body.data.finalConfirmation,
        ...(body.data.verificationId !== undefined
          ? {
              verificationId: asId(
                "appointment_change_verifications",
                body.data.verificationId,
              ),
            }
          : {}),
        ...(body.data.callId !== undefined ? { callId: asId("calls", body.data.callId) } : {}),
        ...(body.data.conversationId !== undefined
          ? { conversationId: asId("conversations", body.data.conversationId) }
          : {}),
      },
    );

    return Response.json(result);
  }),
});

http.route({
  path: "/voice/tool/reschedule-appointment",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const unauthorized = requireServiceToken(request);
    if (unauthorized) {
      return unauthorized;
    }

    const body = await parseJsonBody(request, rescheduleAppointmentSchema);
    if (!body.ok) {
      return body.response;
    }

    const result = await ctx.runMutation(
      internal.appointments.changes.rescheduleAppointmentForBusiness,
      {
        businessId: asId("businesses", body.data.businessId),
        appointmentId: asId("appointments", body.data.appointmentId),
        channel: "voice",
        callerPhone: body.data.callerPhone,
        startsAt: body.data.startsAt,
        finalConfirmation: body.data.finalConfirmation,
        ...(body.data.timezone !== undefined ? { timezone: body.data.timezone } : {}),
        ...(body.data.preferredStaffId !== undefined
          ? { preferredStaffId: asId("staff", body.data.preferredStaffId) }
          : {}),
        ...(body.data.verificationId !== undefined
          ? {
              verificationId: asId(
                "appointment_change_verifications",
                body.data.verificationId,
              ),
            }
          : {}),
        ...(body.data.callId !== undefined ? { callId: asId("calls", body.data.callId) } : {}),
        ...(body.data.conversationId !== undefined
          ? { conversationId: asId("conversations", body.data.conversationId) }
          : {}),
      },
    );

    return Response.json(result);
  }),
});

http.route({
  path: "/voice/tool/search-knowledge",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const unauthorized = requireServiceToken(request);
    if (unauthorized) {
      return unauthorized;
    }

    const body = await parseJsonBody(request, searchKnowledgeSchema);
    if (!body.ok) {
      return body.response;
    }

    const result = await ctx.runAction(internal.ai.context.knowledge.searchKnowledgeForVoiceInternal, {
      businessId: asId("businesses", body.data.businessId),
      query: body.data.query,
      limit: 4,
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

    const body = await parseJsonBody(request, takeMessageSchema);
    if (!body.ok) {
      return body.response;
    }

    const result = await ctx.runMutation(internal.voice.runtime.takeMessageForVoice, {
      businessId: asId("businesses", body.data.businessId),
      callId: asId("calls", body.data.callId),
      ...(body.data.conversationId !== undefined
        ? { conversationId: asId("conversations", body.data.conversationId) }
        : {}),
      ...(body.data.channel !== undefined ? { channel: body.data.channel } : {}),
      ...(body.data.callerName !== undefined ? { callerName: body.data.callerName } : {}),
      ...(body.data.callbackPhone !== undefined
        ? { callbackPhone: body.data.callbackPhone }
        : {}),
      message: body.data.message,
      ...(body.data.urgency !== undefined ? { urgency: body.data.urgency } : {}),
      ...(body.data.callbackWindow !== undefined
        ? { callbackWindow: body.data.callbackWindow }
        : {}),
    });

    return Response.json(result);
  }),
});

export default http;
