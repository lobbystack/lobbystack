import {
  getTerminalTwilioCallReconciliationFields,
  isTerminalTwilioCallStatus,
  } from "../lib/voiceCallStatus";
import { observedInternalMutation as internalMutation, observedMutation as mutation } from "../telemetry/observedFunctions";
import type { UsageBillingErrorCode } from "../../packages/shared/src/billing";
import { billingErrorCodes } from "../../packages/shared/src/billing";
import {
  DEFAULT_WEB_CALL_MAX_DURATION_MS,
  MAX_WEB_CALL_MAX_DURATION_MS,
  WEB_CALL_STALE_GRACE_MS,
} from "../../packages/shared/src/index";
import {
  getPostHogBusinessGroupKey,
  getPostHogDistinctIdForBusinessSystem,
  } from "../telemetry/shared";
import { v } from "convex/values";
import {
  enqueuePostHogOutboxRecord,
  serializePostHogEvent,
  } from "../telemetry/posthog";

import { internal } from "../_generated/api";
import {
  internalQuery,
  query,
  type ActionCtx,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { requireMembership } from "../lib/auth";
import { buildConversationOutcome } from "../dashboard/outcomes";
import { getOpenConversationForContact } from "../lib/indexedQueries";
import { buildCallRecordingDownloadUrl } from "../lib/messageAttachmentUrls";
import { ATTACHMENT_DOWNLOAD_TOKEN_TTL_MS } from "../lib/messageAttachments";
import { getServiceNameCandidates } from "../lib/serviceNames";
import { webVoiceAbuseRateLimiter } from "../lib/components";
import { normalizeRuntimeLocale, type RuntimeLocale } from "../lib/runtimeLocale";
import {
  CONTACT_BLOCKED_CALL_DISPOSITION,
  isContactBlocked,
} from "../lib/contactBlocking";
import {
  ensureSessionForStoredMessage,
  ensureVoiceSessionForCall,
  finalizeVoiceSessionForCall,
} from "../conversations/sessions";
import {
  getCallRecordingExpiresAt,
  getMessageContentExpiresAt,
  getSensitiveContentExpiresAt,
  getVisibleInboxItemBody,
  getVisibleInboxItemTitle,
  isCallRecordingExpired,
  isTranscriptExpired,
  scheduleCallRecordingExpiration,
  scheduleInboxItemContentExpiration,
  scheduleMessageContentExpiration,
  scheduleTranscriptExpiration,
} from "../privacy/retention";

import { observedInternalAction as internalAction } from "../telemetry/observedFunctions";
type BusinessIdArgs = { businessId: Id<"businesses"> };
type ServicesForBusinessArgs = BusinessIdArgs;
type StaffAssignmentsForServiceArgs = {
  businessId: Id<"businesses">;
  serviceId: Id<"services">;
};
type StartCallArgs = {
  businessId: Id<"businesses">;
  twilioCallSid: string;
  gatewaySessionId?: string;
  from: string;
  to: string;
  startedAt: string;
};
type StartCallResult = {
  callId: Id<"calls">;
  blocked: boolean;
  conversationId?: Id<"conversations">;
  contactId: Id<"contacts">;
};
type StartWebCallArgs = {
  businessSlug: string;
  providerCallId: string;
  gatewaySessionId?: string;
  originUrl?: string;
  userAgent?: string;
  widgetId?: string;
  maxDurationMs?: number;
  startedAt: string;
};
type StartWebCallResult = {
  businessId: Id<"businesses">;
  callId: Id<"calls">;
  conversationId: Id<"conversations">;
};
type WebCallRecordingTarget = {
  callId: Id<"calls">;
  providerCallId?: string;
  startedAt: string;
  endedAt?: string;
  status: string;
  webCallMaxDurationMs?: number;
};

export const WEB_VOICE_RATE_LIMIT_ERROR = "web_voice_rate_limited";
const DASHBOARD_TEST_CALL_WIDGET_ID = "lobbystack-dashboard-test-call";
const DASHBOARD_TEST_CALL_PROOF_TTL_MS = 2 * 60 * 1000;
const DASHBOARD_TEST_CALL_PROOF_PREFIX = "dashboard-test-call";

function getDashboardTestCallToken(): string | null {
  const token = process.env.DASHBOARD_TEST_CALL_TOKEN?.trim();
  return token ? token : null;
}

function hasVerifiedDashboardTestCallToken(input: {
  dashboardTestCallToken?: string;
}): boolean {
  const expectedToken = getDashboardTestCallToken();
  return expectedToken !== null && input.dashboardTestCallToken === expectedToken;
}

function bytesToHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function signDashboardTestCallProof(input: {
  businessSlug: string;
  expiresAt: number;
  nonce: string;
}): Promise<string | null> {
  const token = getDashboardTestCallToken();
  if (token === null) {
    return null;
  }

  const payload = [
    DASHBOARD_TEST_CALL_PROOF_PREFIX,
    input.businessSlug,
    String(input.expiresAt),
    input.nonce,
  ].join("|");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(token),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );
  return `${payload}|${bytesToHex(signature)}`;
}

type WebVoiceStartLimiterName =
  | "webVoiceStartGlobalPerMinute"
  | "webVoiceStartPerBusinessPerHour"
  | "webVoiceStartPerBusinessPerDay"
  | "webVoiceStartPerOriginPerTenMinutes"
  | "webVoiceStartPerIpPerHour"
  | "webVoiceStartPerIpPerDay"
  | "webVoiceStartPerVisitorPerHour"
  | "webVoiceStartPerVisitorPerDay"
  | "dashboardWebVoiceStartPerBusinessPerHour"
  | "dashboardWebVoiceStartPerBusinessPerDay"
  | "dashboardWebVoiceStartPerOriginPerTenMinutes"
  | "dashboardWebVoiceStartPerIpPerHour"
  | "dashboardWebVoiceStartPerIpPerDay"
  | "dashboardWebVoiceStartPerVisitorPerHour"
  | "dashboardWebVoiceStartPerVisitorPerDay";

type WebVoiceStartLimit = {
  limiterName: WebVoiceStartLimiterName;
  key: string;
  reason: string;
  businessId: Id<"businesses">;
  origin?: string;
  widgetId?: string;
};

function getWebCallMaxDurationMs(maxDurationMs: number | undefined): number {
  if (maxDurationMs === undefined || !Number.isFinite(maxDurationMs) || maxDurationMs <= 0) {
    return DEFAULT_WEB_CALL_MAX_DURATION_MS;
  }
  return Math.min(maxDurationMs, MAX_WEB_CALL_MAX_DURATION_MS);
}

function getWebCallStaleTimeoutMs(maxDurationMs: number | undefined): number {
  return getWebCallMaxDurationMs(maxDurationMs) + WEB_CALL_STALE_GRACE_MS;
}

function logWebVoiceRateLimitBlocked(input: {
  limiter: string;
  reason: string;
  businessId: Id<"businesses">;
  origin?: string;
  widgetId?: string;
}) {
  console.warn(
    JSON.stringify({
      scope: "web_voice_abuse_control",
      decision: "blocked",
      ...input,
    }),
  );
}

async function consumeWebVoiceStartLimit(
  ctx: MutationCtx,
  input: WebVoiceStartLimit,
): Promise<void> {
  const result = await webVoiceAbuseRateLimiter.limit(ctx, input.limiterName, {
    key: input.key,
  });

  if (!result.ok) {
    logWebVoiceRateLimitBlocked({
      limiter: input.limiterName,
      reason: input.reason,
      businessId: input.businessId,
      ...(input.origin !== undefined ? { origin: input.origin } : {}),
      ...(input.widgetId !== undefined ? { widgetId: input.widgetId } : {}),
    });
    throw new Error(WEB_VOICE_RATE_LIMIT_ERROR);
  }
}

function buildWebVoiceStartLimits(input: {
  businessId: Id<"businesses">;
  dashboardTestCallToken?: string;
  origin: string;
  ipHash?: string;
  visitorId?: string;
  widgetId?: string;
}): Array<WebVoiceStartLimit> {
  const businessKey = String(input.businessId);
  const logContext = {
    businessId: input.businessId,
    origin: input.origin,
    ...(input.widgetId !== undefined ? { widgetId: input.widgetId } : {}),
  };
  const limits: Array<WebVoiceStartLimit> = [];
  const isDashboardTestCall =
    input.widgetId === DASHBOARD_TEST_CALL_WIDGET_ID &&
    hasVerifiedDashboardTestCallToken(input);

  if (input.ipHash !== undefined) {
    limits.push(
      {
        limiterName: isDashboardTestCall
          ? "dashboardWebVoiceStartPerIpPerHour"
          : "webVoiceStartPerIpPerHour",
        key: `${businessKey}:ip:${input.ipHash}`,
        reason: isDashboardTestCall
          ? "dashboard_rate_limit_ip_hour"
          : "rate_limit_ip_hour",
        ...logContext,
      },
      {
        limiterName: isDashboardTestCall
          ? "dashboardWebVoiceStartPerIpPerDay"
          : "webVoiceStartPerIpPerDay",
        key: `${businessKey}:ip:${input.ipHash}`,
        reason: isDashboardTestCall
          ? "dashboard_rate_limit_ip_day"
          : "rate_limit_ip_day",
        ...logContext,
      },
    );
  }

  if (input.visitorId !== undefined) {
    limits.push(
      {
        limiterName: isDashboardTestCall
          ? "dashboardWebVoiceStartPerVisitorPerHour"
          : "webVoiceStartPerVisitorPerHour",
        key: `${businessKey}:visitor:${input.visitorId}`,
        reason: isDashboardTestCall
          ? "dashboard_rate_limit_visitor_hour"
          : "rate_limit_visitor_hour",
        ...logContext,
      },
      {
        limiterName: isDashboardTestCall
          ? "dashboardWebVoiceStartPerVisitorPerDay"
          : "webVoiceStartPerVisitorPerDay",
        key: `${businessKey}:visitor:${input.visitorId}`,
        reason: isDashboardTestCall
          ? "dashboard_rate_limit_visitor_day"
          : "rate_limit_visitor_day",
        ...logContext,
      },
    );
  }

  limits.push(
    {
      limiterName: isDashboardTestCall
        ? "dashboardWebVoiceStartPerOriginPerTenMinutes"
        : "webVoiceStartPerOriginPerTenMinutes",
      key: input.origin,
      reason: isDashboardTestCall
        ? "dashboard_rate_limit_origin"
        : "rate_limit_origin",
      ...logContext,
    },
    {
      limiterName: isDashboardTestCall
        ? "dashboardWebVoiceStartPerBusinessPerHour"
        : "webVoiceStartPerBusinessPerHour",
      key: businessKey,
      reason: isDashboardTestCall
        ? "dashboard_rate_limit_business_hour"
        : "rate_limit_business_hour",
      ...logContext,
    },
    {
      limiterName: isDashboardTestCall
        ? "dashboardWebVoiceStartPerBusinessPerDay"
        : "webVoiceStartPerBusinessPerDay",
      key: businessKey,
      reason: isDashboardTestCall
        ? "dashboard_rate_limit_business_day"
        : "rate_limit_business_day",
      ...logContext,
    },
    {
      limiterName: "webVoiceStartGlobalPerMinute",
      key: "global",
      reason: "rate_limit_global",
      ...logContext,
    },
  );

  return limits;
}

async function assertWebVoiceStartLimitsAvailable(
  ctx: MutationCtx,
  limits: Array<WebVoiceStartLimit>,
): Promise<void> {
  for (const limit of limits) {
    const result = await webVoiceAbuseRateLimiter.check(ctx, limit.limiterName, {
      key: limit.key,
    });
    if (!result.ok) {
      logWebVoiceRateLimitBlocked({
        limiter: limit.limiterName,
        reason: limit.reason,
        businessId: limit.businessId,
        ...(limit.origin !== undefined ? { origin: limit.origin } : {}),
        ...(limit.widgetId !== undefined ? { widgetId: limit.widgetId } : {}),
      });
      throw new Error(WEB_VOICE_RATE_LIMIT_ERROR);
    }
  }
}

async function resolveActiveBusinessByPublicSlug(
  ctx: Pick<QueryCtx | MutationCtx, "db">,
  businessSlug: string,
): Promise<Doc<"businesses"> | null> {
  const businesses = await ctx.db
    .query("businesses")
    .withIndex("by_slug", (q) => q.eq("slug", businessSlug))
    .take(10);

  return businesses.find((business) => business.status === "active") ?? null;
}
type AppendTranscriptArgs = {
  businessId: Id<"businesses">;
  callId: Id<"calls">;
  sequence: number;
  speaker: string;
  text: string;
  final: boolean;
  confidence?: number;
};
type SetTransferStateArgs = {
  callId: Id<"calls">;
  transferState: string;
};
type PrepareTransferForVoiceArgs = {
  callId?: Id<"calls">;
  twilioCallSid?: string;
  recordedAt: string;
};
type ReleaseTransferForVoiceArgs = {
  callId?: Id<"calls">;
  twilioCallSid?: string;
  recordedAt: string;
};
type TakeMessageForVoiceArgs = {
  businessId: Id<"businesses">;
  callId: Id<"calls">;
  conversationId?: Id<"conversations">;
  channel?: "voice" | "web_voice";
  callerName?: string;
  callbackPhone?: string;
  message: string;
  urgency?: string;
  callbackWindow?: string;
};
type AttachCallRecordingArgs = {
  callId: Id<"calls">;
  recordingStorageId: Id<"_storage">;
  recordingContentType: string;
  recordingByteLength: number;
  recordingDurationMs?: number;
};
type CompleteCallArgs = {
  callId: Id<"calls">;
  status: string;
  endedAt: string;
  disposition?: string;
  providerDurationSeconds?: number;
};
type SystemBlockContactForVoiceCallArgs = {
  callId: Id<"calls">;
  blockedAt: string;
};
type SystemBlockContactForVoiceCallResult = {
  blocked: boolean;
  contactId?: Id<"contacts">;
  reason?: string;
};
type ReconcileTwilioCallStatusArgs = {
  twilioCallSid: string;
  callStatus: string;
  sequenceNumber?: number;
  callbackSource?: string;
  providerUpdatedAt: string;
  providerDurationSeconds?: number;
};
type ReconcileTwilioCallStatusResult =
  | { ignored: true; reason: "unknown_call" | "missing_sequence" | "stale_sequence" }
  | { ignored: false; callId: Id<"calls"> };
type RecordTwilioCallPricingArgs = {
  twilioCallSid: string;
  providerUpdatedAt?: string;
  providerPrice?: number;
  providerPriceUnit?: string;
  providerCostUsd?: number;
  providerDurationSeconds?: number;
};
type CheckAvailabilityForVoiceArgs = {
  businessId: Id<"businesses">;
  serviceName: string;
  startsAt: string;
  timezone: string;
  preferredStaffId?: Id<"staff">;
};
type CheckAvailabilityForVoiceResult = {
  serviceId: Id<"services">;
  serviceName: string;
  setupIssue: string | null;
  availability: Array<{
    staffId: string;
    serviceId: string;
    startsAt: string;
    endsAt: string;
  }>;
};

const ESTIMATED_TWILIO_INBOUND_VOICE_RATE_USD_PER_MINUTE = 0.0085;

function estimateTwilioInboundVoiceCostUsd(durationSeconds: number): number {
  const billableMinutes = Math.max(1, Math.ceil(durationSeconds / 60));
  return Number((billableMinutes * ESTIMATED_TWILIO_INBOUND_VOICE_RATE_USD_PER_MINUTE).toFixed(6));
}

async function enqueueVoiceProviderCostRecordedEvent(
  ctx: MutationCtx,
  input: {
    businessId: Id<"businesses">;
    conversationId?: Id<"conversations">;
    callId: Id<"calls">;
    twilioCallSid: string;
    providerCostUsd: number;
    providerUpdatedAt?: string;
    providerPrice?: number;
    providerPriceUnit?: string;
    providerDurationSeconds?: number;
  },
): Promise<void> {
  await enqueuePostHogOutboxRecord(
    ctx,
    serializePostHogEvent({
      eventName: "voice.provider_cost_recorded",
      businessId: input.businessId,
      distinctId: getPostHogDistinctIdForBusinessSystem(String(input.businessId)),
      groupKey: getPostHogBusinessGroupKey(String(input.businessId)),
      ...(input.conversationId ? { conversationId: String(input.conversationId) } : {}),
      callId: String(input.callId),
      channel: "voice",
      provider: "twilio",
      properties: {
        twilioCallSid: input.twilioCallSid,
        providerCostUsd: input.providerCostUsd,
        ...(input.providerUpdatedAt !== undefined
          ? { providerUpdatedAt: input.providerUpdatedAt }
          : {}),
        ...(input.providerPrice !== undefined ? { providerPrice: input.providerPrice } : {}),
        ...(input.providerPriceUnit !== undefined
          ? { providerPriceUnit: input.providerPriceUnit }
          : {}),
        ...(input.providerDurationSeconds !== undefined
          ? { providerDurationSeconds: input.providerDurationSeconds }
          : {}),
      },
    }),
  );
}
type FindAvailabilityForVoiceArgs = {
  businessId: Id<"businesses">;
  serviceName: string;
  date: string;
  timezone: string;
  preferredStaffId?: Id<"staff">;
  preferredHour24?: number;
  preferredMinute?: number;
  limit?: number;
};
type FindAvailabilityForVoiceResult = {
  serviceId: Id<"services">;
  serviceName: string;
  timezone: string;
  date: string;
  slots: Array<{
    startsAt: string;
    endsAt: string;
    displayTime: string;
  }>;
  setupIssue: string | null;
  summary: string;
};
type BookAppointmentForVoiceArgs = {
  businessId: Id<"businesses">;
  serviceName: string;
  startsAt: string;
  timezone: string;
  channel?: "voice" | "web_voice";
  preferredStaffId?: Id<"staff">;
  conversationId?: Id<"conversations">;
  contactName?: string;
  contactPhone: string;
  smsConsentGranted: boolean;
};
type BookAppointmentForVoiceResult = {
  appointmentId: Id<"appointments">;
  contactId: Id<"contacts">;
  serviceId: Id<"services">;
  serviceName: string;
};

function createCallRecordingNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
type ListRecentCallsArgs = {
  businessId: Id<"businesses">;
  limit?: number;
  selectedCallId?: Id<"calls">;
};
type GetCallTranscriptArgs = {
  businessId: Id<"businesses">;
  callId: Id<"calls">;
};
type GetCallForDashboardArgs = {
  businessId: Id<"businesses">;
  callId: Id<"calls">;
};
type GetVoiceFollowUpTaskForDashboardArgs = {
  businessId: Id<"businesses">;
  inboxItemId: Id<"inbox_items">;
};
type CompleteVoiceFollowUpTaskArgs = {
  businessId: Id<"businesses">;
  inboxItemId: Id<"inbox_items">;
};

function normalizeComparable(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ");
}

function tokenizeComparable(value: string): Array<string> {
  return normalizeComparable(value)
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean);
}

function scoreServiceMatch(service: Doc<"services">, serviceName: string): number {
  const comparable = normalizeComparable(serviceName);
  const slugComparable = normalizeComparable(service.slug);
  const nameCandidates = getServiceNameCandidates(service).map((candidate) =>
    normalizeComparable(candidate),
  );

  if (nameCandidates.includes(comparable) || slugComparable === comparable) {
    return 100;
  }

  if (
    nameCandidates.some(
      (candidate) => candidate.includes(comparable) || comparable.includes(candidate),
    )
  ) {
    return 80;
  }

  if (slugComparable.includes(comparable) || comparable.includes(slugComparable)) {
    return 75;
  }

  const queryTokens = tokenizeComparable(serviceName);
  const serviceTokens = new Set([
    ...nameCandidates.flatMap((candidate) => tokenizeComparable(candidate)),
    ...tokenizeComparable(service.slug),
  ]);
  const overlap = queryTokens.filter((token) => serviceTokens.has(token)).length;
  if (overlap > 0) {
    return overlap * 10;
  }

  return 0;
}

function dedupeVoiceFollowUpItems(
  items: Array<Doc<"inbox_items">>,
): Map<string, Doc<"inbox_items">> {
  const deduped = new Map<string, Doc<"inbox_items">>();

  for (const item of items) {
    const key = item.relatedId ?? String(item._id);
    if (!deduped.has(key)) {
      deduped.set(key, item);
    }
  }

  return deduped;
}

async function hydrateDashboardCallRow(
  ctx: QueryCtx,
  call: Doc<"calls">,
  voiceFollowUpByCallId: Map<string, Doc<"inbox_items">>,
) {
  const followUpTask = voiceFollowUpByCallId.get(String(call._id)) ?? null;
  const [conversation, transcriptPreview] = await Promise.all([
    call.conversationId ? ctx.db.get(call.conversationId) : Promise.resolve(null),
    ctx.db
      .query("transcripts")
      .withIndex("by_call_id_and_sequence", (q) => q.eq("callId", call._id))
      .order("desc")
      .take(1),
  ]);
  const contact = conversation?.contactId
    ? await ctx.db.get(conversation.contactId)
    : call.contactId
      ? await ctx.db.get(call.contactId)
      : null;
  const outcome = await buildConversationOutcome(ctx, {
    conversation,
    fallbackDisposition: call.disposition ?? null,
  });
  const recordingToken = (
    await ctx.db
      .query("call_recording_download_tokens")
      .withIndex("by_call_id", (q) => q.eq("callId", call._id))
      .take(1)
  )[0] ?? null;
  const hasActiveRecordingToken =
    recordingToken !== null && Date.parse(recordingToken.expiresAt) >= Date.now();
  const recordingExpired = isCallRecordingExpired(call);
  const recordingAvailable = call.recordingStorageId !== undefined && !recordingExpired;
  const callForDashboard = recordingExpired
    ? (() => {
        const {
          recordingStorageId: _recordingStorageId,
          recordingContentType: _recordingContentType,
          recordingByteLength: _recordingByteLength,
          recordingDurationMs: _recordingDurationMs,
          ...rest
        } = call;
        return {
          ...rest,
          recordingRetentionStatus: "expired" as const,
        };
      })()
    : call;
  const visibleTranscriptPreview = transcriptPreview.find(
    (transcript) => !isTranscriptExpired(transcript),
  );

  return {
    ...callForDashboard,
    recordingUrl: recordingAvailable
      ? hasActiveRecordingToken
        ? buildCallRecordingDownloadUrl(recordingToken.nonce)
        : await ctx.storage.getUrl(call.recordingStorageId!)
      : null,
    transcriptReady: visibleTranscriptPreview !== undefined,
    transcriptPreview: visibleTranscriptPreview?.text ?? null,
    contactName: contact?.name ?? null,
    contactPhone: contact?.phone ?? null,
    followUpTask: followUpTask
      ? {
          id: followUpTask._id,
          title: getVisibleInboxItemTitle(followUpTask),
          body: getVisibleInboxItemBody(followUpTask),
          createdAt: new Date(followUpTask._creationTime).toISOString(),
        }
      : null,
    outcome,
  };
}

async function resolveServiceDocument(
  ctx: Pick<ActionCtx, "runQuery">,
  businessId: Id<"businesses">,
  serviceName: string,
): Promise<Doc<"services"> | null> {
  const services: Array<Doc<"services">> = await ctx.runQuery(
    internal.voice.runtime.getActiveServicesForBusiness,
    { businessId },
  );
  const ranked = services
    .map((service) => ({
      service,
      score: scoreServiceMatch(service, serviceName),
    }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score);

  return ranked[0]?.service ?? null;
}

async function getVoiceCustomerLocale(
  ctx: Pick<ActionCtx, "runQuery">,
  businessId: Id<"businesses">,
): Promise<RuntimeLocale> {
  const business = await ctx.runQuery(internal.voice.runtime.getBusinessDefaultLocale, {
    businessId,
  });
  return business;
}

async function resolveVoiceCustomerFacingServiceName(
  ctx: ActionCtx,
  input: {
    serviceId: Id<"services">;
    fallbackName: string;
    locale: RuntimeLocale;
  },
): Promise<string> {
  try {
    return await ctx.runAction(internal.services.localizedNames.ensureLocalizedServiceName, {
      serviceId: input.serviceId,
      locale: input.locale,
    });
  } catch {
    return input.fallbackName;
  }
}

export const getActiveServicesForBusiness = internalQuery({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (
    ctx: QueryCtx,
    args: ServicesForBusinessArgs,
  ): Promise<Array<Doc<"services">>> => {
    return await ctx.db
      .query("services")
      .withIndex("by_business_id", (q) => q.eq("businessId", args.businessId))
      .collect();
  },
});

export const getBusinessDefaultLocale = internalQuery({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args): Promise<RuntimeLocale> => {
    const business = await ctx.db.get(args.businessId);
    return normalizeRuntimeLocale(business?.defaultLocale) ?? "en";
  },
});

export const getActiveBusinessBySlug = internalQuery({
  args: {
    businessSlug: v.string(),
  },
  handler: async (ctx: QueryCtx, args) => {
    return await resolveActiveBusinessByPublicSlug(ctx, args.businessSlug);
  },
});

export const assertWebVoiceStartAllowed = internalMutation({
  args: {
    businessId: v.id("businesses"),
    dashboardTestCallToken: v.optional(v.string()),
    origin: v.string(),
    ipHash: v.optional(v.string()),
    visitorId: v.optional(v.string()),
    widgetId: v.optional(v.string()),
  },
  handler: async (ctx: MutationCtx, args): Promise<null> => {
    const limits = buildWebVoiceStartLimits(args);

    await assertWebVoiceStartLimitsAvailable(ctx, limits);
    for (const limit of limits) {
      await consumeWebVoiceStartLimit(ctx, limit);
    }

    return null;
  },
});

export const assertWebVoiceBillingCanStart = internalQuery({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx: QueryCtx, args): Promise<null> => {
    const voicePolicy: {
      allowed: boolean;
      errorCode: UsageBillingErrorCode | null;
    } = await ctx.runQuery(internal.billing.assertVoiceCanStart, {
      businessId: args.businessId,
    });
    if (!voicePolicy.allowed) {
      throw new Error(voicePolicy.errorCode ?? billingErrorCodes.voiceLimitReached);
    }

    return null;
  },
});

export const getWebCallRecordingTarget = internalQuery({
  args: {
    gatewaySessionId: v.string(),
  },
  handler: async (ctx: QueryCtx, args): Promise<WebCallRecordingTarget | null> => {
    const call = await ctx.db
      .query("calls")
      .withIndex("by_gateway_session_id", (q) => q.eq("gatewaySessionId", args.gatewaySessionId))
      .unique();
    if (!call || call.transport !== "webrtc") {
      return null;
    }

    return {
      callId: call._id,
      ...(call.providerCallId !== undefined ? { providerCallId: call.providerCallId } : {}),
      startedAt: call.startedAt,
      ...(call.endedAt !== undefined ? { endedAt: call.endedAt } : {}),
      status: call.status,
      ...(call.webCallMaxDurationMs !== undefined
        ? { webCallMaxDurationMs: call.webCallMaxDurationMs }
        : {}),
    };
  },
});

export const getActiveStaffAssignmentsForService = internalQuery({
  args: {
    businessId: v.id("businesses"),
    serviceId: v.id("services"),
  },
  handler: async (
    ctx: QueryCtx,
    args: StaffAssignmentsForServiceArgs,
  ): Promise<{ activeStaffCount: number; assignmentCount: number }> => {
    const [staff, assignments] = await Promise.all([
      ctx.db
        .query("staff")
        .withIndex("by_business_id_and_active", (q) =>
          q.eq("businessId", args.businessId).eq("active", true),
        )
        .collect(),
      ctx.db
        .query("staff_service_assignments")
        .withIndex("by_service_id_and_staff_id", (q) => q.eq("serviceId", args.serviceId))
        .collect(),
    ]);

    const activeStaffIds = new Set(staff.map((member) => String(member._id)));
    const eligibleAssignments = assignments.filter(
      (assignment) =>
        assignment.businessId === args.businessId &&
        activeStaffIds.has(String(assignment.staffId)),
    );

    return {
      activeStaffCount: activeStaffIds.size,
      assignmentCount:
        eligibleAssignments.length > 0
          ? eligibleAssignments.length
          : activeStaffIds.size > 0
            ? 1
            : 0,
    };
  },
});

export const startCall = internalMutation({
  args: {
    businessId: v.id("businesses"),
    twilioCallSid: v.string(),
    gatewaySessionId: v.optional(v.string()),
    from: v.string(),
    to: v.string(),
    startedAt: v.string(),
  },
  handler: async (ctx: MutationCtx, args: StartCallArgs): Promise<StartCallResult> => {
    const existingCall: Doc<"calls"> | null = await ctx.db
      .query("calls")
      .withIndex("by_twilio_call_sid", (q) => q.eq("twilioCallSid", args.twilioCallSid))
      .unique();
    const activeExistingCall:
      | (Doc<"calls"> & {
          contactId: Id<"contacts">;
          conversationId: Id<"conversations">;
        })
      | null =
      existingCall &&
      existingCall.contactId !== undefined &&
      existingCall.conversationId !== undefined &&
      existingCall.endedAt === undefined
        ? (existingCall as Doc<"calls"> & {
            contactId: Id<"contacts">;
            conversationId: Id<"conversations">;
          })
        : null;

    if (activeExistingCall) {
      if (
        args.gatewaySessionId !== undefined &&
        activeExistingCall.gatewaySessionId !== args.gatewaySessionId
      ) {
        await ctx.db.patch(activeExistingCall._id, {
          gatewaySessionId: args.gatewaySessionId,
        });
      }

      return {
        callId: activeExistingCall._id,
        conversationId: activeExistingCall.conversationId,
        blocked: false,
        contactId: activeExistingCall.contactId,
      };
    }

    const voicePolicy: {
      allowed: boolean;
      errorCode: UsageBillingErrorCode | null;
    } = await ctx.runQuery(internal.billing.assertVoiceCanStart, {
      businessId: args.businessId,
    });
    if (!voicePolicy.allowed) {
      throw new Error(voicePolicy.errorCode ?? billingErrorCodes.voiceLimitReached);
    }

    let contact: Doc<"contacts"> | null = await ctx.db
      .query("contacts")
      .withIndex("by_business_id_and_phone", (q) =>
        q.eq("businessId", args.businessId).eq("phone", args.from),
      )
      .unique();

    if (contact && isContactBlocked(contact)) {
      let callId: Id<"calls">;

      if (existingCall) {
        await ctx.db.patch(existingCall._id, {
          status: "completed",
          endedAt: args.startedAt,
          contactId: contact._id,
          disposition: CONTACT_BLOCKED_CALL_DISPOSITION,
          ...(args.gatewaySessionId !== undefined
            ? { gatewaySessionId: args.gatewaySessionId }
            : {}),
        });
        callId = existingCall._id;
      } else {
        callId = await ctx.db.insert("calls", {
          businessId: args.businessId,
          contactId: contact._id,
          twilioCallSid: args.twilioCallSid,
          provider: "twilio",
          providerCallId: args.twilioCallSid,
          transport: "twilio_media_stream",
          ...(args.gatewaySessionId !== undefined
            ? { gatewaySessionId: args.gatewaySessionId }
            : {}),
          status: "completed",
          disposition: CONTACT_BLOCKED_CALL_DISPOSITION,
          startedAt: args.startedAt,
          endedAt: args.startedAt,
        });
      }

      return {
        callId,
        blocked: true,
        contactId: contact._id,
      };
    }

    if (!contact) {
      const contactId = await ctx.db.insert("contacts", {
        businessId: args.businessId,
        phone: args.from,
      });
      contact = await ctx.db.get(contactId);
    }

    if (!contact) {
      throw new Error("Failed to initialize contact for call.");
    }

    const openConversation: Doc<"conversations"> | null = await getOpenConversationForContact(
      ctx,
      {
        businessId: args.businessId,
        contactId: contact._id,
        channel: "voice",
      },
    );

    const conversationId =
      openConversation?._id ??
      (await ctx.db.insert("conversations", {
        businessId: args.businessId,
        contactId: contact._id,
        channel: "voice",
        status: "open",
      }));

    let callId: Id<"calls">;

    if (existingCall) {
      await ctx.db.patch(existingCall._id, {
        conversationId,
        contactId: contact._id,
        status: "in_progress",
        ...(args.gatewaySessionId !== undefined
          ? { gatewaySessionId: args.gatewaySessionId }
          : {}),
      });
      callId = existingCall._id;
    } else {
      callId = await ctx.db.insert("calls", {
        businessId: args.businessId,
        conversationId,
        contactId: contact._id,
        twilioCallSid: args.twilioCallSid,
        provider: "twilio",
        providerCallId: args.twilioCallSid,
        transport: "twilio_media_stream",
        ...(args.gatewaySessionId !== undefined
          ? { gatewaySessionId: args.gatewaySessionId }
          : {}),
        status: "in_progress",
        startedAt: args.startedAt,
      });
    }

    const reservation = await ctx.runMutation(internal.billing.reserveVoiceUsageAtCallStart, {
      businessId: args.businessId,
      callId,
      recordedAt: args.startedAt,
    });
    if (!reservation.allowed) {
      await ctx.db.patch(callId, {
        status: "completed",
        endedAt: args.startedAt,
        disposition: reservation.errorCode ?? billingErrorCodes.voiceLimitReached,
      });
      await ctx.db.patch(conversationId, {
        status: "closed",
      });
      throw new Error(reservation.errorCode ?? billingErrorCodes.voiceLimitReached);
    }
    if (reservation.syncNeeded && reservation.usageEventId) {
      await ctx.scheduler.runAfter(0, internal.billing.syncUsageEventToPolar, {
        usageEventId: reservation.usageEventId,
      });
    }

    await ensureVoiceSessionForCall(ctx, {
      businessId: args.businessId,
      conversationId,
      callId,
      startedAt: Date.parse(args.startedAt),
    });

    await enqueuePostHogOutboxRecord(
      ctx,
      serializePostHogEvent({
        eventName: "voice.call_started",
        businessId: args.businessId,
        distinctId: getPostHogDistinctIdForBusinessSystem(String(args.businessId)),
        groupKey: getPostHogBusinessGroupKey(String(args.businessId)),
        conversationId: String(conversationId),
        callId: String(callId),
        channel: "voice",
        provider: "twilio",
        properties: {
          status: "in_progress",
          gatewaySessionId: args.gatewaySessionId,
        },
      }),
    );

    return {
      callId,
      conversationId,
      blocked: false,
      contactId: contact._id,
    };
  },
});

export const startWebCall = internalMutation({
  args: {
    businessSlug: v.string(),
    providerCallId: v.string(),
    gatewaySessionId: v.optional(v.string()),
    originUrl: v.optional(v.string()),
    userAgent: v.optional(v.string()),
    widgetId: v.optional(v.string()),
    maxDurationMs: v.optional(v.number()),
    startedAt: v.string(),
  },
  handler: async (
    ctx: MutationCtx,
    args: StartWebCallArgs,
  ): Promise<StartWebCallResult> => {
    const business = await resolveActiveBusinessByPublicSlug(ctx, args.businessSlug);

    if (!business) {
      throw new Error("Web voice business not found.");
    }

    const existingCall: Doc<"calls"> | null = await ctx.db
      .query("calls")
      .withIndex("by_provider_and_provider_call_id", (q) =>
        q.eq("provider", "openai").eq("providerCallId", args.providerCallId),
      )
      .unique();

    if (existingCall?.conversationId) {
      if (existingCall.businessId !== business._id) {
        throw new Error("Web voice provider call belongs to a different business.");
      }
      return {
        businessId: existingCall.businessId,
        callId: existingCall._id,
        conversationId: existingCall.conversationId,
      };
    }

    if (existingCall && existingCall.businessId !== business._id) {
      throw new Error("Web voice provider call belongs to a different business.");
    }

    const voicePolicy: {
      allowed: boolean;
      errorCode: UsageBillingErrorCode | null;
    } = await ctx.runQuery(internal.billing.assertVoiceCanStart, {
      businessId: business._id,
    });
    if (!voicePolicy.allowed) {
      throw new Error(voicePolicy.errorCode ?? billingErrorCodes.voiceLimitReached);
    }

    const conversationId = await ctx.db.insert("conversations", {
      businessId: business._id,
      channel: "web_voice",
      status: "open",
    });

    const callId =
      existingCall?._id ??
      (await ctx.db.insert("calls", {
        businessId: business._id,
        conversationId,
        provider: "openai",
        providerCallId: args.providerCallId,
        transport: "webrtc",
        ...(args.originUrl !== undefined ? { originUrl: args.originUrl } : {}),
        ...(args.userAgent !== undefined ? { userAgent: args.userAgent } : {}),
        ...(args.widgetId !== undefined ? { widgetId: args.widgetId } : {}),
        ...(args.gatewaySessionId !== undefined
          ? { gatewaySessionId: args.gatewaySessionId }
          : {}),
        webCallMaxDurationMs: getWebCallMaxDurationMs(args.maxDurationMs),
        status: "in_progress",
        startedAt: args.startedAt,
      }));

    if (existingCall) {
      await ctx.db.patch(existingCall._id, {
        conversationId,
        status: "in_progress",
        ...(args.originUrl !== undefined ? { originUrl: args.originUrl } : {}),
        ...(args.userAgent !== undefined ? { userAgent: args.userAgent } : {}),
        ...(args.widgetId !== undefined ? { widgetId: args.widgetId } : {}),
        ...(args.gatewaySessionId !== undefined
          ? { gatewaySessionId: args.gatewaySessionId }
          : {}),
        webCallMaxDurationMs: getWebCallMaxDurationMs(args.maxDurationMs),
      });
    }

    const reservation = await ctx.runMutation(internal.billing.reserveVoiceUsageAtCallStart, {
      businessId: business._id,
      callId,
      recordedAt: args.startedAt,
    });
    if (!reservation.allowed) {
      await ctx.db.patch(callId, {
        status: "completed",
        endedAt: args.startedAt,
        disposition: reservation.errorCode ?? billingErrorCodes.voiceLimitReached,
      });
      await ctx.db.patch(conversationId, {
        status: "closed",
      });
      throw new Error(reservation.errorCode ?? billingErrorCodes.voiceLimitReached);
    }
    if (reservation.syncNeeded && reservation.usageEventId) {
      await ctx.scheduler.runAfter(0, internal.billing.syncUsageEventToPolar, {
        usageEventId: reservation.usageEventId,
      });
    }

    await ensureVoiceSessionForCall(ctx, {
      businessId: business._id,
      conversationId,
      callId,
      startedAt: Date.parse(args.startedAt),
      channel: "web_voice",
    });

    await ctx.scheduler.runAfter(
      getWebCallStaleTimeoutMs(args.maxDurationMs),
      internal.voice.runtime.expireStaleWebCall,
      {
        callId,
      },
    );

    await enqueuePostHogOutboxRecord(
      ctx,
      serializePostHogEvent({
        eventName: "voice.call_started",
        businessId: business._id,
        distinctId: getPostHogDistinctIdForBusinessSystem(String(business._id)),
        groupKey: getPostHogBusinessGroupKey(String(business._id)),
        conversationId: String(conversationId),
        callId: String(callId),
        channel: "web_voice",
        provider: "openai",
        properties: {
          status: "in_progress",
          transport: "webrtc",
          gatewaySessionId: args.gatewaySessionId,
          webCallMaxDurationMs: getWebCallMaxDurationMs(args.maxDurationMs),
          originUrl: args.originUrl,
          widgetId: args.widgetId,
        },
      }),
    );

    return {
      businessId: business._id,
      callId,
      conversationId,
    };
  },
});

export const expireStaleWebCall = internalMutation({
  args: {
    callId: v.id("calls"),
  },
  handler: async (ctx, args) => {
    const call = await ctx.db.get(args.callId);
    if (!call || call.transport !== "webrtc") {
      return null;
    }

    if (call.status !== "in_progress" && call.status !== "open") {
      return null;
    }

    const startedAtMs = Date.parse(call.startedAt);
    const maxDurationMs = getWebCallMaxDurationMs(call.webCallMaxDurationMs);
    if (
      !Number.isFinite(startedAtMs) ||
      Date.now() - startedAtMs < getWebCallStaleTimeoutMs(maxDurationMs)
    ) {
      return null;
    }

    const endedAtMs = Date.now();
    const endedAt = new Date(endedAtMs).toISOString();
    const providerDurationSeconds = Math.ceil(
      Math.min(endedAtMs - startedAtMs, maxDurationMs) / 1000,
    );
    await ctx.db.patch(call._id, {
      status: "completed",
      endedAt,
      disposition: call.disposition ?? "web_call_stale_timeout",
      ...(call.providerCallDurationSeconds === undefined
        ? { providerCallDurationSeconds: providerDurationSeconds }
        : {}),
    });

    if (call.conversationId) {
      await ctx.db.patch(call.conversationId, {
        status: "closed",
      });
    }

    await finalizeVoiceSessionForCall(ctx, {
      callId: call._id,
      endedAt: endedAtMs,
    });

    if (call.providerCallDurationSeconds === undefined) {
      const usageResult = await ctx.runMutation(internal.billing.recordVoiceUsage, {
        businessId: call.businessId,
        callId: call._id,
        quantity: providerDurationSeconds,
        recordedAt: endedAt,
      });

      if (usageResult.syncNeeded) {
        await ctx.scheduler.runAfter(0, internal.billing.syncUsageEventToPolar, {
          usageEventId: usageResult.usageEventId,
        });
      }
    }

    return null;
  },
});

export const appendTranscriptSegment = internalMutation({
  args: {
    businessId: v.id("businesses"),
    callId: v.id("calls"),
    sequence: v.number(),
    speaker: v.string(),
    text: v.string(),
    final: v.boolean(),
    confidence: v.optional(v.number()),
  },
  handler: async (ctx: MutationCtx, args: AppendTranscriptArgs): Promise<Id<"transcripts">> => {
    const existing = await ctx.db
      .query("transcripts")
      .withIndex("by_call_id_and_sequence", (q) =>
        q.eq("callId", args.callId).eq("sequence", args.sequence),
      )
      .unique();

    if (existing) {
      const expiresAt = existing.expiresAt ?? getSensitiveContentExpiresAt();
      await ctx.db.patch(existing._id, {
        speaker: args.speaker,
        text: args.text,
        final: args.final,
        ...(args.confidence !== undefined ? { confidence: args.confidence } : {}),
        expiresAt,
      });
      if (!existing.expiresAt) {
        await scheduleTranscriptExpiration(ctx, existing._id, expiresAt);
      }
      return existing._id;
    }

    const expiresAt = getSensitiveContentExpiresAt();
    const transcriptId = await ctx.db.insert("transcripts", {
      businessId: args.businessId,
      callId: args.callId,
      sequence: args.sequence,
      speaker: args.speaker,
      text: args.text,
      final: args.final,
      ...(args.confidence !== undefined ? { confidence: args.confidence } : {}),
      expiresAt,
    });
    await scheduleTranscriptExpiration(ctx, transcriptId, expiresAt);
    return transcriptId;
  },
});

export const setTransferState = internalMutation({
  args: {
    callId: v.id("calls"),
    transferState: v.string(),
  },
  handler: async (ctx: MutationCtx, args: SetTransferStateArgs) => {
    const call = await ctx.db.get(args.callId);
    if (!call) {
      throw new Error("Call not found.");
    }

    await ctx.db.patch(args.callId, {
      transferState: args.transferState,
    });

    await enqueuePostHogOutboxRecord(
      ctx,
      serializePostHogEvent({
        eventName: "voice.transfer_state_changed",
        businessId: call.businessId,
        distinctId: getPostHogDistinctIdForBusinessSystem(String(call.businessId)),
        groupKey: getPostHogBusinessGroupKey(String(call.businessId)),
        ...(call.conversationId ? { conversationId: String(call.conversationId) } : {}),
        callId: String(args.callId),
        channel: "voice",
        provider: "twilio",
        properties: {
          transferState: args.transferState,
        },
      }),
    );
    if (args.transferState === "requested" || args.transferState === "completed") {
      await enqueuePostHogOutboxRecord(
        ctx,
        serializePostHogEvent({
          eventName:
            args.transferState === "requested"
              ? "voice.transfer_requested"
              : "voice.transfer_completed",
          businessId: call.businessId,
          distinctId: getPostHogDistinctIdForBusinessSystem(String(call.businessId)),
          groupKey: getPostHogBusinessGroupKey(String(call.businessId)),
          ...(call.conversationId ? { conversationId: String(call.conversationId) } : {}),
          callId: String(args.callId),
          channel: "voice",
          provider: "twilio",
          properties: {
            transferState: args.transferState,
          },
        }),
      );
    }
    if (args.transferState === "failed") {
      await ctx.scheduler.runAfter(0, internal.operatorNotifications.dispatchEvent, {
        businessId: call.businessId,
        eventKind: "transferFailed",
        eventKey: `transferFailed:${String(args.callId)}`,
        subject: "Live call transfer failed",
        body: `A live transfer failed for call ${String(args.callId)}.`,
      });
    }
    return null;
  },
});

export const prepareTransferForVoice = internalMutation({
  args: {
    callId: v.optional(v.id("calls")),
    twilioCallSid: v.optional(v.string()),
    recordedAt: v.string(),
  },
  returns: v.object({
    allowed: v.boolean(),
    errorCode: v.union(
      v.literal("voice_limit_reached"),
      v.literal("alert_sms_limit_reached"),
      v.literal("outbound_call_attempt_limit_reached"),
      v.literal("ai_sms_not_enabled"),
      v.null(),
    ),
  }),
  handler: async (
    ctx: MutationCtx,
    args: PrepareTransferForVoiceArgs,
  ): Promise<{ allowed: boolean; errorCode: UsageBillingErrorCode | null }> => {
    const call =
      args.callId !== undefined
        ? await ctx.db.get(args.callId)
        : args.twilioCallSid !== undefined
          ? await ctx.db
              .query("calls")
              .withIndex("by_twilio_call_sid", (q) => q.eq("twilioCallSid", args.twilioCallSid!))
              .unique()
          : null;
    if (!call) {
      throw new Error("Call not found.");
    }

    const reservation = await ctx.runMutation(internal.billing.reserveOutboundCallAttemptUsage, {
      businessId: call.businessId,
      callId: call._id,
      recordedAt: args.recordedAt,
    });
    if (reservation.syncNeeded && reservation.usageEventId) {
      await ctx.scheduler.runAfter(0, internal.billing.syncUsageEventToPolar, {
        usageEventId: reservation.usageEventId,
      });
    }

    return {
      allowed: reservation.allowed,
      errorCode: reservation.errorCode as UsageBillingErrorCode | null,
    };
  },
});

export const releaseTransferForVoice = internalMutation({
  args: {
    callId: v.optional(v.id("calls")),
    twilioCallSid: v.optional(v.string()),
    recordedAt: v.string(),
  },
  returns: v.object({
    released: v.boolean(),
  }),
  handler: async (
    ctx: MutationCtx,
    args: ReleaseTransferForVoiceArgs,
  ): Promise<{ released: boolean }> => {
    const call =
      args.callId !== undefined
        ? await ctx.db.get(args.callId)
        : args.twilioCallSid !== undefined
          ? await ctx.db
              .query("calls")
              .withIndex("by_twilio_call_sid", (q) => q.eq("twilioCallSid", args.twilioCallSid!))
              .unique()
          : null;
    if (!call) {
      throw new Error("Call not found.");
    }

    const releaseResult = await ctx.runMutation(
      internal.billing.releaseOutboundCallAttemptReservation,
      {
        businessId: call.businessId,
        callId: call._id,
        recordedAt: args.recordedAt,
      },
    );

    if (releaseResult.syncNeeded && releaseResult.usageEventId) {
      await ctx.scheduler.runAfter(0, internal.billing.syncUsageEventToPolar, {
        usageEventId: releaseResult.usageEventId,
      });
    }

    return {
      released: releaseResult.released,
    };
  },
});

// @ts-ignore Deep type instantiation from Convex mutation builder.
export const takeMessageForVoice = internalMutation({
  args: {
    businessId: v.id("businesses"),
    callId: v.id("calls"),
    conversationId: v.optional(v.id("conversations")),
    channel: v.optional(v.union(v.literal("voice"), v.literal("web_voice"))),
    callerName: v.optional(v.string()),
    callbackPhone: v.optional(v.string()),
    message: v.string(),
    urgency: v.optional(v.string()),
    callbackWindow: v.optional(v.string()),
  },
  handler: async (
    ctx: MutationCtx,
    args: TakeMessageForVoiceArgs,
  ): Promise<{ inboxItemId: Id<"inbox_items"> }> => {
    const title = args.callerName
      ? `Voice message from ${args.callerName}`
      : `Voice message from ${args.callbackPhone ?? "unknown caller"}`;
    const body = [
      args.callbackPhone ? `Callback: ${args.callbackPhone}` : null,
      args.urgency ? `Urgency: ${args.urgency}` : null,
      args.callbackWindow ? `Preferred callback: ${args.callbackWindow}` : null,
      "",
      args.message,
    ]
      .filter((line): line is string => Boolean(line))
      .join("\n");
    const contentExpiresAt = getMessageContentExpiresAt();
    const channel = args.channel ?? "voice";

    const inboxItemId = await ctx.db.insert("inbox_items", {
      businessId: args.businessId,
      kind: "voice_message",
      title,
      body,
      relatedId: String(args.callId),
      status: "open",
      contentRetentionStatus: "active",
      contentExpiresAt,
    });
    await scheduleInboxItemContentExpiration(ctx, inboxItemId, contentExpiresAt);

    if (args.conversationId) {
      const messageId = await ctx.db.insert("messages", {
        businessId: args.businessId,
        conversationId: args.conversationId,
        direction: "inbound",
        channel,
        body: args.message,
        status: "captured",
        aiGenerated: false,
        contentRetentionStatus: "active",
        contentExpiresAt,
      });
      await scheduleMessageContentExpiration(ctx, messageId, contentExpiresAt);
      await ensureSessionForStoredMessage(ctx, {
        businessId: args.businessId,
        conversationId: args.conversationId,
        channel,
        messageId,
        callId: args.callId,
      });
      await ctx.db.patch(args.conversationId, {
        currentIntent: "message_taking",
        summary: body,
      });
    }

    await ctx.scheduler.runAfter(0, internal.operatorNotifications.dispatchEvent, {
      businessId: args.businessId,
      eventKind: "voiceMessage",
      eventKey: `voiceMessage:${String(inboxItemId)}`,
      subject: title,
      body,
    });

    return { inboxItemId };
  },
});

// @ts-ignore Deep type instantiation from Convex mutation builder.
export const attachCallRecording = internalMutation({
  args: {
    callId: v.id("calls"),
    recordingStorageId: v.id("_storage"),
    recordingContentType: v.string(),
    recordingByteLength: v.number(),
    recordingDurationMs: v.optional(v.number()),
  },
  handler: async (ctx: MutationCtx, args: AttachCallRecordingArgs) => {
    const call = await ctx.db.get(args.callId);
    if (!call) {
      throw new Error("Call not found.");
    }

    const existingTokens = await ctx.db
      .query("call_recording_download_tokens")
      .withIndex("by_call_id", (q) => q.eq("callId", args.callId))
      .collect();
    for (const token of existingTokens) {
      await ctx.db.delete(token._id);
    }

    const recordingExpiresAt = getCallRecordingExpiresAt();
    await ctx.db.patch(args.callId, {
      recordingStorageId: args.recordingStorageId,
      recordingContentType: args.recordingContentType,
      recordingByteLength: args.recordingByteLength,
      ...(args.recordingDurationMs !== undefined
        ? { recordingDurationMs: args.recordingDurationMs }
        : {}),
      recordingRetentionStatus: "active",
      recordingExpiresAt,
    });
    await scheduleCallRecordingExpiration(ctx, args.callId, recordingExpiresAt);

    await ctx.db.insert("call_recording_download_tokens", {
      businessId: call.businessId,
      callId: args.callId,
      storageId: args.recordingStorageId,
      fileName: `call-recording-${String(args.callId)}.wav`,
      contentType: args.recordingContentType,
      nonce: createCallRecordingNonce(),
      expiresAt: new Date(Date.now() + ATTACHMENT_DOWNLOAD_TOKEN_TTL_MS).toISOString(),
    });

    return null;
  },
});

export const getCallRecordingDownloadToken = internalQuery({
  args: {
    token: v.string(),
  },
  handler: async (ctx: QueryCtx, args) => {
    const token = await ctx.db
      .query("call_recording_download_tokens")
      .withIndex("by_nonce", (q) => q.eq("nonce", args.token))
      .unique();
    if (!token) {
      return null;
    }

    const call = await ctx.db.get(token.callId);
    if (!call || isCallRecordingExpired(call)) {
      return null;
    }

    return token;
  },
});

// @ts-ignore Deep type instantiation from Convex mutation builder.
export const completeCall = internalMutation({
  args: {
    callId: v.id("calls"),
    status: v.string(),
    endedAt: v.string(),
    disposition: v.optional(v.string()),
    providerDurationSeconds: v.optional(v.number()),
  },
  handler: async (ctx: MutationCtx, args: CompleteCallArgs) => {
    const call: Doc<"calls"> | null = await ctx.db.get(args.callId);
    if (!call) {
      throw new Error("Call not found.");
    }

    const disposition =
      args.disposition === "stream_stopped" &&
      call.disposition !== undefined &&
      call.disposition !== "stream_stopped"
        ? call.disposition
        : args.disposition;

    await ctx.db.patch(args.callId, {
      status: args.status,
      endedAt: args.endedAt,
      ...(disposition !== undefined ? { disposition } : {}),
      ...(args.providerDurationSeconds !== undefined &&
      call.providerCallDurationSeconds === undefined
        ? { providerCallDurationSeconds: args.providerDurationSeconds }
        : {}),
    });

    if (call.conversationId) {
      await ctx.db.patch(call.conversationId, {
        status: "closed",
      });
    }

    await finalizeVoiceSessionForCall(ctx, {
      callId: args.callId,
      endedAt: Date.parse(args.endedAt),
    });

    if (
      args.providerDurationSeconds !== undefined &&
      call.providerCallDurationSeconds === undefined
    ) {
      const usageResult = await ctx.runMutation(internal.billing.recordVoiceUsage, {
        businessId: call.businessId,
        callId: call._id,
        quantity: args.providerDurationSeconds,
        recordedAt: args.endedAt,
      });

      if (usageResult.syncNeeded) {
        await ctx.scheduler.runAfter(0, internal.billing.syncUsageEventToPolar, {
          usageEventId: usageResult.usageEventId,
        });
      }
    }

    await enqueuePostHogOutboxRecord(
      ctx,
      serializePostHogEvent({
        eventName: "voice.call_completed",
        businessId: call.businessId,
        distinctId: getPostHogDistinctIdForBusinessSystem(String(call.businessId)),
        groupKey: getPostHogBusinessGroupKey(String(call.businessId)),
        ...(call.conversationId ? { conversationId: String(call.conversationId) } : {}),
        callId: String(args.callId),
        channel: call.transport === "webrtc" ? "web_voice" : "voice",
        provider: call.provider ?? (call.twilioCallSid ? "twilio" : "openai"),
        properties: {
          status: args.status,
          disposition,
          ...(call.transport !== undefined ? { transport: call.transport } : {}),
        },
      }),
    );

    return null;
  },
});

export const systemBlockContactForVoiceCall = internalMutation({
  args: {
    callId: v.id("calls"),
    blockedAt: v.string(),
  },
  handler: async (
    ctx: MutationCtx,
    args: SystemBlockContactForVoiceCallArgs,
  ): Promise<SystemBlockContactForVoiceCallResult> => {
    const call: Doc<"calls"> | null = await ctx.db.get(args.callId);
    if (!call) {
      return { blocked: false, reason: "call_not_found" };
    }

    if (!call.conversationId) {
      return { blocked: false, reason: "missing_conversation" };
    }

    const conversation: Doc<"conversations"> | null = await ctx.db.get(call.conversationId);
    if (!conversation?.contactId) {
      return { blocked: false, reason: "missing_contact" };
    }

    const contact: Doc<"contacts"> | null = await ctx.db.get(conversation.contactId);
    if (!contact) {
      return { blocked: false, reason: "contact_not_found" };
    }

    if (isContactBlocked(contact)) {
      return {
        blocked: true,
        contactId: contact._id,
        reason: "already_blocked",
      };
    }

    await ctx.db.patch(contact._id, {
      operatorBlockedAt: args.blockedAt,
      operatorBlockedByUserId: undefined,
    });

    return {
      blocked: true,
      contactId: contact._id,
    };
  },
});

export const recordProviderPricing = internalMutation({
  args: {
    twilioCallSid: v.string(),
    providerUpdatedAt: v.optional(v.string()),
    providerPrice: v.optional(v.number()),
    providerPriceUnit: v.optional(v.string()),
    providerCostUsd: v.optional(v.number()),
    providerDurationSeconds: v.optional(v.number()),
  },
  handler: async (ctx: MutationCtx, args: RecordTwilioCallPricingArgs) => {
    const call: Doc<"calls"> | null = await ctx.db
      .query("calls")
      .withIndex("by_twilio_call_sid", (q) => q.eq("twilioCallSid", args.twilioCallSid))
      .unique();

    if (!call) {
      return { matched: false, applied: false };
    }

    const patch: Partial<Doc<"calls">> = {};
    let changed = false;
    let pricingChanged = false;

    if (args.providerUpdatedAt !== undefined && args.providerUpdatedAt !== call.providerUpdatedAt) {
      patch.providerUpdatedAt = args.providerUpdatedAt;
      changed = true;
    }
    if (args.providerPrice !== undefined && args.providerPrice !== call.providerPrice) {
      patch.providerPrice = args.providerPrice;
      changed = true;
      pricingChanged = true;
    }
    if (args.providerPriceUnit !== undefined && args.providerPriceUnit !== call.providerPriceUnit) {
      patch.providerPriceUnit = args.providerPriceUnit;
      changed = true;
      pricingChanged = true;
    }
    if (args.providerCostUsd !== undefined && args.providerCostUsd !== call.providerCostUsd) {
      patch.providerCostUsd = args.providerCostUsd;
      changed = true;
      pricingChanged = true;
    }
    if (
      args.providerDurationSeconds !== undefined &&
      args.providerDurationSeconds !== call.providerCallDurationSeconds
    ) {
      patch.providerCallDurationSeconds = args.providerDurationSeconds;
      changed = true;
    }

    if (!changed) {
      return { matched: true, applied: false };
    }

    await ctx.db.patch(call._id, patch);

    if (args.providerDurationSeconds !== undefined) {
      const usageResult = await ctx.runMutation(internal.billing.recordVoiceUsage, {
        businessId: call.businessId,
        callId: call._id,
        quantity: args.providerDurationSeconds,
        recordedAt: args.providerUpdatedAt ?? new Date().toISOString(),
      });

      if (usageResult.syncNeeded) {
        await ctx.scheduler.runAfter(0, internal.billing.syncUsageEventToPolar, {
          usageEventId: usageResult.usageEventId,
        });
      }
    }

    if (pricingChanged && args.providerCostUsd !== undefined) {
      await ctx.runMutation(internal.unitEconomics.recordVoiceProviderCost, {
        businessId: call.businessId,
        callId: call._id,
        ...(call.conversationId ? { conversationId: call.conversationId } : {}),
        occurredAt: args.providerUpdatedAt ?? new Date().toISOString(),
        costUsd: args.providerCostUsd,
        ...(args.providerDurationSeconds !== undefined
          ? { durationSeconds: args.providerDurationSeconds }
          : {}),
      });

      await enqueueVoiceProviderCostRecordedEvent(ctx, {
        businessId: call.businessId,
        ...(call.conversationId ? { conversationId: call.conversationId } : {}),
        callId: call._id,
        twilioCallSid: args.twilioCallSid,
        providerCostUsd: args.providerCostUsd,
        ...(args.providerUpdatedAt !== undefined ? { providerUpdatedAt: args.providerUpdatedAt } : {}),
        ...(args.providerPrice !== undefined ? { providerPrice: args.providerPrice } : {}),
        ...(args.providerPriceUnit !== undefined ? { providerPriceUnit: args.providerPriceUnit } : {}),
        ...(args.providerDurationSeconds !== undefined
          ? { providerDurationSeconds: args.providerDurationSeconds }
          : {}),
      });
    }

    return { matched: true, applied: true };
  },
});

// @ts-ignore Deep type instantiation from Convex mutation builder.
export const reconcileTwilioCallStatus = internalMutation({
  args: {
    twilioCallSid: v.string(),
    callStatus: v.string(),
    sequenceNumber: v.optional(v.number()),
    callbackSource: v.optional(v.string()),
    providerUpdatedAt: v.string(),
    providerDurationSeconds: v.optional(v.number()),
  },
  handler: async (
    ctx: MutationCtx,
    args: ReconcileTwilioCallStatusArgs,
  ): Promise<ReconcileTwilioCallStatusResult> => {
    const call: Doc<"calls"> | null = await ctx.db
      .query("calls")
      .withIndex("by_twilio_call_sid", (q) => q.eq("twilioCallSid", args.twilioCallSid))
      .unique();

    if (!call) {
      return { ignored: true, reason: "unknown_call" } as const;
    }
    if (!call.twilioCallSid) {
      return { ignored: true, reason: "unknown_call" } as const;
    }
    const twilioCallSid = call.twilioCallSid;

    if (
      call.providerCallStatusSequence !== undefined &&
      args.sequenceNumber === undefined
    ) {
      return { ignored: true, reason: "missing_sequence" } as const;
    }

    if (
      call.providerCallStatusSequence !== undefined &&
      args.sequenceNumber !== undefined &&
      args.sequenceNumber <= call.providerCallStatusSequence
    ) {
      return { ignored: true, reason: "stale_sequence" } as const;
    }

    const patch: Record<string, unknown> = {
      providerCallStatus: args.callStatus,
      providerUpdatedAt: args.providerUpdatedAt,
      ...(args.sequenceNumber !== undefined
        ? { providerCallStatusSequence: args.sequenceNumber }
        : {}),
      ...(args.callbackSource !== undefined
        ? { providerCallStatusSource: args.callbackSource }
        : {}),
      ...(args.providerDurationSeconds !== undefined
        ? { providerCallDurationSeconds: args.providerDurationSeconds }
        : {}),
    };

    let estimatedProviderCostUsd: number | undefined;
    let estimatedPricingChanged = false;

    if (
      isTerminalTwilioCallStatus(args.callStatus) &&
      call.providerCostUsd === undefined &&
      args.providerDurationSeconds !== undefined
    ) {
      estimatedProviderCostUsd = estimateTwilioInboundVoiceCostUsd(args.providerDurationSeconds);
      if (estimatedProviderCostUsd !== call.providerCostUsd) {
        patch.providerCostUsd = estimatedProviderCostUsd;
        estimatedPricingChanged = true;
      }
      if (call.providerPriceUnit !== "usd") {
        patch.providerPriceUnit = "usd";
      }
    }

    if (isTerminalTwilioCallStatus(args.callStatus)) {
      Object.assign(
        patch,
        getTerminalTwilioCallReconciliationFields(call, {
          callStatus: args.callStatus,
          providerUpdatedAt: args.providerUpdatedAt,
        }),
      );
    }

    await ctx.db.patch(call._id, patch);

    if (args.providerDurationSeconds !== undefined) {
      const usageResult = await ctx.runMutation(internal.billing.recordVoiceUsage, {
        businessId: call.businessId,
        callId: call._id,
        quantity: args.providerDurationSeconds,
        recordedAt: args.providerUpdatedAt,
      });

      if (usageResult.syncNeeded) {
        await ctx.scheduler.runAfter(0, internal.billing.syncUsageEventToPolar, {
          usageEventId: usageResult.usageEventId,
        });
      }
    }

    if (estimatedPricingChanged && estimatedProviderCostUsd !== undefined) {
      await ctx.runMutation(internal.unitEconomics.recordVoiceProviderCost, {
        businessId: call.businessId,
        callId: call._id,
        ...(call.conversationId ? { conversationId: call.conversationId } : {}),
        occurredAt: args.providerUpdatedAt,
        costUsd: estimatedProviderCostUsd,
        ...(args.providerDurationSeconds !== undefined
          ? { durationSeconds: args.providerDurationSeconds }
          : {}),
      });

      await enqueueVoiceProviderCostRecordedEvent(ctx, {
        businessId: call.businessId,
        ...(call.conversationId ? { conversationId: call.conversationId } : {}),
        callId: call._id,
        twilioCallSid,
        providerCostUsd: estimatedProviderCostUsd,
        providerUpdatedAt: args.providerUpdatedAt,
        providerPriceUnit: "usd",
        ...(args.providerDurationSeconds !== undefined
          ? { providerDurationSeconds: args.providerDurationSeconds }
          : {}),
      });
    }

    if (isTerminalTwilioCallStatus(args.callStatus) && call.conversationId) {
      const conversation = await ctx.db.get(call.conversationId);
      if (conversation && conversation.status !== "closed") {
        await ctx.db.patch(call.conversationId, {
          status: "closed",
        });
      }
    }

    if (isTerminalTwilioCallStatus(args.callStatus)) {
      await finalizeVoiceSessionForCall(ctx, {
        callId: call._id,
        endedAt: Date.parse(args.providerUpdatedAt),
      });

      if (call.providerCostUsd === undefined) {
        await ctx.scheduler.runAfter(
          0,
          internal.integrations.twilioVoice.syncCallPriceFromProvider,
          {
            twilioCallSid,
            providerCallStatus: args.callStatus,
          },
        );
      }
    }

    return { ignored: false, callId: call._id } as const;
  },
});

// @ts-ignore Deep type instantiation from Convex action builder.
export const checkAvailabilityForVoice = internalAction({
  args: {
    businessId: v.id("businesses"),
    serviceName: v.string(),
    startsAt: v.string(),
    timezone: v.string(),
    preferredStaffId: v.optional(v.id("staff")),
  },
  handler: async (
    ctx: ActionCtx,
    args: CheckAvailabilityForVoiceArgs,
  ): Promise<CheckAvailabilityForVoiceResult> => {
    await ctx.runMutation(internal.businesses.catalog.ensureDefaultStaffForBusiness, {
      businessId: args.businessId,
    });
    const service = await resolveServiceDocument(ctx, args.businessId, args.serviceName);
    if (!service || service.businessId !== args.businessId || !service.active) {
      throw new Error("Service not found for this business.");
    }
    const locale = await getVoiceCustomerLocale(ctx, args.businessId);
    const localizedServiceName = await resolveVoiceCustomerFacingServiceName(ctx, {
      serviceId: service._id,
      fallbackName: service.name,
      locale,
    });

    const setup: { activeStaffCount: number; assignmentCount: number } = await ctx.runQuery(
      internal.voice.runtime.getActiveStaffAssignmentsForService,
      {
        businessId: args.businessId,
        serviceId: service._id,
      },
    );
    if (setup.assignmentCount === 0) {
      return {
        serviceId: service._id,
        serviceName: localizedServiceName,
        availability: [],
        setupIssue:
          setup.activeStaffCount === 0 ? "no_active_staff" : "no_staff_assigned",
      };
    }

    const availability: Array<{
      staffId: string;
      serviceId: string;
      startsAt: string;
      endsAt: string;
    }> = await ctx.runQuery(internal.appointments.booking.checkAvailabilityForBusiness, {
      businessId: args.businessId,
      serviceId: service._id,
      startsAt: args.startsAt,
      timezone: args.timezone,
      ...(args.preferredStaffId !== undefined
        ? { preferredStaffId: args.preferredStaffId }
        : {}),
    });

    return {
      serviceId: service._id,
      serviceName: localizedServiceName,
      availability,
      setupIssue: null,
    };
  },
});

// @ts-ignore Deep type instantiation from Convex action builder.
export const findAvailabilityForVoice = internalAction({
  args: {
    businessId: v.id("businesses"),
    serviceName: v.string(),
    date: v.string(),
    timezone: v.string(),
    preferredStaffId: v.optional(v.id("staff")),
    preferredHour24: v.optional(v.number()),
    preferredMinute: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (
    ctx: ActionCtx,
    args: FindAvailabilityForVoiceArgs,
  ): Promise<FindAvailabilityForVoiceResult> => {
    await ctx.runMutation(internal.businesses.catalog.ensureDefaultStaffForBusiness, {
      businessId: args.businessId,
    });
    const service = await resolveServiceDocument(ctx, args.businessId, args.serviceName);
    if (!service || service.businessId !== args.businessId || !service.active) {
      throw new Error("Service not found for this business.");
    }
    const locale = await getVoiceCustomerLocale(ctx, args.businessId);
    const localizedServiceName = await resolveVoiceCustomerFacingServiceName(ctx, {
      serviceId: service._id,
      fallbackName: service.name,
      locale,
    });

    const setup: { activeStaffCount: number; assignmentCount: number } = await ctx.runQuery(
      internal.voice.runtime.getActiveStaffAssignmentsForService,
      {
        businessId: args.businessId,
        serviceId: service._id,
      },
    );
    if (setup.assignmentCount === 0) {
      const setupIssue =
        setup.activeStaffCount === 0 ? "no_active_staff" : "no_staff_assigned";
      return {
        serviceId: service._id,
        serviceName: localizedServiceName,
        timezone: args.timezone,
        date: args.date,
        slots: [],
        setupIssue,
        summary:
          setupIssue === "no_active_staff"
            ? `${localizedServiceName} cannot be booked yet because booking is not configured for this business yet.`
            : `${localizedServiceName} cannot be booked yet because booking is not configured for this service yet.`,
      };
    }

    const slots: Array<{
      startsAt: string;
      endsAt: string;
      displayTime: string;
    }> = await ctx.runQuery(internal.appointments.booking.findAvailabilityForBusiness, {
      businessId: args.businessId,
      serviceId: service._id,
      date: args.date,
      timezone: args.timezone,
      ...(args.preferredStaffId !== undefined
        ? { preferredStaffId: args.preferredStaffId }
        : {}),
      ...(args.preferredHour24 !== undefined
        ? { preferredHour24: args.preferredHour24 }
        : {}),
      ...(args.preferredMinute !== undefined
        ? { preferredMinute: args.preferredMinute }
        : {}),
      ...(args.limit !== undefined ? { limit: args.limit } : {}),
    });

    return {
      serviceId: service._id,
      serviceName: localizedServiceName,
      timezone: args.timezone,
      date: args.date,
      slots,
      setupIssue: null,
      summary:
        slots.length === 0
          ? `No availability found for ${localizedServiceName} on ${args.date}.`
          : `Available ${localizedServiceName} slots on ${args.date}: ${slots
              .map((slot) => slot.displayTime)
              .join(", ")}.`,
    };
  },
});

// @ts-ignore Deep type instantiation from Convex action builder.
export const bookAppointmentForVoice = internalAction({
  args: {
    businessId: v.id("businesses"),
    serviceName: v.string(),
    startsAt: v.string(),
    timezone: v.string(),
    channel: v.optional(v.union(v.literal("voice"), v.literal("web_voice"))),
    preferredStaffId: v.optional(v.id("staff")),
    conversationId: v.optional(v.id("conversations")),
    contactName: v.optional(v.string()),
    contactPhone: v.string(),
    smsConsentGranted: v.boolean(),
  },
  handler: async (
    ctx: ActionCtx,
    args: BookAppointmentForVoiceArgs,
  ): Promise<BookAppointmentForVoiceResult> => {
    await ctx.runMutation(internal.businesses.catalog.ensureDefaultStaffForBusiness, {
      businessId: args.businessId,
    });
    const service = await resolveServiceDocument(ctx, args.businessId, args.serviceName);
    if (!service || service.businessId !== args.businessId || !service.active) {
      throw new Error("Service not found for this business.");
    }
    const locale = await getVoiceCustomerLocale(ctx, args.businessId);
    const localizedServiceName = await resolveVoiceCustomerFacingServiceName(ctx, {
      serviceId: service._id,
      fallbackName: service.name,
      locale,
    });

    const result = await ctx.runMutation(
      internal.appointments.booking.bookAppointmentForBusiness,
      {
        businessId: args.businessId,
        serviceId: service._id,
        startsAt: args.startsAt,
        timezone: args.timezone,
        ...(args.preferredStaffId !== undefined
          ? { preferredStaffId: args.preferredStaffId }
          : {}),
        ...(args.contactName !== undefined ? { contactName: args.contactName } : {}),
        contactPhone: args.contactPhone,
        sourceChannel: args.channel ?? "voice",
        smsConsentGranted: args.smsConsentGranted,
      },
    );

    if (args.conversationId) {
      await ctx.runMutation(internal.ai.agents.runtime.saveConversationBookingState, {
        businessId: args.businessId,
        conversationId: args.conversationId,
        mode: "booked",
        selectedServiceId: service._id,
        lastConfirmedAppointmentId: result.appointmentId,
        lastConfirmedServiceId: service._id,
        lastConfirmedStartsAt: args.startsAt,
        lastOfferedStartsAt: [],
        pendingConfirmationAppointmentId: result.appointmentId,
      });
    }

    return {
      ...result,
      serviceId: service._id,
      serviceName: localizedServiceName,
    };
  },
});

export const createDashboardTestCallProof = mutation({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx: MutationCtx, args): Promise<{ proof: string | null }> => {
    await requireMembership(ctx, args.businessId);
    const business = await ctx.db.get(args.businessId);
    if (!business) {
      throw new Error("Business not found.");
    }

    const expiresAt = Date.now() + DASHBOARD_TEST_CALL_PROOF_TTL_MS;
    const proof = await signDashboardTestCallProof({
      businessSlug: business.slug,
      expiresAt,
      nonce: crypto.randomUUID(),
    });
    return { proof };
  },
});

// @ts-ignore Deep type instantiation from Convex query builder.
export const listRecentCalls = query({
  args: {
    businessId: v.id("businesses"),
    limit: v.optional(v.number()),
    selectedCallId: v.optional(v.id("calls")),
  },
  handler: async (ctx: QueryCtx, args: ListRecentCallsArgs) => {
    await requireMembership(ctx, args.businessId);
    const [recentCalls, selectedCall, openVoiceFollowUpItems]: [
      Array<Doc<"calls">>,
      Doc<"calls"> | null,
      Array<Doc<"inbox_items">>,
    ] = await Promise.all([
      ctx.db
        .query("calls")
        .withIndex("by_business_id_and_started_at", (q) => q.eq("businessId", args.businessId))
        .order("desc")
        .take(args.limit ?? 20),
      args.selectedCallId ? ctx.db.get(args.selectedCallId) : Promise.resolve(null),
      ctx.db
        .query("inbox_items")
        .withIndex("by_business_id_and_kind_and_status", (q) =>
          q.eq("businessId", args.businessId).eq("kind", "voice_message").eq("status", "open"),
        )
        .collect(),
    ]);

    const calls = recentCalls.slice();
    if (
      selectedCall &&
      selectedCall.businessId === args.businessId &&
      !calls.some((call) => call._id === selectedCall._id)
    ) {
      calls.push(selectedCall);
      calls.sort((left, right) => Date.parse(right.startedAt) - Date.parse(left.startedAt));
    }

    const voiceFollowUpByCallId = dedupeVoiceFollowUpItems(
      openVoiceFollowUpItems.slice().sort((left, right) => right._creationTime - left._creationTime),
    );

    return await Promise.all(
      calls.map((call) => hydrateDashboardCallRow(ctx, call, voiceFollowUpByCallId)),
    );
  },
});

export const getCallForDashboard = query({
  args: {
    businessId: v.id("businesses"),
    callId: v.id("calls"),
  },
  handler: async (ctx: QueryCtx, args: GetCallForDashboardArgs) => {
    await requireMembership(ctx, args.businessId);

    const [call, openVoiceFollowUpItems]: [Doc<"calls"> | null, Array<Doc<"inbox_items">>] =
      await Promise.all([
        ctx.db.get(args.callId),
        ctx.db
          .query("inbox_items")
          .withIndex("by_business_id_and_kind_and_status", (q) =>
            q.eq("businessId", args.businessId).eq("kind", "voice_message").eq("status", "open"),
          )
          .collect(),
      ]);

    if (!call || call.businessId !== args.businessId) {
      return null;
    }

    const voiceFollowUpByCallId = dedupeVoiceFollowUpItems(
      openVoiceFollowUpItems.slice().sort((left, right) => right._creationTime - left._creationTime),
    );

    return await hydrateDashboardCallRow(ctx, call, voiceFollowUpByCallId);
  },
});

export const getVoiceFollowUpTaskForDashboard = query({
  args: {
    businessId: v.id("businesses"),
    inboxItemId: v.id("inbox_items"),
  },
  handler: async (ctx: QueryCtx, args: GetVoiceFollowUpTaskForDashboardArgs) => {
    await requireMembership(ctx, args.businessId);

    const inboxItem = await ctx.db.get(args.inboxItemId);
    if (
      !inboxItem ||
      inboxItem.businessId !== args.businessId ||
      inboxItem.kind !== "voice_message" ||
      inboxItem.status !== "open"
    ) {
      return null;
    }

    return {
      id: inboxItem._id,
      title: getVisibleInboxItemTitle(inboxItem),
      body: getVisibleInboxItemBody(inboxItem),
      createdAt: new Date(inboxItem._creationTime).toISOString(),
      callId: inboxItem.relatedId ? (inboxItem.relatedId as Id<"calls">) : null,
    };
  },
});

export const completeVoiceFollowUpTask = mutation({
  args: {
    businessId: v.id("businesses"),
    inboxItemId: v.id("inbox_items"),
  },
  handler: async (ctx: MutationCtx, args: CompleteVoiceFollowUpTaskArgs) => {
    await requireMembership(ctx, args.businessId);

    const inboxItem = await ctx.db.get(args.inboxItemId);
    if (!inboxItem || inboxItem.businessId !== args.businessId) {
      throw new Error("Follow-up task not found.");
    }

    if (inboxItem.kind !== "voice_message") {
      throw new Error("Only voice follow-up tasks can be completed here.");
    }

    if (inboxItem.status === "done") {
      return null;
    }

    if (!inboxItem.relatedId) {
      await ctx.db.patch(args.inboxItemId, {
        status: "done",
      });
      return null;
    }

    const relatedItems = await ctx.db
      .query("inbox_items")
      .withIndex("by_business_id_and_kind_and_status", (q) =>
        q.eq("businessId", args.businessId).eq("kind", "voice_message").eq("status", "open"),
      )
      .collect();

    const duplicateFollowUps = relatedItems.filter((item) => item.relatedId === inboxItem.relatedId);
    await Promise.all(
      duplicateFollowUps.map((item) =>
        ctx.db.patch(item._id, {
          status: "done",
        }),
      ),
    );

    return null;
  },
});

export const getCallTranscript = query({
  args: {
    businessId: v.id("businesses"),
    callId: v.id("calls"),
  },
  handler: async (ctx: QueryCtx, args: GetCallTranscriptArgs) => {
    await requireMembership(ctx, args.businessId);
    const call: Doc<"calls"> | null = await ctx.db.get(args.callId);
    if (!call || call.businessId !== args.businessId) {
      throw new Error("Call not found.");
    }

    const transcripts = await ctx.db
      .query("transcripts")
      .withIndex("by_call_id_and_sequence", (q) => q.eq("callId", args.callId))
      .order("asc")
      .collect();
    return transcripts.filter((transcript) => !isTranscriptExpired(transcript));
  },
});
