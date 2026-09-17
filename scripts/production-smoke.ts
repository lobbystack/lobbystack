import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";

export type SmokeConfig = {
  adminBaseUrl: string;
  voiceBaseUrl: string;
  workerBaseUrl?: string;
  twilioAccountSid?: string;
  twilioAuthToken?: string;
  expectedNumbers: string[];
  expectedVoiceUrl: string;
  expectedSmsUrl: string;
  loginEmail?: string;
  loginPassword?: string;
  enableCall: boolean;
  callFrom?: string;
  callTo?: string;
};

export type SmokeCheck = { name: string; ok: boolean; detail: string };

function trimTrailingSlash(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

export function parseList(raw: string): string[] {
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

export function normalizeUrl(raw: string): string {
  return trimTrailingSlash(raw);
}

export function webhookMatches(actual: string | null | undefined, expected: string): boolean {
  return typeof actual === "string" && normalizeUrl(actual) === normalizeUrl(expected);
}

export function signInFailureIsExpected(status: number): boolean {
  return status === 400 || status === 401 || status === 403;
}

export function buildConfig(source: NodeJS.ProcessEnv = process.env): SmokeConfig {
  const adminBaseUrl = trimTrailingSlash(source.ADMIN_BASE_URL ?? "https://app.lobbystack.com");
  const voiceBaseUrl = trimTrailingSlash(source.VOICE_BASE_URL ?? "https://voice.lobbystack.com");
  const workerBaseUrl = source.WORKER_BASE_URL ? trimTrailingSlash(source.WORKER_BASE_URL) : undefined;
  return {
    adminBaseUrl,
    voiceBaseUrl,
    ...(workerBaseUrl ? { workerBaseUrl } : {}),
    ...(source.TWILIO_ACCOUNT_SID ? { twilioAccountSid: source.TWILIO_ACCOUNT_SID } : {}),
    ...(source.TWILIO_AUTH_TOKEN ? { twilioAuthToken: source.TWILIO_AUTH_TOKEN } : {}),
    expectedNumbers: parseList(source.SMOKE_EXPECTED_NUMBERS ?? "+12136686869,+18446562290"),
    expectedVoiceUrl: trimTrailingSlash(source.SMOKE_EXPECTED_VOICE_URL ?? `${voiceBaseUrl}/twilio/voice/inbound`),
    expectedSmsUrl: trimTrailingSlash(source.SMOKE_EXPECTED_SMS_URL ?? `${adminBaseUrl}/api/webhooks/twilio/sms`),
    ...(source.SMOKE_LOGIN_EMAIL ? { loginEmail: source.SMOKE_LOGIN_EMAIL } : {}),
    ...(source.SMOKE_LOGIN_PASSWORD ? { loginPassword: source.SMOKE_LOGIN_PASSWORD } : {}),
    enableCall: source.SMOKE_ENABLE_CALL === "1" || source.SMOKE_ENABLE_CALL === "true",
    ...(source.SMOKE_CALL_FROM ? { callFrom: source.SMOKE_CALL_FROM } : {}),
    ...(source.SMOKE_CALL_TO ? { callTo: source.SMOKE_CALL_TO } : {}),
  };
}

function twilioAuthorization(config: SmokeConfig): string {
  if (!config.twilioAccountSid || !config.twilioAuthToken) {
    throw new Error("TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN are required for the number audit.");
  }
  return `Basic ${Buffer.from(`${config.twilioAccountSid}:${config.twilioAuthToken}`).toString("base64")}`;
}

async function checkHealth(name: string, url: string): Promise<SmokeCheck> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    const body = await response.json().catch(() => null) as { ok?: boolean } | null;
    const ok = response.ok && body?.ok === true;
    return { name, ok, detail: ok ? `status ${response.status}` : `unexpected response (status ${response.status})` };
  } catch (error) {
    return { name, ok: false, detail: error instanceof Error ? error.message : String(error) };
  }
}

async function auditTwilioNumbers(config: SmokeConfig): Promise<SmokeCheck[]> {
  const authorization = twilioAuthorization(config);
  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${config.twilioAccountSid}/IncomingPhoneNumbers.json?PageSize=200`,
    { headers: { authorization }, signal: AbortSignal.timeout(15_000) },
  );
  if (!response.ok) {
    return [{ name: "twilio account", ok: false, detail: `Twilio API returned ${response.status} (wrong account or token?)` }];
  }
  const body = await response.json() as { incoming_phone_numbers?: Array<{ phone_number: string; voice_url: string | null; sms_url: string | null }> };
  const byNumber = new Map((body.incoming_phone_numbers ?? []).map((number) => [number.phone_number, number]));
  return config.expectedNumbers.map((number) => {
    const found = byNumber.get(number);
    if (!found) {
      return { name: `twilio ${number}`, ok: false, detail: "number is not owned by this Twilio account" };
    }
    if (!webhookMatches(found.voice_url, config.expectedVoiceUrl)) {
      return { name: `twilio ${number} voice`, ok: false, detail: `voice webhook is ${found.voice_url ?? "(unset)"}, expected ${config.expectedVoiceUrl}` };
    }
    if (!webhookMatches(found.sms_url, config.expectedSmsUrl)) {
      return { name: `twilio ${number} sms`, ok: false, detail: `sms webhook is ${found.sms_url ?? "(unset)"}, expected ${config.expectedSmsUrl}` };
    }
    return { name: `twilio ${number}`, ok: true, detail: "voice and sms webhooks match" };
  });
}

async function checkSignInEndpoint(config: SmokeConfig): Promise<SmokeCheck> {
  const usingRealCredentials = Boolean(config.loginEmail && config.loginPassword);
  const body = usingRealCredentials
    ? { email: config.loginEmail, password: config.loginPassword }
    : { email: `smoke-${randomUUID()}@smoke.invalid`, password: "not-a-real-password" };
  try {
    const response = await fetch(`${config.adminBaseUrl}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: config.adminBaseUrl },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    if (usingRealCredentials) {
      return { name: "login", ok: response.ok, detail: `status ${response.status}` };
    }
    const ok = signInFailureIsExpected(response.status);
    return { name: "login endpoint", ok, detail: ok ? `rejected invalid credentials with ${response.status}` : `unexpected status ${response.status}` };
  } catch (error) {
    return { name: "login endpoint", ok: false, detail: error instanceof Error ? error.message : String(error) };
  }
}

async function placeSmokeCall(config: SmokeConfig): Promise<SmokeCheck> {
  const authorization = twilioAuthorization(config);
  if (!config.callFrom || !config.callTo) {
    return { name: "call", ok: false, detail: "SMOKE_CALL_FROM and SMOKE_CALL_TO are required when SMOKE_ENABLE_CALL is set" };
  }
  const create = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${config.twilioAccountSid}/Calls.json`, {
    method: "POST",
    headers: { authorization, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ To: config.callTo, From: config.callFrom, Url: config.expectedVoiceUrl }).toString(),
    signal: AbortSignal.timeout(15_000),
  });
  if (!create.ok) {
    return { name: "call", ok: false, detail: `could not create test call (status ${create.status})` };
  }
  const created = await create.json() as { sid: string; status: string };
  for (let attempt = 0; attempt < 12; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5_000));
    const poll = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${config.twilioAccountSid}/Calls/${created.sid}.json`, {
      headers: { authorization },
      signal: AbortSignal.timeout(15_000),
    });
    const call = await poll.json() as { status: string };
    if (["completed", "busy", "failed", "no-answer", "canceled"].includes(call.status)) {
      return { name: "call", ok: call.status !== "failed", detail: `terminal status ${call.status}` };
    }
  }
  return { name: "call", ok: false, detail: "test call did not reach a terminal status" };
}

async function main(): Promise<void> {
  const config = buildConfig();
  const healthTargets = [
    { name: "admin-ready", baseUrl: config.adminBaseUrl, path: "/api/health/ready" },
    ...(config.workerBaseUrl ? [{ name: "worker-ready", baseUrl: config.workerBaseUrl, path: "/health/ready" }] : []),
    { name: "voice-ready", baseUrl: config.voiceBaseUrl, path: "/health/ready" },
  ];
  const checks: SmokeCheck[] = [
    ...(await Promise.all(healthTargets.map((target) => checkHealth(target.name, new URL(target.path, target.baseUrl).toString())))),
    ...(await auditTwilioNumbers(config)),
    await checkSignInEndpoint(config),
  ];
  if (config.enableCall) {
    checks.push(await placeSmokeCall(config));
  }
  for (const check of checks) {
    console.log(`${check.ok ? "ok  " : "FAIL"} ${check.name}: ${check.detail}`);
  }
  const failures = checks.filter((check) => !check.ok);
  if (failures.length > 0) {
    throw new Error(`${failures.length} smoke check(s) failed.`);
  }
  console.log("production smoke passed");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
