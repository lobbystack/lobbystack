"use node";

import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";

import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import {
  buildNormalizedSelectionContext,
  getNumbersForSelectionContext,
  getSuggestedNumbers,
  normalizeClaimE164,
  normalizeSupportedCountryCode,
  verifyNumberClaimToken,
  withClaimTokens,
} from "../onboarding/phoneNumbers";
import {
  buildSuggestionContextFromVerifiedPhoneMarket,
  numberSelectionContextValidator,
  resolveVerifiedPhoneMarket,
  searchModeValidator,
  type AvailableNumberSummary,
  type NumberSuggestionContext,
  type VerifiedPhoneMarket,
} from "../lib/onboardingPhoneNumbers";
import { getTwilioClient } from "../lib/node/twilioClient";
import {
  buildTwilioSmsInboundWebhookUrl,
  buildTwilioVoiceInboundWebhookUrl,
  buildTwilioVoiceStatusCallbackUrl,
} from "../lib/twilioUrls";
import { observedAction as action } from "../telemetry/observedFunctions";

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

type TwilioIncomingPhoneNumberResource = {
  remove: () => Promise<unknown>;
  update: (params: {
    emergencyAddressSid?: string;
    emergencyStatus?: "Active" | "Inactive";
  }) => Promise<unknown>;
};

type ReplacementClaimResult =
  | { status: "claimed"; phoneNumberId: Id<"phone_numbers">; e164: string }
  | { status: "unavailable"; message: string; alternatives: Array<AvailableNumberSummary> }
  | { status: "failed"; message: string };

const PHONE_NUMBER_CHANGE_USED_MESSAGE =
  "This business has already used its phone number change.";

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

function isEmergencyAddressReleaseError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes("emergency address") &&
    (message.includes("remove") || message.includes("delete") || message.includes("release"))
  );
}

export async function releaseTwilioIncomingPhoneNumber(
  incomingPhoneNumber: TwilioIncomingPhoneNumberResource,
): Promise<void> {
  try {
    await incomingPhoneNumber.remove();
    return;
  } catch (error) {
    if (!isEmergencyAddressReleaseError(error)) {
      throw error;
    }
  }

  await incomingPhoneNumber.update({
    emergencyAddressSid: "",
    emergencyStatus: "Inactive",
  });
  await incomingPhoneNumber.remove();
}

async function assertPhoneNumberSettingsAccess(
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

async function resolveCurrentNumberSuggestionContext(
  ctx: ActionCtx,
  businessId: Id<"businesses">,
): Promise<{
  currentPhoneNumber: Doc<"phone_numbers">;
  market: VerifiedPhoneMarket;
  context: NumberSuggestionContext;
}> {
  const currentPhoneNumber = await ctx.runQuery(
    internal.businesses.catalog.getPrimaryPhoneNumberInternal,
    {
      businessId,
    },
  );
  if (!currentPhoneNumber) {
    throw new Error("Add a phone number before changing it.");
  }

  const client = getTwilioClient();
  const lookup: TwilioLookupResult = await client.lookups.v2
    .phoneNumbers(currentPhoneNumber.e164)
    .fetch();
  if (!lookup.valid) {
    throw new Error("We couldn't look up the current phone number market.");
  }

  const market = resolveVerifiedPhoneMarket({
    phoneE164: lookup.phoneNumber,
    countryCode: lookup.countryCode,
  });

  return {
    currentPhoneNumber,
    market,
    context: buildSuggestionContextFromVerifiedPhoneMarket(market),
  };
}

async function assertPhoneNumberReplacementAvailable(
  ctx: ActionCtx,
  businessId: Id<"businesses">,
): Promise<void> {
  const business = await ctx.runQuery(internal.businesses.admin.getBusinessById, {
    businessId,
  });
  if (!business) {
    throw new Error("Business not found.");
  }
  if (business.phoneNumberReplacementUsedAt) {
    throw new Error(PHONE_NUMBER_CHANGE_USED_MESSAGE);
  }
}

export const getInitialReplacementNumberSuggestion = action({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    const { userId } = await assertPhoneNumberSettingsAccess(ctx, args.businessId);
    await assertPhoneNumberReplacementAvailable(ctx, args.businessId);
    const { market, context, currentPhoneNumber } = await resolveCurrentNumberSuggestionContext(
      ctx,
      args.businessId,
    );
    const suggestions = withClaimTokens(await getSuggestedNumbers(context, 10), {
      businessId: args.businessId,
      userId,
    }).filter((number) => number.e164 !== currentPhoneNumber.e164);

    return {
      market,
      suggestion: suggestions[0] ?? null,
      alternatives: suggestions.slice(1),
    };
  },
});

export const searchReplacementNumbers = action({
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
    const { userId } = await assertPhoneNumberSettingsAccess(ctx, args.businessId);
    await assertPhoneNumberReplacementAvailable(ctx, args.businessId);
    const { market, context, currentPhoneNumber } = await resolveCurrentNumberSuggestionContext(
      ctx,
      args.businessId,
    );
    const searchCountryCode = args.countryCode ?? context.countryCode;
    const searchContext: NumberSuggestionContext =
      searchCountryCode === context.countryCode
        ? context
        : {
            countryCode: searchCountryCode,
            confidence: context.confidence,
            source: context.source,
          };
    const limit = Math.max(1, Math.min(Math.floor(args.limit ?? 10), 20));
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
    ).filter((number) => number.e164 !== currentPhoneNumber.e164);

    return {
      market,
      selectionContext,
      numbers,
    };
  },
});

export const claimReplacementNumber = action({
  args: {
    businessId: v.id("businesses"),
    e164: v.string(),
    selectionContext: numberSelectionContextValidator,
    claimToken: v.string(),
  },
  handler: async (ctx, args): Promise<ReplacementClaimResult> => {
    const { userId } = await assertPhoneNumberSettingsAccess(ctx, args.businessId);
    const currentPhoneNumber = await ctx.runQuery(
      internal.businesses.catalog.getPrimaryPhoneNumberInternal,
      {
        businessId: args.businessId,
      },
    );
    if (!currentPhoneNumber) {
      return {
        status: "failed",
        message: "Add a phone number before changing it.",
      };
    }

    let purchased: PurchasedIncomingNumber | null = null;
    let savedPhoneNumberId: Id<"phone_numbers"> | null = null;
    let oldNumberMarkedInactive = false;
    let replacementReserved = false;
    const claimE164 = normalizeClaimE164(args.e164);
    if (!claimE164 || claimE164 === currentPhoneNumber.e164) {
      return {
        status: "failed",
        message: "Invalid phone number.",
      };
    }

    try {
      verifyNumberClaimToken({
        token: args.claimToken,
        businessId: args.businessId,
        userId,
        claimE164,
        selectionContext: args.selectionContext,
      });
      await ctx.runMutation(internal.businesses.admin.reservePhoneNumberReplacement, {
        businessId: args.businessId,
      });
      replacementReserved = true;

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

      await ctx.runMutation(internal.businesses.catalog.upsertPhoneNumberInternal, {
        businessId: args.businessId,
        phoneNumberId: currentPhoneNumber._id,
        e164: currentPhoneNumber.e164,
        twilioPhoneSid: null,
        voiceEnabled: currentPhoneNumber.voiceEnabled,
        smsEnabled: currentPhoneNumber.smsEnabled,
        status: "inactive",
      });
      oldNumberMarkedInactive = true;

      if (currentPhoneNumber.twilioPhoneSid) {
        await releaseTwilioIncomingPhoneNumber(
          client.incomingPhoneNumbers(currentPhoneNumber.twilioPhoneSid),
        );
      }
      await ctx.runMutation(internal.businesses.admin.markPhoneNumberReplacementUsed, {
        businessId: args.businessId,
      });
      replacementReserved = false;

      return {
        status: "claimed",
        phoneNumberId: saved.phoneNumberId,
        e164: claimE164,
      };
    } catch (error) {
      let cleanupError: Error | null = null;
      if (oldNumberMarkedInactive) {
        try {
          await ctx.runMutation(internal.businesses.catalog.upsertPhoneNumberInternal, {
            businessId: args.businessId,
            phoneNumberId: currentPhoneNumber._id,
            e164: currentPhoneNumber.e164,
            twilioPhoneSid: currentPhoneNumber.twilioPhoneSid ?? null,
            voiceEnabled: currentPhoneNumber.voiceEnabled,
            smsEnabled: currentPhoneNumber.smsEnabled,
            status: currentPhoneNumber.status,
          });
        } catch (rollbackError) {
          cleanupError =
            rollbackError instanceof Error
              ? rollbackError
              : new Error("Automatic rollback of the previous phone number failed.");
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
              : new Error("Automatic rollback of the new phone number failed.");
        }
      }
      if (purchased) {
        const client = getTwilioClient();
        try {
          await releaseTwilioIncomingPhoneNumber(client.incomingPhoneNumbers(purchased.sid));
        } catch (releaseError) {
          cleanupError =
            releaseError instanceof Error
              ? releaseError
              : new Error("Automatic cleanup of the purchased Twilio number failed.");
        }
      }
      if (replacementReserved) {
        try {
          await ctx.runMutation(internal.businesses.admin.releasePhoneNumberReplacementReservation, {
            businessId: args.businessId,
          });
        } catch (releaseReservationError) {
          cleanupError =
            releaseReservationError instanceof Error
              ? releaseReservationError
              : new Error("Automatic release of the phone number change reservation failed.");
        }
      }

      if (!purchased && isLikelyNumberUnavailableError(error)) {
        let alternatives: Array<AvailableNumberSummary> = [];
        try {
          const { context } = await resolveCurrentNumberSuggestionContext(ctx, args.businessId);
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
            ).filter(
              (number) => number.e164 !== claimE164 && number.e164 !== currentPhoneNumber.e164,
            ),
            {
              businessId: args.businessId,
              userId,
            },
          );
        } catch {
          alternatives = [];
        }

        return {
          status: "unavailable",
          message: "The selected phone number is no longer available.",
          alternatives,
        };
      }

      return {
        status: "failed",
        message:
          error instanceof Error
            ? cleanupError
              ? `${getPurchaseFailureMessage(error) ?? error.message} Automatic cleanup also failed.`
              : (getPurchaseFailureMessage(error) ?? error.message)
            : cleanupError
              ? "We couldn't replace the phone number, and automatic cleanup also failed."
              : "We couldn't replace the phone number.",
      };
    }
  },
});
