import { afterEach, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { requestIpHash, requireTwilioProvider } from "./twilio-provider";

afterEach(() => vi.unstubAllEnvs());

const request = (headers: Record<string, string>) => new Request("https://app.example.test/api/onboarding/phone-numbers/claim", { headers });

it("hashes the trusted ingress header for the trial network limit, and ignores x-forwarded-for", () => {
  vi.stubEnv("NUMBER_CLAIM_TOKEN_SECRET", "x".repeat(32));
  vi.stubEnv("TRUSTED_CLIENT_IP_HEADER", "x-real-ip");
  const hash = requestIpHash(request({ "x-real-ip": "203.0.113.7", "x-forwarded-for": "198.51.100.1" }));
  expect(hash).toMatch(/^[0-9a-f]{64}$/);
  expect(requestIpHash(request({ "x-real-ip": "203.0.113.7", "x-forwarded-for": "198.51.100.2" }))).toBe(hash);
  expect(requestIpHash(request({ "x-forwarded-for": "198.51.100.1" }))).toBeNull();
});

it("counts one IPv6 /64 as one network", () => {
  vi.stubEnv("NUMBER_CLAIM_TOKEN_SECRET", "x".repeat(32));
  vi.stubEnv("TRUSTED_CLIENT_IP_HEADER", "x-real-ip");
  expect(requestIpHash(request({ "x-real-ip": "2001:db8:1:2::1" }))).toBe(requestIpHash(request({ "x-real-ip": "2001:db8:1:2::ffff" })));
});

it("answers 503 phone_numbers_unavailable when the deployment has no Twilio account", async () => {
  vi.stubEnv("TWILIO_ACCOUNT_SID", "");
  vi.stubEnv("TWILIO_AUTH_TOKEN", "");
  let refusal: unknown;
  try { requireTwilioProvider(); } catch (error) { refusal = error; }
  expect(refusal).toBeInstanceOf(Response);
  expect((refusal as Response).status).toBe(503);
  expect(await (refusal as Response).json()).toMatchObject({ code: "phone_numbers_unavailable" });
});
