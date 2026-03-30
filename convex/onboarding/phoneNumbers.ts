"use node";

import { v } from "convex/values";

import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { action, type ActionCtx } from "../_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import {
  type AvailableNumberSummary,
  availableNumberSummaryValidator,
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
} from "../lib/twilioUrls";

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

function isLikelyNumberUnavailableError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes("already taken") ||
    message.includes("no longer available") ||
    message.includes("not available") ||
    message.includes("unavailable") ||
    message.includes("not currently available")
  );
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

function toAvailableNumberSummary(input: {
  number: TwilioAvailableNumber;
  kind: AvailableNumberSummary["kind"];
  selectionContext: NumberSelectionContext;
}): AvailableNumberSummary | null {
  const e164 = input.number.phoneNumber?.trim();
  if (!e164) {
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

async function getSuggestedNumbers(
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

async function getNumbersForSelectionContext(
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

async function assertOnboardingAccess(ctx: ActionCtx, businessId: Id<"businesses">): Promise<void> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Authentication required.");
  }
  const authUserId = await getAuthUserId(ctx);

  await ctx.runQuery(internal.businesses.catalog.assertCatalogWriteAccess, {
    businessId,
    authSubject: identity.subject,
    ...(authUserId ? { authUserId: String(authUserId) } : {}),
  });
}

async function resolveVerifiedSuggestionContext(
  ctx: ActionCtx,
  businessId: Id<"businesses">,
): Promise<{ market: VerifiedPhoneMarket; context: NumberSuggestionContext }> {
  const user = await ctx.runQuery(api.users.current, {});
  if (!user) {
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
    await assertOnboardingAccess(ctx, args.businessId);
    const { market, context } = await resolveVerifiedSuggestionContext(ctx, args.businessId);
    const suggestions = await getSuggestedNumbers(context, 10);

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
    city: v.optional(v.string()),
    areaCode: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await assertOnboardingAccess(ctx, args.businessId);
    const { market, context } = await resolveVerifiedSuggestionContext(ctx, args.businessId);
    const limit = args.limit ?? 10;
    const requestedCity = args.city?.trim();
    const shouldKeepSuggestedRegion =
      !requestedCity ||
      (context.city !== undefined &&
        normalizeComparableLocation(requestedCity) ===
          normalizeComparableLocation(context.city));

    const selectionContext =
      args.mode === "city"
        ? buildCitySelectionContext({
            countryCode: context.countryCode,
            city: requestedCity || context.city || "",
            ...(shouldKeepSuggestedRegion && context.regionCode
              ? { regionCode: context.regionCode }
              : {}),
          })
        : args.mode === "area_code"
          ? buildAreaCodeSelectionContext({
              countryCode: context.countryCode,
              areaCode: args.areaCode?.trim() || "",
            })
          : args.mode === "toll_free"
            ? buildTollFreeSelectionContext({
                countryCode: context.countryCode,
              })
            : buildSuggestedSelectionContext(context);

    const numbers = await getNumbersForSelectionContext(selectionContext, context, limit);
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
  },
  handler: async (ctx, args): Promise<ClaimNumberResult> => {
    await assertOnboardingAccess(ctx, args.businessId);
    const { context } = await resolveVerifiedSuggestionContext(ctx, args.businessId);

    const business = await ctx.runQuery(internal.businesses.admin.getBusinessById, {
      businessId: args.businessId,
    });
    if (!business) {
      throw new Error("Business not found.");
    }
    if (business.onboardingStage !== "phone_number") {
      throw new Error("Phone-number onboarding has already been completed for this business.");
    }

    const smsWebhookUrl = buildTwilioSmsInboundWebhookUrl();
    const voiceWebhookUrl = buildTwilioVoiceInboundWebhookUrl();
    const client = getTwilioClient();
    let purchased: PurchasedIncomingNumber | null = null;
    let savedPhoneNumberId: Id<"phone_numbers"> | null = null;

    try {
      purchased = await client.incomingPhoneNumbers.create({
        friendlyName: `business:${String(args.businessId)}`,
        phoneNumber: args.e164,
        smsMethod: "POST",
        smsUrl: smsWebhookUrl,
        voiceMethod: "POST",
        voiceUrl: voiceWebhookUrl,
      });

      const saved: { phoneNumberId: Id<"phone_numbers"> } = await ctx.runMutation(
        internal.businesses.catalog.upsertPhoneNumberInternal,
        {
          businessId: args.businessId,
          e164: args.e164,
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
      await ctx.runMutation(internal.businesses.admin.setOnboardingStage, {
        businessId: args.businessId,
        onboardingStage: "completed",
      });

      return {
        status: "claimed" as const,
        phoneNumberId: saved.phoneNumberId,
        e164: args.e164,
      };
    } catch (error) {
      let cleanupError: Error | null = null;
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
      if (purchased) {
        try {
          await client.incomingPhoneNumbers(purchased.sid).remove();
        } catch (releaseError) {
          cleanupError =
            releaseError instanceof Error
              ? releaseError
              : new Error("Automatic cleanup of the purchased Twilio number failed.");
        }
      }

      const alternatives = await getNumbersForSelectionContext(
        args.selectionContext,
        context,
        10,
      );
      const selectedStillListed = alternatives.some((number) => number.e164 === args.e164);

      if (!purchased && !selectedStillListed && isLikelyNumberUnavailableError(error)) {
        return {
          status: "unavailable" as const,
          message: "The selected phone number is no longer available.",
          alternatives,
        };
      }

      return {
        status: "failed" as const,
        message:
          error instanceof Error
            ? cleanupError
              ? `${error.message} Automatic cleanup of the purchased Twilio number also failed.`
              : error.message
            : cleanupError
              ? "We couldn't provision the selected phone number, and automatic Twilio cleanup also failed."
              : "We couldn't provision the selected phone number.",
      };
    }
  },
});
