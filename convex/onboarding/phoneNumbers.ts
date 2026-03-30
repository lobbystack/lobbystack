"use node";

import { v } from "convex/values";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { action, type ActionCtx } from "../_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import {
  type AvailableNumberSummary,
  availableNumberSummaryValidator,
  buildAreaCodeSelectionContext,
  buildCitySelectionContext,
  buildSuggestedSelectionContext,
  buildTollFreeSelectionContext,
  getMetroAreaCodePriority,
  numberSelectionContextValidator,
  numberSuggestionContextValidator,
  searchModeValidator,
  type NumberSelectionContext,
  type NumberSuggestionContext,
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
  const client = getTwilioClient();
  return await getTwilioLocalCollection(client, input.countryCode).list({
    areaCode: Number.parseInt(input.areaCode, 10),
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

  if (collected.length < limit && (context.city || context.regionCode || context.postalCode)) {
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
    Boolean(context.metroKey) ||
    Boolean(context.regionCode) ||
    Boolean(context.city) ||
    Boolean(context.postalCode) ||
    context.confidence >= 0.6;

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

export const getInitialNumberSuggestion = action({
  args: {
    businessId: v.id("businesses"),
    context: numberSuggestionContextValidator,
  },
  handler: async (ctx, args) => {
    await assertOnboardingAccess(ctx, args.businessId);
    const suggestions = await getSuggestedNumbers(args.context, 10);

    return {
      context: args.context,
      suggestion: suggestions[0] ?? null,
      alternatives: suggestions.slice(1),
    };
  },
});

export const searchAvailableNumbers = action({
  args: {
    businessId: v.id("businesses"),
    context: numberSuggestionContextValidator,
    mode: searchModeValidator,
    city: v.optional(v.string()),
    areaCode: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await assertOnboardingAccess(ctx, args.businessId);
    const limit = args.limit ?? 10;

    const selectionContext =
      args.mode === "city"
        ? buildCitySelectionContext({
            countryCode: args.context.countryCode,
            city: args.city?.trim() || args.context.city || "",
            ...(args.context.regionCode ? { regionCode: args.context.regionCode } : {}),
          })
        : args.mode === "area_code"
          ? buildAreaCodeSelectionContext({
              countryCode: args.context.countryCode,
              areaCode: args.areaCode?.trim() || "",
            })
          : args.mode === "toll_free"
            ? buildTollFreeSelectionContext({
                countryCode: args.context.countryCode,
              })
            : buildSuggestedSelectionContext(args.context);

    const numbers = await getNumbersForSelectionContext(selectionContext, args.context, limit);
    return {
      context: args.context,
      selectionContext,
      numbers,
    };
  },
});

export const claimOnboardingNumber = action({
  args: {
    businessId: v.id("businesses"),
    context: numberSuggestionContextValidator,
    e164: v.string(),
    selectionContext: numberSelectionContextValidator,
  },
  handler: async (ctx, args): Promise<ClaimNumberResult> => {
    await assertOnboardingAccess(ctx, args.businessId);

    const business = await ctx.runQuery(internal.businesses.admin.getBusinessById, {
      businessId: args.businessId,
    });
    if (!business) {
      throw new Error("Business not found.");
    }

    const smsWebhookUrl = buildTwilioSmsInboundWebhookUrl();
    const voiceWebhookUrl = buildTwilioVoiceInboundWebhookUrl();
    const client = getTwilioClient();

    try {
      const purchased: PurchasedIncomingNumber = await client.incomingPhoneNumbers.create({
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
      const alternatives = await getNumbersForSelectionContext(
        args.selectionContext,
        args.context,
        10,
      );
      const selectedStillListed = alternatives.some((number) => number.e164 === args.e164);

      if (!selectedStillListed) {
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
            ? error.message
            : "We couldn't provision the selected phone number.",
      };
    }
  },
});
