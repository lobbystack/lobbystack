import twilio from "twilio";

import { validateTwilioSignature } from "@lobbystack/shared";

export type TwilioProviderConfig = {
  accountSid: string;
  authToken: string;
};

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
  private readonly config: TwilioProviderConfig;

  constructor(config: TwilioProviderConfig) {
    this.config = config;
    this.client = twilio(config.accountSid, config.authToken);
  }

  async validateWebhook(input: { signature: string | null; url: string; params: Record<string, string> }): Promise<boolean> {
    return await validateTwilioSignature({ authToken: this.config.authToken, signatureHeader: input.signature, url: input.url, params: input.params });
  }

  async sendSms(input: { to: string; from: string; body: string; statusCallback?: string }): Promise<{ providerMessageId: string }> {
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

  async verifyPhone(input: { to: string; serviceSid: string }): Promise<{ verificationSid: string; status: string }> {
    const verification = await this.client.verify.v2.services(input.serviceSid).verifications.create({ to: input.to, channel: "sms" });
    return { verificationSid: verification.sid, status: verification.status };
  }

  async checkPhone(input: { serviceSid: string; verificationSid: string; code: string }): Promise<{ status: string; approved: boolean }> {
    const check = await this.client.verify.v2.services(input.serviceSid).verificationChecks.create({ verificationSid: input.verificationSid, code: input.code });
    return { status: check.status, approved: check.status === "approved" };
  }

  async lookupPhoneNumber(input: { phoneNumber: string; includeLineType?: boolean }): Promise<{ phoneE164: string; countryCode: string; valid: boolean; validationErrors?: string[]; lineType?: string; lineTypeErrorCode?: number }> {
    const result = await this.client.lookups.v2.phoneNumbers(input.phoneNumber).fetch(input.includeLineType === false ? {} : { fields: "line_type_intelligence" });
    const lineType = result.lineTypeIntelligence?.type ?? undefined;
    const lineTypeErrorCode = result.lineTypeIntelligence?.errorCode ?? undefined;
    return { phoneE164: result.phoneNumber, countryCode: result.countryCode, valid: result.valid, ...(result.validationErrors?.length ? { validationErrors: result.validationErrors } : {}), ...(lineType ? { lineType } : {}), ...(lineTypeErrorCode !== null && lineTypeErrorCode !== undefined ? { lineTypeErrorCode } : {}) };
  }

  async listAvailablePhoneNumbers(input: { countryCode: string; kind: "local" | "toll_free"; areaCode?: string; city?: string; regionCode?: string; postalCode?: string; limit: number }): Promise<AvailablePhoneNumber[]> {
    const collection = this.client.availablePhoneNumbers(input.countryCode);
    const filters = { smsEnabled: true, voiceEnabled: true, limit: Math.max(1, Math.min(20, Math.trunc(input.limit))), ...(input.areaCode && /^\d+$/.test(input.areaCode) ? { areaCode: Number(input.areaCode) } : {}), ...(input.city ? { inLocality: input.city } : {}), ...(input.regionCode ? { inRegion: input.regionCode } : {}), ...(input.postalCode ? { inPostalCode: input.postalCode } : {}) };
    const numbers = input.kind === "toll_free" ? await collection.tollFree.list(filters) : await collection.local.list(filters);
    return numbers.filter((number) => number.capabilities.sms && number.capabilities.voice).map((number) => ({ phoneE164: number.phoneNumber, ...(number.locality ? { locality: number.locality } : {}), ...(number.region ? { region: number.region } : {}), countryCode: input.countryCode.toUpperCase(), capabilities: { sms: Boolean(number.capabilities.sms), voice: Boolean(number.capabilities.voice) } }));
  }

  async purchasePhoneNumber(input: { e164: string; friendlyName: string; smsUrl: string; voiceUrl: string; statusCallbackUrl: string }): Promise<{ providerPhoneId: string; e164: string; smsUrl?: string; voiceUrl?: string }> {
    const number = await this.client.incomingPhoneNumbers.create({ phoneNumber: input.e164, friendlyName: input.friendlyName, smsUrl: input.smsUrl, smsMethod: "POST", voiceUrl: input.voiceUrl, voiceMethod: "POST", statusCallback: input.statusCallbackUrl, statusCallbackMethod: "POST" });
    return { providerPhoneId: number.sid, e164: number.phoneNumber, ...(number.smsUrl ? { smsUrl: number.smsUrl } : {}), ...(number.voiceUrl ? { voiceUrl: number.voiceUrl } : {}) };
  }

  async findOwnedPhoneNumber(input: { e164: string }): Promise<{ providerPhoneId: string; e164: string; friendlyName?: string } | null> {
    const number = (await this.client.incomingPhoneNumbers.list({ phoneNumber: input.e164, limit: 1 }))[0];
    return number ? { providerPhoneId: number.sid, e164: number.phoneNumber, ...(number.friendlyName ? { friendlyName: number.friendlyName } : {}) } : null;
  }

  async configureIncomingPhoneNumber(input: { providerPhoneId: string; smsUrl?: string | null; voiceUrl?: string | null; statusCallbackUrl?: string | null }): Promise<void> {
    await this.client.incomingPhoneNumbers(input.providerPhoneId).update({ ...(input.smsUrl !== undefined ? { smsUrl: input.smsUrl ?? "", smsMethod: "POST" } : {}), ...(input.voiceUrl !== undefined ? { voiceUrl: input.voiceUrl ?? "", voiceMethod: "POST" } : {}), ...(input.statusCallbackUrl !== undefined ? { statusCallback: input.statusCallbackUrl ?? "", statusCallbackMethod: "POST" } : {}) });
  }

  async transferCall(input: { callSid: string; destination: string; twimlUrl: string }): Promise<void> {
    await this.client.calls(input.callSid).update({ url: input.twimlUrl, method: "POST" });
    void input.destination;
  }
}
