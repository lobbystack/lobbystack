export type TwilioVoiceConfig = {
  accountSid: string;
  authToken: string;
  apiBaseUrl?: string;
};

export type TwilioVoiceCall = {
  providerCallId: string;
  providerStatus?: string;
  providerPrice?: number;
  providerPriceUnit?: string;
  providerDurationSeconds?: number;
  providerUpdatedAt?: string;
};

type TwilioCallResponse = {
  sid?: string;
  status?: string;
  price?: string | null;
  price_unit?: string | null;
  duration?: string | null;
  date_updated?: string | null;
};

function parseOptionalNumber(value: string | null | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function basicAuth(accountSid: string, authToken: string): string {
  return `Basic ${globalThis.btoa(`${accountSid}:${authToken}`)}`;
}

export function twilioVoiceConfigFromEnvironment(
  env: Record<string, string | undefined> = process.env,
): TwilioVoiceConfig | null {
  const accountSid = env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = env.TWILIO_AUTH_TOKEN?.trim();
  if (!accountSid || !authToken) return null;

  return {
    accountSid,
    authToken,
    ...(env.TWILIO_API_BASE_URL?.trim()
      ? { apiBaseUrl: env.TWILIO_API_BASE_URL.trim().replace(/\/$/, "") }
      : {}),
  };
}

function normalizeCall(providerCallId: string, response: TwilioCallResponse): TwilioVoiceCall {
  const providerPrice = parseOptionalNumber(response.price);
  const providerDurationSeconds = parseOptionalNumber(response.duration);
  return {
    providerCallId,
    ...(response.status ? { providerStatus: response.status } : {}),
    ...(providerPrice !== undefined ? { providerPrice } : {}),
    ...(response.price_unit ? { providerPriceUnit: response.price_unit } : {}),
    ...(providerDurationSeconds !== undefined
      ? { providerDurationSeconds: Math.max(0, Math.trunc(providerDurationSeconds)) }
      : {}),
    ...(response.date_updated ? { providerUpdatedAt: response.date_updated } : {}),
  };
}

export class TwilioVoiceProvider {
  constructor(private readonly config: TwilioVoiceConfig) {}

  async fetchCall(providerCallId: string): Promise<TwilioVoiceCall> {
    const baseUrl = this.config.apiBaseUrl ?? "https://api.twilio.com";
    const url = `${baseUrl}/2010-04-01/Accounts/${encodeURIComponent(this.config.accountSid)}/Calls/${encodeURIComponent(providerCallId)}.json`;
    const response = await fetch(url, {
      headers: { Authorization: basicAuth(this.config.accountSid, this.config.authToken) },
    });
    if (!response.ok) {
      throw new Error(
        `Twilio call fetch failed with status ${response.status}: ${(await response.text()).slice(0, 500)}`,
      );
    }
    return normalizeCall(providerCallId, (await response.json()) as TwilioCallResponse);
  }

  async releasePhoneNumber(providerPhoneNumberId: string): Promise<void> {
    const baseUrl = this.config.apiBaseUrl ?? "https://api.twilio.com";
    const url = `${baseUrl}/2010-04-01/Accounts/${encodeURIComponent(this.config.accountSid)}/IncomingPhoneNumbers/${encodeURIComponent(providerPhoneNumberId)}.json`;
    const response = await fetch(url, {
      method: "DELETE",
      headers: { Authorization: basicAuth(this.config.accountSid, this.config.authToken) },
    });
    if (response.status === 404) return;
    if (!response.ok) {
      throw new Error(
        `Twilio phone number release failed with status ${response.status}: ${(await response.text()).slice(0, 500)}`,
      );
    }
  }
}
