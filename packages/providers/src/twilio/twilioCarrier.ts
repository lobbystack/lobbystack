import { permanentSmsErrorCode } from "@lobbystack/shared";

import { alertSmsFrom, appBaseUrl } from "../telephony/config";
import type { AlertSmsSender, CallCostLookup, CarrierAdapters, NumberInventory, NumberRouting, PhoneVerifier, LineTypeLookup, SmsSender, SmsStatusCallbackIds } from "../telephony/types";
import { twilioConfigured, twilioRegistration, twilioRegulatoryDocuments } from "./registration";
import { getTwilioProviderErrorCode, TwilioProvider } from "./twilioProvider";

type Env = Record<string, string | undefined>;

/** TWILIO_STATUS_CALLBACK_URL with the row ids a status callback updates, or undefined when it isn't set. */
export function twilioStatusCallbackUrl(ids: SmsStatusCallbackIds, env: Env = process.env): string | undefined {
  const configured = env.TWILIO_STATUS_CALLBACK_URL;
  if (!configured) return undefined;
  try {
    const url = new URL(configured);
    for (const [key, value] of Object.entries(ids)) if (value) url.searchParams.set(key, value);
    return url.toString();
  } catch {
    return configured;
  }
}

function sipTrunkSid(env: Env, purpose: string): string {
  const trunkSid = env.TWILIO_SIP_TRUNK_SID?.trim();
  // A number off the trunk has nothing to answer it.
  if (!trunkSid) throw new Error(`TWILIO_SIP_TRUNK_SID is required to ${purpose}. See docs/voice/runtime.md.`);
  return trunkSid;
}

function smsSender(provider: TwilioProvider, env: Env): SmsSender {
  return {
    carrier: "twilio",
    sendSms: (input) => provider.sendSms(input),
    statusCallbackUrl: (ids) => twilioStatusCallbackUrl(ids, env),
    getMessagePricing: (input) => provider.getMessagePricing(input),
    permanentErrorCode: permanentSmsErrorCode,
  };
}

/**
 * The Twilio account in TWILIO_ACCOUNT_SID, behind the telephony interfaces.
 * Numbers join the Elastic SIP trunk in TWILIO_SIP_TRUNK_SID, and come off
 * it onto /api/webhooks/twilio/voice for the fallback. Undefined without
 * credentials.
 */
export function createTwilioCarrier(env: Env = process.env, provider?: TwilioProvider): CarrierAdapters | undefined {
  if (!provider && !twilioConfigured(env)) return undefined;
  const twilio = provider ?? new TwilioProvider({ accountSid: env.TWILIO_ACCOUNT_SID!.trim(), authToken: env.TWILIO_AUTH_TOKEN!.trim() });
  const webhook = (path: string) => `${appBaseUrl(env)}/api/webhooks/twilio/${path}`;
  const inventory: NumberInventory = {
    carrier: "twilio",
    listAvailablePhoneNumbers: (input) => twilio.listAvailablePhoneNumbers(input),
    getPhoneNumberMonthlyPrice: (input) => twilio.getPhoneNumberMonthlyPrice(input),
    findOwnedPhoneNumber: (input) => twilio.findOwnedPhoneNumber(input),
    purchasePhoneNumber: async (input) => {
      const missing = twilioRegistration(input.countryCode, env)?.missing[0];
      if (missing) throw new Error(`${missing} is required to buy a number in ${input.countryCode.toUpperCase()}. See docs/voice/runtime.md.`);
      return await twilio.purchasePhoneNumber({ e164: input.e164, friendlyName: input.label, smsUrl: webhook("sms"), statusCallbackUrl: webhook("status"), ...twilioRegulatoryDocuments(input.countryCode, env) });
    },
    releasePhoneNumber: (input) => twilio.releasePhoneNumber(input),
    isNumberUnavailableError: (error) => getTwilioProviderErrorCode(error) === 21422,
  };
  const routing: NumberRouting = {
    carrier: "twilio",
    // A refused call fails over to the trunk's disaster recovery URL, /api/webhooks/twilio/voice.
    forwardsRefusedCalls: false,
    missingSetup: () => env.TWILIO_SIP_TRUNK_SID?.trim() ? undefined : "TWILIO_SIP_TRUNK_SID is required to provision a phone number. See docs/voice/runtime.md.",
    routeNumber: async (input) => {
      const trunkSid = sipTrunkSid(env, input.mode === "receptionist" ? "route calls to the receptionist" : "route a phone number");
      if (input.mode === "receptionist") {
        await twilio.addNumberToSipTrunk({ trunkSid, providerPhoneId: input.providerPhoneId });
        return { target: `sip-trunk:${trunkSid}` };
      }
      const fallbackUrl = webhook("voice");
      await twilio.routeNumber({ providerPhoneId: input.providerPhoneId, trunkSid, mode: "fallback", fallbackUrl });
      return { target: fallbackUrl };
    },
  };
  const verifyServiceSid = env.TWILIO_VERIFY_SERVICE_SID?.trim();
  const verifier: PhoneVerifier | undefined = verifyServiceSid ? {
    carrier: "twilio",
    sendCode: async ({ to, locale }) => ({ sid: (await twilio.verifyPhone({ to, serviceSid: verifyServiceSid, ...(locale ? { locale } : {}) })).verificationSid }),
    checkCode: ({ to, code }) => twilio.checkPhoneVerification({ to, code, serviceSid: verifyServiceSid }),
  } : undefined;
  const lineTypes: LineTypeLookup = { carrier: "twilio", lookupLineType: (phone) => twilio.lookupLineType(phone) };
  const trunkSid = env.TWILIO_SIP_TRUNK_SID?.trim();
  const callCost: CallCostLookup = {
    carrier: "twilio",
    // Without the trunk there's no telling which trunk call was ours, so GPT-Live calls go unpriced.
    ...(trunkSid ? {
      findLiveCallCost: async ({ from, near }: { from: string; near: Date }) => {
        const providerCallId = await twilio.findTrunkCall({ trunkSid, from, near });
        return providerCallId ? { providerCallId, ...await twilio.getCallPricing({ providerCallId }) } : undefined;
      },
    } : {}),
    getCallPricing: (input) => twilio.getCallPricing(input),
  };
  return { carrier: "twilio", inventory, routing, sms: smsSender(twilio, env), ...(verifier ? { verifier } : {}), lineTypes, callCost };
}

/**
 * The account that owns the shared sender, through a REST key restricted to
 * sending texts. It sends only from the shared sender.
 */
export function createTwilioAlertSms(env: Env = process.env): AlertSmsSender | undefined {
  const accountSid = env.TWILIO_ALERT_ACCOUNT_SID;
  const apiKeySid = env.TWILIO_ALERT_API_KEY_SID;
  const apiKeySecret = env.TWILIO_ALERT_API_KEY_SECRET;
  const from = alertSmsFrom(env);
  if (!accountSid || !apiKeySid || !apiKeySecret || !from) return undefined;
  const provider = new TwilioProvider({ accountSid, apiKeySid, apiKeySecret });
  return {
    ...smsSender(provider, env),
    from,
    sendSms: (input) => {
      if (input.from !== from) throw new Error("Restricted alert provider cannot use another sender.");
      return provider.sendSms(input);
    },
  };
}
