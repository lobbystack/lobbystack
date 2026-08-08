import {
  normalizeTwilioFormFields,
  validateTwilioSignature,
} from "@lobbystack/shared";
import type {
  InboundSmsWebhook,
  OutboundSmsMessage,
  SmsProvider,
  SmsProviderMessage,
} from "../index";

export type TwilioSmsConfig = {
  accountSid: string;
  authToken: string;
  apiBaseUrl?: string;
};

type TwilioMessageResponse = {
  sid?: string;
  status?: string;
  price?: string | null;
  price_unit?: string | null;
  num_segments?: string | null;
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

function normalizeMessage(
  providerMessageId: string,
  response: TwilioMessageResponse,
): SmsProviderMessage {
  const providerPrice = parseOptionalNumber(response.price);
  const providerNumSegments = parseOptionalNumber(response.num_segments);
  return {
    providerMessageId,
    providerStatus: response.status ?? "queued",
    ...(providerPrice !== undefined ? { providerPrice } : {}),
    ...(response.price_unit ? { providerPriceUnit: response.price_unit } : {}),
    ...(providerNumSegments !== undefined
      ? { providerNumSegments: Math.max(0, Math.trunc(providerNumSegments)) }
      : {}),
    ...(response.date_updated ? { providerUpdatedAt: response.date_updated } : {}),
  };
}

export function twilioSmsConfigFromEnvironment(
  env: Record<string, string | undefined> = process.env,
): TwilioSmsConfig | null {
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

export class TwilioSmsProvider implements SmsProvider {
  constructor(private readonly config: TwilioSmsConfig) {}

  async validateWebhook(signature: string | null, url: string, body: string): Promise<boolean> {
    const params = normalizeTwilioFormFields(
      Object.fromEntries(new URLSearchParams(body).entries()),
    );
    return validateTwilioSignature({
      authToken: this.config.authToken,
      signatureHeader: signature,
      url,
      params,
    });
  }

  normalizeInboundWebhook(body: Record<string, string>): InboundSmsWebhook {
    const providerMessageId = body.MessageSid ?? body.SmsSid;
    return {
      from: body.From ?? "",
      to: body.To ?? "",
      body: body.Body ?? "",
      ...(providerMessageId ? { providerMessageId } : {}),
      ...(body.OptOutType ? { optOutType: body.OptOutType } : {}),
    };
  }

  async sendMessage(input: OutboundSmsMessage): Promise<{ providerMessageId: string; providerStatus: string }> {
    const baseUrl = this.config.apiBaseUrl ?? "https://api.twilio.com";
    const url = `${baseUrl}/2010-04-01/Accounts/${encodeURIComponent(this.config.accountSid)}/Messages.json`;
    const form = new URLSearchParams({
      To: input.to,
      From: input.from,
      Body: input.body,
      ...(input.statusCallbackUrl ? { StatusCallback: input.statusCallbackUrl } : {}),
    });
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: basicAuth(this.config.accountSid, this.config.authToken),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form,
    });
    if (!response.ok) {
      throw new Error(`Twilio SMS send failed with status ${response.status}: ${(await response.text()).slice(0, 500)}`);
    }

    const payload = (await response.json()) as TwilioMessageResponse;
    if (!payload.sid) throw new Error("Twilio SMS response did not include a message SID");
    return {
      providerMessageId: payload.sid,
      providerStatus: payload.status ?? "queued",
    };
  }

  async fetchMessage(providerMessageId: string): Promise<SmsProviderMessage> {
    const baseUrl = this.config.apiBaseUrl ?? "https://api.twilio.com";
    const url = `${baseUrl}/2010-04-01/Accounts/${encodeURIComponent(this.config.accountSid)}/Messages/${encodeURIComponent(providerMessageId)}.json`;
    const response = await fetch(url, {
      headers: { Authorization: basicAuth(this.config.accountSid, this.config.authToken) },
    });
    if (!response.ok) {
      throw new Error(`Twilio SMS fetch failed with status ${response.status}: ${(await response.text()).slice(0, 500)}`);
    }
    return normalizeMessage(providerMessageId, (await response.json()) as TwilioMessageResponse);
  }
}
