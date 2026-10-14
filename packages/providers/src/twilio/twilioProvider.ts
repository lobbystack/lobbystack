import twilio from "twilio";

import { assertCertificationRecipient, assertCertificationOperationAllowed } from "@lobbystack/shared";

export type TwilioProviderConfig = {
  accountSid: string;
} & ({ authToken: string; apiKeySid?: never; apiKeySecret?: never } | { authToken?: never; apiKeySid: string; apiKeySecret: string });

export type TwilioMessagePricing = {
  providerUpdatedAt?: string;
  providerPrice?: number;
  providerPriceUnit?: string;
  providerCostUsd?: number;
  providerNumSegments?: number;
};

export type TwilioCallPricing = {
  providerUpdatedAt?: string;
  providerPrice?: number;
  providerPriceUnit?: string;
  providerCostUsd?: number;
};

export type AvailablePhoneNumber = {
  phoneE164: string;
  locality?: string;
  region?: string;
  countryCode: string;
  capabilities: { sms: boolean; voice: boolean };
};

export type TwilioProviderErrorCode = 21404 | 21422;

export function getTwilioProviderErrorCode(error: unknown): TwilioProviderErrorCode | undefined {
  if (!error || typeof error !== "object" || !("code" in error)) return undefined;
  const code = Number((error as { code?: unknown }).code);
  return code === 21404 || code === 21422 ? code : undefined;
}

function isEmergencyAddressReleaseError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return message.includes("emergency address") && (message.includes("remove") || message.includes("delete") || message.includes("release"));
}

function finiteNumber(value: string | null | undefined): number | undefined {
  if (value === null || value === undefined || value.trim() === "") return undefined;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizedUnit(value: string | null | undefined): string | undefined {
  const normalized = value?.trim().toLowerCase();
  return normalized ? normalized : undefined;
}

export class TwilioProvider {
  private readonly client: ReturnType<typeof twilio>;

  constructor(config: TwilioProviderConfig) {
    this.client = config.apiKeySid
      ? twilio(config.apiKeySid, config.apiKeySecret, { accountSid: config.accountSid })
      : twilio(config.accountSid, config.authToken);
  }

  async sendSms(input: { to: string; from: string; body: string; statusCallback?: string }): Promise<{ providerMessageId: string }> {
    assertCertificationRecipient("phone", input.to);
    const message = await this.client.messages.create({ to: input.to, from: input.from, body: input.body, ...(input.statusCallback ? { statusCallback: input.statusCallback } : {}) });
    return { providerMessageId: message.sid };
  }

  async getMessagePricing(input: { providerMessageId: string }): Promise<TwilioMessagePricing> {
    const message = await this.client.messages(input.providerMessageId).fetch();
    const providerPrice = finiteNumber(message.price);
    const providerPriceUnit = normalizedUnit(message.priceUnit);
    const providerNumSegments = finiteNumber(message.numSegments);
    return {
      ...(message.dateUpdated ? { providerUpdatedAt: message.dateUpdated.toISOString() } : {}),
      ...(providerPrice !== undefined ? { providerPrice } : {}),
      ...(providerPriceUnit !== undefined ? { providerPriceUnit } : {}),
      ...(providerPrice !== undefined && providerPriceUnit === "usd" ? { providerCostUsd: Math.abs(providerPrice) } : {}),
      ...(providerNumSegments !== undefined ? { providerNumSegments: Math.max(0, Math.trunc(providerNumSegments)) } : {}),
    };
  }

  /**
   * Finds the Twilio call behind a call that reached GPT-Live over the SIP
   * trunk. Twilio records that leg as `trunking-originating`, addressed to the
   * OpenAI SIP URI rather than the dialled number, so match the caller, the
   * trunk, and the start time closest to `near`.
   */
  async findTrunkCall(input: { trunkSid: string; from?: string; near: Date; windowMs?: number }): Promise<string | undefined> {
    const windowMs = input.windowMs ?? 2 * 60_000;
    const after = new Date(input.near.getTime() - windowMs);
    const before = new Date(input.near.getTime() + windowMs);
    const calls = await this.client.calls.list({ ...(input.from ? { from: input.from } : {}), startTimeAfter: after, startTimeBefore: before, limit: 50 });
    let best: { sid: string; distance: number } | undefined;
    for (const call of calls) {
      if (!call.startTime || call.direction !== "trunking-originating" || call.trunkSid !== input.trunkSid) continue;
      const distance = Math.abs(call.startTime.getTime() - input.near.getTime());
      if (distance > windowMs) continue;
      if (!best || distance < best.distance) best = { sid: call.sid, distance };
    }
    return best?.sid;
  }

  async getCallPricing(input: { providerCallId: string }): Promise<TwilioCallPricing> {
    const call = await this.client.calls(input.providerCallId).fetch();
    const providerPrice = finiteNumber(call.price);
    const providerPriceUnit = normalizedUnit(call.priceUnit);
    return {
      ...(call.dateUpdated ? { providerUpdatedAt: call.dateUpdated.toISOString() } : {}),
      ...(providerPrice !== undefined ? { providerPrice } : {}),
      ...(providerPriceUnit !== undefined ? { providerPriceUnit } : {}),
      ...(providerPrice !== undefined && providerPriceUnit === "usd" ? { providerCostUsd: Math.abs(providerPrice) } : {}),
    };
  }

  async releasePhoneNumber(input: { providerPhoneId: string }): Promise<void> {
    assertCertificationOperationAllowed();
    const number = this.client.incomingPhoneNumbers(input.providerPhoneId);
    try {
      await number.remove();
      return;
    } catch (error) {
      if (!isEmergencyAddressReleaseError(error)) throw error;
    }
    await number.update({ emergencyStatus: "Inactive" });
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const current = await number.fetch();
      if (current.emergencyStatus !== "Active" && current.emergencyAddressStatus !== "pending-unregistration") break;
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    await number.update({ emergencyAddressSid: "" });
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const current = await number.fetch();
      if (!current.emergencyAddressSid || current.emergencyAddressStatus === "unregistered") break;
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    await number.remove();
  }

  async verifyPhone(input: { to: string; serviceSid: string; locale?: string }): Promise<{ verificationSid: string; status: string }> {
    assertCertificationRecipient("phone", input.to);
    const verification = await this.client.verify.v2.services(input.serviceSid).verifications.create({ to: input.to, channel: "sms", ...(input.locale ? { locale: input.locale } : {}) });
    return { verificationSid: verification.sid, status: verification.status };
  }

  /** Twilio Verify's answer to a code: "approved" when it matches, "pending" when it doesn't. */
  async checkPhoneVerification(input: { to: string; code: string; serviceSid: string }): Promise<string> {
    const check = await this.client.verify.v2.services(input.serviceSid).verificationChecks.create({ to: input.to, code: input.code });
    return check.status;
  }

  /** The line type from Twilio Lookup (mobile, landline, fixedVoip, nonFixedVoip, …), or null when Lookup doesn't know. */
  async lookupLineType(phoneE164: string): Promise<string | null> {
    const result = await this.client.lookups.v2.phoneNumbers(phoneE164).fetch({ fields: "line_type_intelligence" });
    const type = (result.lineTypeIntelligence as { type?: unknown } | null | undefined)?.type;
    return typeof type === "string" && type ? type : null;
  }

  /**
   * Puts a number on the SIP trunk, where the receptionist answers, or takes
   * it off so Twilio asks `fallbackUrl` what to do with each call.
   */
  async routeNumber(input: { providerPhoneId: string; trunkSid: string; mode: "receptionist" | "fallback"; fallbackUrl: string }): Promise<void> {
    assertCertificationOperationAllowed();
    if (input.mode === "receptionist") {
      await this.addNumberToSipTrunk(input);
      return;
    }
    const number = await this.client.incomingPhoneNumbers(input.providerPhoneId).fetch();
    if (number.trunkSid) await this.client.trunking.v1.trunks(number.trunkSid).phoneNumbers(input.providerPhoneId).remove();
    await this.client.incomingPhoneNumbers(input.providerPhoneId).update({ voiceUrl: input.fallbackUrl, voiceMethod: "POST" });
  }

  async listAvailablePhoneNumbers(input: { countryCode: string; kind: "local" | "mobile" | "toll_free"; areaCode?: string; city?: string; regionCode?: string; postalCode?: string; sms?: boolean; limit: number }): Promise<AvailablePhoneNumber[]> {
    const collection = this.client.availablePhoneNumbers(input.countryCode);
    // Hosted businesses text from LobbyStack's shared number, so a number only has to take calls;
    // `sms` asks for numbers that also text, for a self-hosted business that texts from its own.
    const filters = { voiceEnabled: true, ...(input.sms ? { smsEnabled: true } : {}), limit: Math.max(1, Math.min(20, Math.trunc(input.limit))), ...(input.areaCode && /^\d+$/.test(input.areaCode) ? { areaCode: Number(input.areaCode) } : {}), ...(input.city ? { inLocality: input.city } : {}), ...(input.regionCode ? { inRegion: input.regionCode } : {}), ...(input.postalCode ? { inPostalCode: input.postalCode } : {}) };
    const numbers = input.kind === "toll_free" ? await collection.tollFree.list(filters) : input.kind === "mobile" ? await collection.mobile.list(filters) : await collection.local.list(filters);
    // Twilio returns capability keys as "SMS"/"MMS"/"voice", while its TypeScript
    // types use lowercase. Read both so real inventory is not filtered out.
    return numbers
      .map((number) => {
        const capabilities = (number.capabilities ?? {}) as Record<string, boolean | undefined>;
        const sms = Boolean(capabilities.sms ?? capabilities.SMS);
        const voice = Boolean(capabilities.voice ?? capabilities.VOICE);
        return { phoneE164: number.phoneNumber, ...(number.locality ? { locality: number.locality } : {}), ...(number.region ? { region: number.region } : {}), countryCode: input.countryCode.toUpperCase(), capabilities: { sms, voice } };
      })
      .filter((number) => number.capabilities.voice && (!input.sms || number.capabilities.sms));
  }

  /** Some countries sell numbers only under an approved regulatory bundle, and some also need an address on file. */
  async purchasePhoneNumber(input: { e164: string; friendlyName: string; smsUrl: string; statusCallbackUrl: string; bundleSid?: string; addressSid?: string }): Promise<{ providerPhoneId: string; e164: string; smsUrl?: string }> {
    assertCertificationOperationAllowed();
    const number = await this.client.incomingPhoneNumbers.create({ phoneNumber: input.e164, friendlyName: input.friendlyName, smsUrl: input.smsUrl, smsMethod: "POST", statusCallback: input.statusCallbackUrl, statusCallbackMethod: "POST", ...(input.bundleSid ? { bundleSid: input.bundleSid } : {}), ...(input.addressSid ? { addressSid: input.addressSid } : {}) });
    return { providerPhoneId: number.sid, e164: number.phoneNumber, ...(number.smsUrl ? { smsUrl: number.smsUrl } : {}) };
  }

  async findOwnedPhoneNumber(input: { e164: string }): Promise<{ providerPhoneId: string; e164: string; friendlyName?: string } | null> {
    const number = (await this.client.incomingPhoneNumbers.list({ phoneNumber: input.e164, limit: 1 }))[0];
    return number ? { providerPhoneId: number.sid, e164: number.phoneNumber, ...(number.friendlyName ? { friendlyName: number.friendlyName } : {}) } : null;
  }

  /** Routes the number's calls through an Elastic SIP trunk (to GPT-Live) instead of its voice URL. */
  async addNumberToSipTrunk(input: { trunkSid: string; providerPhoneId: string }): Promise<void> {
    assertCertificationOperationAllowed();
    const number = await this.client.incomingPhoneNumbers(input.providerPhoneId).fetch();
    if (number.trunkSid === input.trunkSid) return;
    await this.client.trunking.v1.trunks(input.trunkSid).phoneNumbers.create({ phoneNumberSid: input.providerPhoneId });
  }
}
