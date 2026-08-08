export type TwilioVerifyConfig = {
  accountSid: string;
  authToken: string;
  serviceSid: string;
  apiBaseUrl?: string;
};

type TwilioVerifyResponse = {
  sid?: string;
  status?: string;
};

function basicAuth(accountSid: string, authToken: string): string {
  return `Basic ${globalThis.btoa(`${accountSid}:${authToken}`)}`;
}

export function twilioVerifyConfigFromEnvironment(
  env: Record<string, string | undefined> = process.env,
): TwilioVerifyConfig | null {
  const accountSid = env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = env.TWILIO_AUTH_TOKEN?.trim();
  const serviceSid = env.TWILIO_VERIFY_SERVICE_SID?.trim();
  if (!accountSid || !authToken || !serviceSid) return null;
  return {
    accountSid,
    authToken,
    serviceSid,
    ...(env.TWILIO_API_BASE_URL?.trim()
      ? { apiBaseUrl: env.TWILIO_API_BASE_URL.trim().replace(/\/$/, "") }
      : {}),
  };
}

export class TwilioVerifyProvider {
  constructor(private readonly config: TwilioVerifyConfig) {}

  private url(path: string): string {
    const baseUrl = this.config.apiBaseUrl ?? "https://verify.twilio.com";
    return `${baseUrl}/v2/Services/${encodeURIComponent(this.config.serviceSid)}${path}`;
  }

  private async request(path: string, form: URLSearchParams): Promise<TwilioVerifyResponse> {
    const response = await fetch(this.url(path), {
      method: "POST",
      headers: {
        Authorization: basicAuth(this.config.accountSid, this.config.authToken),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form,
    });
    if (!response.ok) {
      throw new Error(`Twilio Verify request failed with status ${response.status}: ${(await response.text()).slice(0, 500)}`);
    }
    return (await response.json()) as TwilioVerifyResponse;
  }

  async sendCode(phone: string): Promise<{ verificationSid: string; status: string }> {
    const result = await this.request("/Verifications", new URLSearchParams({ To: phone, Channel: "sms" }));
    if (!result.sid) throw new Error("Twilio Verify response did not include a verification SID");
    return { verificationSid: result.sid, status: result.status ?? "pending" };
  }

  async checkCode(input: { verificationSid: string; code: string }): Promise<{ status: string }> {
    const result = await this.request(
      "/VerificationCheck",
      new URLSearchParams({ VerificationSid: input.verificationSid, Code: input.code }),
    );
    return { status: result.status ?? "pending" };
  }
}
