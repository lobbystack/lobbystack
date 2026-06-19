"use node";

import { createHmac, timingSafeEqual } from "node:crypto";
import { v } from "convex/values";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { type ActionCtx } from "../_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import {
  type AvailableNumberSummary,
  buildAreaCodeSelectionContext,
  buildCitySelectionContext,
  buildSuggestionContextFromVerifiedPhoneMarket,
  buildSuggestedSelectionContext,
  buildTollFreeSelectionContext,
  getMetroAreaCodePriority,
  numberSelectionContextValidator,
  searchModeValidator,
  type NumberSelectionContext,
  type NumberSuggestionContext,
  resolveVerifiedPhoneMarket,
  type VerifiedPhoneMarket,
} from "../lib/onboardingPhoneNumbers";
import { getTwilioClient } from "../lib/node/twilioClient";
import {
  buildTwilioSmsInboundWebhookUrl,
  buildTwilioVoiceInboundWebhookUrl,
  buildTwilioVoiceStatusCallbackUrl,
} from "../lib/twilioUrls";
import { ONBOARDING_STAGE_INDEX, normalizeOnboardingStage } from "../lib/onboardingStage";
import {
  assertClaimAttemptAllowed,
  assertInitialSuggestionAllowed,
  assertInventorySearchAllowed,
  normalizeInventorySearchLimit,
  recordFailedClaimAttempt,
  recordSuccessfulPurchaseLog,
} from "./abuse";

import { observedAction as action } from "../telemetry/observedFunctions";
type TwilioAvailableNumber = {
  phoneNumber?: string | null;
  locality?: string | null;
  region?: string | null;
  isoCountry?: string | null;
  capabilities?: Record<string, boolean>;
};

type TwilioLookupResult = {
  countryCode: string;
  phoneNumber: string;
  valid: boolean;
};

type SupportedPhoneNumberCountryCode = "US" | "CA" | "GB" | "AU";
type TwilioAreaCodeSearchCountryCode = "US" | "CA";

type PurchasedIncomingNumber = {
  sid: string;
  smsUrl?: string | null;
  voiceUrl?: string | null;
};

type ClaimNumberResult =
  | {
      status: "claimed";
      phoneNumberId: Id<"phone_numbers">;
      e164: string;
    }
  | {
      status: "unavailable";
      message: string;
      alternatives: Array<AvailableNumberSummary>;
    }
  | {
      status: "failed";
      message: string;
    };

type NumberClaimTokenPayload = {
  version: 1;
  businessId: string;
  userId: string;
  e164: string;
  countryCode: string;
  kind: AvailableNumberSummary["kind"];
  capabilities: AvailableNumberSummary["capabilities"];
  selectionContext: NumberSelectionContext;
  expiresAt: number;
};

const NUMBER_CLAIM_TOKEN_TTL_MS = 5 * 60 * 1000;

function isLikelyNumberUnavailableError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const code =
    "code" in error && (typeof error.code === "number" || typeof error.code === "string")
      ? Number(error.code)
      : null;
  if (code === 21422) {
    return true;
  }
  if (code === 21404) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes("already taken") ||
    message.includes("no longer available") ||
    message.includes("not currently available") ||
    message.includes("phone number is unavailable")
  );
}

function getPurchaseFailureMessage(error: unknown): string | null {
  if (!(error instanceof Error)) {
    return null;
  }

  const code =
    "code" in error && (typeof error.code === "number" || typeof error.code === "string")
      ? Number(error.code)
      : null;
  if (code === 21404) {
    return "This Twilio account can't buy that number. Trial accounts can only buy eligible trial numbers and may need an existing number released or the account upgraded.";
  }

  return error.message;
}

function normalizeComparableLocation(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function formatDisplayPhoneNumber(e164: string): string {
  const digits = e164.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    const nationalNumber = digits.slice(1);
    return `(${nationalNumber.slice(0, 3)}) ${nationalNumber.slice(3, 6)}-${nationalNumber.slice(6)}`;
  }

  return e164;
}

export function normalizeClaimE164(e164: string): string | null {
  const trimmed = e164.trim();
  return /^\+\d{8,15}$/.test(trimmed) ? trimmed : null;
}

function getNumberClaimTokenSecret(): string {
  const secret =
    process.env.NUMBER_CLAIM_TOKEN_SECRET?.trim() ||
    process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!secret) {
    throw new Error("Twilio credentials are required for phone-number provisioning.");
  }

  return secret;
}

function signClaimTokenPayload(payload: string): string {
  return createHmac("sha256", getNumberClaimTokenSecret())
    .update(payload)
    .digest("base64url");
}

function createNumberClaimToken(input: {
  businessId: Id<"businesses">;
  userId: Id<"users">;
  number: AvailableNumberSummary;
}): string {
  const payload: NumberClaimTokenPayload = {
    version: 1,
    businessId: String(input.businessId),
    userId: String(input.userId),
    e164: input.number.e164,
    countryCode: input.number.countryCode,
    kind: input.number.kind,
    capabilities: input.number.capabilities,
    selectionContext: input.number.selectionContext,
    expiresAt: Date.now() + NUMBER_CLAIM_TOKEN_TTL_MS,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url",
  );
  return `${encodedPayload}.${signClaimTokenPayload(encodedPayload)}`;
}

function signaturesMatch(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function parseClaimTokenPayload(token: string): NumberClaimTokenPayload | null {
  const [encodedPayload, signature, extra] = token.split(".");
  if (!encodedPayload || !signature || extra !== undefined) {
    return null;
  }

  const expectedSignature = signClaimTokenPayload(encodedPayload);
  if (!signaturesMatch(signature, expectedSignature)) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as Partial<NumberClaimTokenPayload>;
    if (
      parsed.version !== 1 ||
      typeof parsed.businessId !== "string" ||
      typeof parsed.userId !== "string" ||
      typeof parsed.e164 !== "string" ||
      typeof parsed.countryCode !== "string" ||
      (parsed.kind !== "local" && parsed.kind !== "toll_free") ||
      typeof parsed.expiresAt !== "number" ||
      !parsed.capabilities ||
      parsed.capabilities.sms !== true ||
      parsed.capabilities.voice !== true ||
      !parsed.selectionContext ||
      typeof parsed.selectionContext.countryCode !== "string" ||
      (parsed.selectionContext.mode !== "suggested" &&
        parsed.selectionContext.mode !== "city" &&
        parsed.selectionContext.mode !== "area_code" &&
        parsed.selectionContext.mode !== "toll_free")
    ) {
      return null;
    }

    return parsed as NumberClaimTokenPayload;
  } catch {
    return null;
  }
}

function normalizeSelectionContextForComparison(
  context: NumberSelectionContext,
): NumberSelectionContext {
  return {
    mode: context.mode,
    countryCode: context.countryCode,
    ...(context.regionCode !== undefined ? { regionCode: context.regionCode } : {}),
    ...(context.city !== undefined ? { city: context.city } : {}),
    ...(context.areaCode !== undefined ? { areaCode: context.areaCode } : {}),
    ...(context.metroKey !== undefined ? { metroKey: context.metroKey } : {}),
  };
}

function selectionContextsMatch(
  left: NumberSelectionContext,
  right: NumberSelectionContext,
): boolean {
  return (
    JSON.stringify(normalizeSelectionContextForComparison(left)) ===
    JSON.stringify(normalizeSelectionContextForComparison(right))
  );
}

export function verifyNumberClaimToken(input: {
  token: string;
  businessId: Id<"businesses">;
  userId: Id<"users">;
  claimE164: string;
  selectionContext: NumberSelectionContext;
}): NumberClaimTokenPayload {
  const payload = parseClaimTokenPayload(input.token);
  if (!payload) {
    throw new Error("The selected phone number offer is invalid. Refresh the list and try again.");
  }
  if (payload.expiresAt < Date.now()) {
    throw new Error("The selected phone number offer expired. Refresh the list and try again.");
  }
  if (
    payload.businessId !== String(input.businessId) ||
    payload.userId !== String(input.userId) ||
    payload.e164 !== input.claimE164 ||
    !selectionContextsMatch(payload.selectionContext, input.selectionContext)
  ) {
    throw new Error("The selected phone number offer is invalid. Refresh the list and try again.");
  }

  return payload;
}

export function normalizeSupportedCountryCode(
  value: string | undefined,
): SupportedPhoneNumberCountryCode | null {
  const normalized = value?.trim().toUpperCase();
  return normalized === "US" || normalized === "CA" || normalized === "GB" || normalized === "AU"
    ? normalized
    : null;
}

function supportsTwilioAreaCodeSearch(
  countryCode: string,
): countryCode is TwilioAreaCodeSearchCountryCode {
  const normalized = countryCode.trim().toUpperCase();
  return normalized === "US" || normalized === "CA";
}

function dedupeNumbers(numbers: Array<AvailableNumberSummary>): Array<AvailableNumberSummary> {
  const seen = new Set<string>();
  const unique: Array<AvailableNumberSummary> = [];

  for (const number of numbers) {
    if (seen.has(number.e164)) {
      continue;
    }

    seen.add(number.e164);
    unique.push(number);
  }

  return unique;
}

function hasTwilioCapability(
  capabilities: TwilioAvailableNumber["capabilities"],
  name: "sms" | "voice",
): boolean {
  if (!capabilities) {
    return false;
  }

  const titleCaseName = `${name.charAt(0).toUpperCase()}${name.slice(1)}`;
  return (
    capabilities[name] === true ||
    capabilities[name.toUpperCase()] === true ||
    capabilities[titleCaseName] === true
  );
}

function toAvailableNumberSummary(input: {
  number: TwilioAvailableNumber;
  kind: AvailableNumberSummary["kind"];
  selectionContext: NumberSelectionContext;
}): AvailableNumberSummary | null {
  const e164 = input.number.phoneNumber?.trim();
  if (!e164) {
    return null;
  }

  if (
    !hasTwilioCapability(input.number.capabilities, "sms") ||
    !hasTwilioCapability(input.number.capabilities, "voice")
  ) {
    return null;
  }

  return {
    e164,
    display: formatDisplayPhoneNumber(e164),
    ...(input.number.locality ? { locality: input.number.locality } : {}),
    ...(input.number.region ? { region: input.number.region } : {}),
    countryCode: input.number.isoCountry ?? input.selectionContext.countryCode,
    kind: input.kind,
    capabilities: {
      sms: true,
      voice: true,
    },
    selectionContext: input.selectionContext,
  };
}

function getTwilioLocalCollection(client: ReturnType<typeof getTwilioClient>, countryCode: string) {
  return client.availablePhoneNumbers(countryCode).local;
}

function getTwilioTollFreeCollection(
  client: ReturnType<typeof getTwilioClient>,
  countryCode: string,
) {
  return client.availablePhoneNumbers(countryCode).tollFree;
}

async function listLocalNumbersByAreaCode(input: {
  countryCode: string;
  areaCode: string;
  limit: number;
}): Promise<Array<TwilioAvailableNumber>> {
  const normalizedAreaCode = input.areaCode.trim();
  if (!/^\d+$/.test(normalizedAreaCode)) {
    return [];
  }

  const client = getTwilioClient();
  return await getTwilioLocalCollection(client, input.countryCode).list({
    areaCode: Number.parseInt(normalizedAreaCode, 10),
    limit: input.limit,
    smsEnabled: true,
    voiceEnabled: true,
  });
}

async function listLocalNumbersByLocation(input: {
  countryCode: string;
  city?: string;
  regionCode?: string;
  postalCode?: string;
  limit: number;
}): Promise<Array<TwilioAvailableNumber>> {
  const client = getTwilioClient();
  return await getTwilioLocalCollection(client, input.countryCode).list({
    ...(input.city ? { inLocality: input.city } : {}),
    ...(input.regionCode ? { inRegion: input.regionCode } : {}),
    ...(input.postalCode ? { inPostalCode: input.postalCode } : {}),
    limit: input.limit,
    smsEnabled: true,
    voiceEnabled: true,
  });
}

async function listFallbackLocalNumbers(input: {
  countryCode: string;
  limit: number;
}): Promise<Array<TwilioAvailableNumber>> {
  const client = getTwilioClient();
  return await getTwilioLocalCollection(client, input.countryCode).list({
    limit: input.limit,
    smsEnabled: true,
    voiceEnabled: true,
  });
}

async function listTollFreeNumbers(input: {
  countryCode: string;
  limit: number;
}): Promise<Array<TwilioAvailableNumber>> {
  const client = getTwilioClient();
  return await getTwilioTollFreeCollection(client, input.countryCode).list({
    limit: input.limit,
    smsEnabled: true,
    voiceEnabled: true,
  });
}

export async function getSuggestedNumbers(
  context: NumberSuggestionContext,
  limit: number,
): Promise<Array<AvailableNumberSummary>> {
  const collected: Array<AvailableNumberSummary> = [];

  for (const areaCode of getMetroAreaCodePriority(context)) {
    const selectionContext = buildAreaCodeSelectionContext({
      countryCode: context.countryCode,
      areaCode,
    });
    const numbers = await listLocalNumbersByAreaCode({
      countryCode: context.countryCode,
      areaCode,
      limit,
    });

    collected.push(
      ...numbers
        .map((number) =>
          toAvailableNumberSummary({
            number,
            kind: "local",
            selectionContext,
          }),
        )
        .filter((number): number is AvailableNumberSummary => number !== null),
    );

    if (collected.length >= limit) {
      break;
    }
  }

  if (
    collected.length < limit &&
    (context.confidence >= 0.8 || Boolean(context.postalCode)) &&
    (context.city || context.regionCode || context.postalCode)
  ) {
    const selectionContext = buildSuggestedSelectionContext(context);
    const locationMatches = await listLocalNumbersByLocation({
      countryCode: context.countryCode,
      ...(context.city ? { city: context.city } : {}),
      ...(context.regionCode ? { regionCode: context.regionCode } : {}),
      ...(context.postalCode ? { postalCode: context.postalCode } : {}),
      limit,
    });
    collected.push(
      ...locationMatches
        .map((number) =>
          toAvailableNumberSummary({
            number,
            kind: "local",
            selectionContext,
          }),
        )
        .filter((number): number is AvailableNumberSummary => number !== null),
    );
  }

  const shouldUseCountryWideFallback =
    Boolean(context.metroKey) || context.confidence >= 0.8 || context.source === "verified_phone";

  if (collected.length < limit && shouldUseCountryWideFallback) {
    const selectionContext = buildSuggestedSelectionContext(context);
    const fallbackMatches = await listFallbackLocalNumbers({
      countryCode: context.countryCode,
      limit,
    });
    collected.push(
      ...fallbackMatches
        .map((number) =>
          toAvailableNumberSummary({
            number,
            kind: "local",
            selectionContext,
          }),
        )
        .filter((number): number is AvailableNumberSummary => number !== null),
    );
  }

  return dedupeNumbers(collected).slice(0, limit);
}

export async function getNumbersForSelectionContext(
  selectionContext: NumberSelectionContext,
  fallbackContext: NumberSuggestionContext,
  limit: number,
): Promise<Array<AvailableNumberSummary>> {
  if (selectionContext.mode === "suggested") {
    return await getSuggestedNumbers(
      {
        ...fallbackContext,
        countryCode: selectionContext.countryCode,
        ...(selectionContext.regionCode ? { regionCode: selectionContext.regionCode } : {}),
        ...(selectionContext.city ? { city: selectionContext.city } : {}),
        ...(selectionContext.metroKey ? { metroKey: selectionContext.metroKey } : {}),
      },
      limit,
    );
  }

  if (selectionContext.mode === "area_code") {
    const numbers = await listLocalNumbersByAreaCode({
      countryCode: selectionContext.countryCode,
      areaCode: selectionContext.areaCode ?? "",
      limit,
    });
    return numbers
      .map((number) =>
        toAvailableNumberSummary({
          number,
          kind: "local",
          selectionContext,
        }),
      )
      .filter((number): number is AvailableNumberSummary => number !== null);
  }

  if (selectionContext.mode === "city") {
    const numbers = await listLocalNumbersByLocation({
      countryCode: selectionContext.countryCode,
      ...(selectionContext.city ? { city: selectionContext.city } : {}),
      ...(selectionContext.regionCode ? { regionCode: selectionContext.regionCode } : {}),
      limit,
    });
    return numbers
      .map((number) =>
        toAvailableNumberSummary({
          number,
          kind: "local",
          selectionContext,
        }),
      )
      .filter((number): number is AvailableNumberSummary => number !== null);
  }

  const numbers = await listTollFreeNumbers({
    countryCode: selectionContext.countryCode,
    limit,
  });
  return numbers
    .map((number) =>
      toAvailableNumberSummary({
        number,
        kind: "toll_free",
        selectionContext,
      }),
    )
    .filter((number): number is AvailableNumberSummary => number !== null);
}

export function withClaimTokens(
  numbers: Array<AvailableNumberSummary>,
  input: {
    businessId: Id<"businesses">;
    userId: Id<"users">;
  },
): Array<AvailableNumberSummary> {
  return numbers.map((number) => ({
    ...number,
    claimToken: createNumberClaimToken({
      businessId: input.businessId,
      userId: input.userId,
      number,
    }),
  }));
}

export function buildNormalizedSelectionContext(input: {
  requestedSelectionContext: NumberSelectionContext;
  fallbackContext: NumberSuggestionContext;
}): NumberSelectionContext {
  const { requestedSelectionContext, fallbackContext } = input;
  const requestedCity = requestedSelectionContext.city?.trim();
  const requestedAreaCode = requestedSelectionContext.areaCode?.trim();
  const countryCode =
    normalizeSupportedCountryCode(requestedSelectionContext.countryCode) ??
    fallbackContext.countryCode;
  const shouldKeepSuggestedRegion =
    requestedSelectionContext.mode !== "city" ||
    !requestedCity ||
    (fallbackContext.city !== undefined &&
      normalizeComparableLocation(requestedCity) ===
        normalizeComparableLocation(fallbackContext.city));

  if (requestedSelectionContext.mode === "city") {
    return buildCitySelectionContext({
      countryCode,
      city: requestedCity || fallbackContext.city || "",
      ...(shouldKeepSuggestedRegion && fallbackContext.regionCode
        ? { regionCode: fallbackContext.regionCode }
        : {}),
    });
  }

  if (requestedSelectionContext.mode === "area_code") {
    if (!supportsTwilioAreaCodeSearch(countryCode)) {
      return buildSuggestedSelectionContext({
        countryCode,
        confidence: fallbackContext.confidence,
        source: fallbackContext.source,
      });
    }

    return buildAreaCodeSelectionContext({
      countryCode,
      areaCode: requestedAreaCode || "",
    });
  }

  if (requestedSelectionContext.mode === "toll_free") {
    return buildTollFreeSelectionContext({
      countryCode,
    });
  }

  return buildSuggestedSelectionContext({
    ...fallbackContext,
    countryCode,
  });
}

async function assertOnboardingAccess(
  ctx: ActionCtx,
  businessId: Id<"businesses">,
): Promise<{ userId: Id<"users"> }> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Authentication required.");
  }
  const authUserId = await getAuthUserId(ctx);

  return await ctx.runQuery(internal.businesses.catalog.assertCatalogWriteAccess, {
    businessId,
    authSubject: identity.subject,
    ...(authUserId ? { authUserId: String(authUserId) } : {}),
  });
}

async function requireBusinessCanUsePhoneNumberPicker(
  ctx: ActionCtx,
  businessId: Id<"businesses">,
): Promise<void> {
  const business = await ctx.runQuery(internal.businesses.admin.getBusinessById, {
    businessId,
  });
  if (!business) {
    throw new Error("Business not found.");
  }
  const stage = normalizeOnboardingStage(business.onboardingStage);
  if (
    ONBOARDING_STAGE_INDEX[stage] < ONBOARDING_STAGE_INDEX.phone_number ||
    stage === "phone_number_claiming" ||
    stage === "completed"
  ) {
    throw new Error("Phone-number onboarding is no longer available for this business.");
  }
}

async function resolveVerifiedSuggestionContext(
  ctx: ActionCtx,
  businessId: Id<"businesses">,
  userId: Id<"users">,
): Promise<{ market: VerifiedPhoneMarket; context: NumberSuggestionContext }> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Authentication required.");
  }
  const authUserId = await getAuthUserId(ctx);
  const user = await ctx.runQuery(internal.users.getAuthenticatedUserForBusiness, {
    businessId,
    authSubject: identity.subject,
    ...(authUserId ? { authUserId: String(authUserId) } : {}),
  });
  if (!user) {
    throw new Error("User profile not initialized.");
  }
  if (user._id !== userId) {
    throw new Error("User profile not initialized.");
  }

  if (!user.phone || !user.phoneVerificationTime) {
    throw new Error("Verify your mobile number before choosing a business number.");
  }

  const verificationAttempt = await ctx.runQuery(
    internal.onboarding.phoneVerificationState.getLatestVerificationAttempt,
    {
      businessId,
      userId: user._id,
    },
  );

  let market: VerifiedPhoneMarket;

  if (
    verificationAttempt &&
    verificationAttempt.status === "approved" &&
    verificationAttempt.phoneE164 === user.phone
  ) {
    market = resolveVerifiedPhoneMarket({
      phoneE164: verificationAttempt.phoneE164,
      countryCode: verificationAttempt.countryCode,
    });
  } else {
    const client = getTwilioClient();
    const lookup: TwilioLookupResult = await client.lookups.v2.phoneNumbers(user.phone).fetch();

    if (!lookup.valid) {
      throw new Error("Verify your mobile number before choosing a business number.");
    }

    market = resolveVerifiedPhoneMarket({
      phoneE164: lookup.phoneNumber,
      countryCode: lookup.countryCode,
    });
  }

  return {
    market,
    context: buildSuggestionContextFromVerifiedPhoneMarket(market),
  };
}

export const getInitialNumberSuggestion = action({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    const { userId } = await assertOnboardingAccess(ctx, args.businessId);
    await requireBusinessCanUsePhoneNumberPicker(ctx, args.businessId);
    await assertInitialSuggestionAllowed(ctx, {
      businessId: args.businessId,
      userId,
    });
    const { market, context } = await resolveVerifiedSuggestionContext(ctx, args.businessId, userId);
    const suggestions = withClaimTokens(await getSuggestedNumbers(context, 10), {
      businessId: args.businessId,
      userId,
    });

    return {
      market,
      suggestion: suggestions[0] ?? null,
      alternatives: suggestions.slice(1),
    };
  },
});

export const searchAvailableNumbers = action({
  args: {
    businessId: v.id("businesses"),
    mode: searchModeValidator,
    countryCode: v.optional(
      v.union(v.literal("US"), v.literal("CA"), v.literal("GB"), v.literal("AU")),
    ),
    city: v.optional(v.string()),
    areaCode: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { userId } = await assertOnboardingAccess(ctx, args.businessId);
    await requireBusinessCanUsePhoneNumberPicker(ctx, args.businessId);
    await assertInventorySearchAllowed(ctx, {
      businessId: args.businessId,
      userId,
    });
    const { market, context } = await resolveVerifiedSuggestionContext(ctx, args.businessId, userId);
    const searchCountryCode = args.countryCode ?? context.countryCode;
    const searchContext: NumberSuggestionContext =
      searchCountryCode === context.countryCode
        ? context
        : {
            countryCode: searchCountryCode,
            confidence: context.confidence,
            source: context.source,
          };
    const limit = normalizeInventorySearchLimit(args.limit);
    const selectionContext = buildNormalizedSelectionContext({
      requestedSelectionContext: {
        mode: args.mode,
        countryCode: searchContext.countryCode,
        ...(args.city !== undefined ? { city: args.city } : {}),
        ...(args.areaCode !== undefined ? { areaCode: args.areaCode } : {}),
      },
      fallbackContext: searchContext,
    });

    const numbers = withClaimTokens(
      await getNumbersForSelectionContext(selectionContext, searchContext, limit),
      {
        businessId: args.businessId,
        userId,
      },
    );
    return {
      market,
      selectionContext,
      numbers,
    };
  },
});

export const claimOnboardingNumber = action({
  args: {
    businessId: v.id("businesses"),
    e164: v.string(),
    selectionContext: numberSelectionContextValidator,
    claimToken: v.string(),
  },
  handler: async (ctx, args): Promise<ClaimNumberResult> => {
    const { userId } = await assertOnboardingAccess(ctx, args.businessId);
    let purchased: PurchasedIncomingNumber | null = null;
    let savedPhoneNumberId: Id<"phone_numbers"> | null = null;
    let claimEventId: Id<"onboarding_number_claim_events"> | null = null;
    let claimLocked = false;
    let restoreStage: "phone_number" | "plan" | "attribution" = "phone_number";
    const claimE164 = normalizeClaimE164(args.e164);
    if (!claimE164) {
      return {
        status: "failed" as const,
        message: "Invalid phone number.",
      };
    }
    const unavailableE164s = new Set<string>();

    try {
      const claimLock = await ctx.runMutation(internal.businesses.admin.beginOnboardingNumberClaim, {
        businessId: args.businessId,
      });
      if (
        claimLock.restoreStage === "phone_number" ||
        claimLock.restoreStage === "plan" ||
        claimLock.restoreStage === "attribution"
      ) {
        restoreStage = claimLock.restoreStage;
      }
      claimLocked = true;

      await assertClaimAttemptAllowed(ctx, {
        businessId: args.businessId,
        userId,
      });
      verifyNumberClaimToken({
        token: args.claimToken,
        businessId: args.businessId,
        userId,
        claimE164,
        selectionContext: args.selectionContext,
      });
      claimEventId = await ctx.runMutation(internal.onboarding.abuse.reserveSuccessfulClaimEvent, {
        businessId: args.businessId,
        userId,
        reservedAt: Date.now(),
      });

      const smsWebhookUrl = buildTwilioSmsInboundWebhookUrl();
      const voiceWebhookUrl = buildTwilioVoiceInboundWebhookUrl();
      const voiceStatusCallbackUrl = buildTwilioVoiceStatusCallbackUrl();
      const client = getTwilioClient();

      try {
        purchased = await client.incomingPhoneNumbers.create({
          friendlyName: `business:${String(args.businessId)}`,
          phoneNumber: claimE164,
          smsMethod: "POST",
          smsUrl: smsWebhookUrl,
          statusCallback: voiceStatusCallbackUrl,
          statusCallbackMethod: "POST",
          voiceMethod: "POST",
          voiceUrl: voiceWebhookUrl,
        });
      } catch (purchaseError) {
        if (isLikelyNumberUnavailableError(purchaseError)) {
          unavailableE164s.add(claimE164);
        }
        throw purchaseError;
      }

      const saved: { phoneNumberId: Id<"phone_numbers"> } = await ctx.runMutation(
        internal.businesses.catalog.upsertPhoneNumberInternal,
        {
          businessId: args.businessId,
          e164: claimE164,
          twilioPhoneSid: purchased.sid,
          voiceEnabled: true,
          smsEnabled: true,
          status: "active",
        },
      );
      savedPhoneNumberId = saved.phoneNumberId;

      const now = new Date().toISOString();
      await ctx.runMutation(internal.businesses.catalog.recordPhoneNumberWebhookSync, {
        phoneNumberId: saved.phoneNumberId,
        voiceWebhookStatus: "synced",
        voiceWebhookTargetUrl: purchased.voiceUrl ?? voiceWebhookUrl,
        voiceWebhookLastSyncedAt: now,
        smsWebhookStatus: "synced",
        smsWebhookTargetUrl: purchased.smsUrl ?? smsWebhookUrl,
        smsWebhookLastSyncedAt: now,
      });
      await ctx.runMutation(internal.onboarding.abuse.finalizeSuccessfulClaimEvent, {
        claimEventId,
        phoneNumberId: saved.phoneNumberId,
        twilioPhoneSid: purchased.sid,
        purchasedAt: Date.now(),
      });
      // Advance to the plan-selection step. Phone provisioning is now
      // followed by plan + attribution before onboarding completes.
      await ctx.runMutation(internal.businesses.admin.advanceOnboardingStage, {
        businessId: args.businessId,
        onboardingStage: restoreStage === "attribution" ? "attribution" : "plan",
      });
      recordSuccessfulPurchaseLog({
        businessId: args.businessId,
        userId,
        phoneE164: claimE164,
      });

      return {
        status: "claimed" as const,
        phoneNumberId: saved.phoneNumberId,
        e164: claimE164,
      };
    } catch (error) {
      let cleanupError: Error | null = null;
      if (claimEventId) {
        try {
          await ctx.runMutation(internal.onboarding.abuse.deleteSuccessfulClaimEvent, {
            claimEventId,
          });
        } catch (rollbackError) {
          cleanupError =
            rollbackError instanceof Error
              ? rollbackError
              : new Error("Automatic rollback of the local claim event failed.");
        }
      }
      if (savedPhoneNumberId) {
        try {
          await ctx.runMutation(internal.businesses.catalog.deletePhoneNumberInternal, {
            phoneNumberId: savedPhoneNumberId,
          });
        } catch (rollbackError) {
          cleanupError =
            rollbackError instanceof Error
              ? rollbackError
              : new Error("Automatic rollback of the local phone number record failed.");
        }
      }
      if (claimLocked) {
        try {
          await ctx.runMutation(internal.businesses.admin.releaseOnboardingNumberClaim, {
            businessId: args.businessId,
            restoreStage,
          });
        } catch (releaseClaimError) {
          cleanupError =
            releaseClaimError instanceof Error
              ? releaseClaimError
              : new Error("Automatic release of the onboarding claim lock failed.");
        }
      }
      if (purchased) {
        const client = getTwilioClient();
        try {
          await client.incomingPhoneNumbers(purchased.sid).remove();
        } catch (releaseError) {
          cleanupError =
            releaseError instanceof Error
              ? releaseError
              : new Error("Automatic cleanup of the purchased Twilio number failed.");
        }
      }

      if (!purchased && isLikelyNumberUnavailableError(error)) {
        try {
          await recordFailedClaimAttempt(ctx, {
            businessId: args.businessId,
            userId,
          });
        } catch (rateLimitError) {
          return {
            status: "failed" as const,
            message:
              rateLimitError instanceof Error
                ? rateLimitError.message
                : "Number provisioning limit reached for now. Contact support if you need more businesses today.",
          };
        }

        let alternatives: Array<AvailableNumberSummary> = [];
        try {
          const { context } = await resolveVerifiedSuggestionContext(ctx, args.businessId, userId);
          const countryCode =
            normalizeSupportedCountryCode(args.selectionContext.countryCode) ??
            context.countryCode;
          const searchContext: NumberSuggestionContext = {
            ...context,
            countryCode,
          };
          const selectionContext = buildNormalizedSelectionContext({
            requestedSelectionContext: args.selectionContext,
            fallbackContext: searchContext,
          });
          alternatives = withClaimTokens(
            (
              await getNumbersForSelectionContext(selectionContext, searchContext, 10)
            ).filter((number) => number.e164 !== claimE164 && !unavailableE164s.has(number.e164)),
            {
              businessId: args.businessId,
              userId,
            },
          );
        } catch {
          alternatives = [];
        }

        return {
          status: "unavailable" as const,
          message: "The selected phone number is no longer available.",
          alternatives,
        };
      }

      if (!purchased) {
        try {
          await recordFailedClaimAttempt(ctx, {
            businessId: args.businessId,
            userId,
          });
        } catch (rateLimitError) {
          return {
            status: "failed" as const,
            message:
              rateLimitError instanceof Error
                ? rateLimitError.message
                : "Number provisioning limit reached for now. Contact support if you need more businesses today.",
          };
        }
      }

      return {
        status: "failed" as const,
        message:
          error instanceof Error
            ? cleanupError
              ? `${getPurchaseFailureMessage(error) ?? error.message} Automatic cleanup of the purchased Twilio number also failed.`
              : (getPurchaseFailureMessage(error) ?? error.message)
            : cleanupError
              ? "We couldn't provision the selected phone number, and automatic Twilio cleanup also failed."
              : "We couldn't provision the selected phone number.",
      };
    }
  },
});
