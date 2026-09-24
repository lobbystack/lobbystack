import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class RateLimitError extends Error {}
  return {
    RateLimitError,
    assertAllowed: vi.fn(),
    issueCode: vi.fn(),
    verifyTurnstile: vi.fn(),
  };
});

vi.mock("@/lib/email-verification-policy", () => ({
  assertEmailVerificationSendAllowed: mocks.assertAllowed,
  EmailVerificationRateLimitError: mocks.RateLimitError,
}));
vi.mock("@/lib/auth", () => ({ issueEmailVerificationCode: mocks.issueCode }));
vi.mock("@/lib/turnstile", () => ({ verifyTurnstile: mocks.verifyTurnstile }));

import { POST } from "../../app/api/auth/email-otp/send-verification-otp/route";
import { attachVerificationFlow } from "./verification-flow";

function resendRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("https://app.example.test/api/auth/email-otp/send-verification-otp", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("TRUSTED_CLIENT_IP_HEADER", "x-real-ip");
  mocks.assertAllowed.mockResolvedValue(undefined);
  mocks.issueCode.mockResolvedValue(true);
  mocks.verifyTurnstile.mockResolvedValue(undefined);
});

afterEach(() => vi.unstubAllEnvs());

describe("email verification resend route", () => {
  it("reuses signup proof without another challenge or extending its lifetime", async () => {
    vi.stubEnv("APP_BASE_URL", "https://app.example.test");
    const signup = new Response();
    attachVerificationFlow(signup, "owner@example.invalid");
    const headers = { origin: "https://app.example.test", cookie: signup.headers.get("set-cookie")!.split(";")[0]! };
    const response = await POST(resendRequest({ email: "owner@example.invalid", type: "email-verification" }, headers));
    expect(response.status).toBe(200);
    expect(mocks.verifyTurnstile).not.toHaveBeenCalled();
    expect(mocks.issueCode).toHaveBeenCalledOnce();
    expect(response.headers.get("set-cookie")).toBeNull();
    mocks.issueCode.mockRejectedValueOnce(new mocks.RateLimitError());
    const limited = await POST(resendRequest({ email: "owner@example.invalid", type: "email-verification" }, headers));
    expect(limited.status).toBe(429);
  });
  it("requires a valid request and Turnstile challenge", async () => {
    const invalid = await POST(resendRequest({ email: "not-an-email", type: "email-verification" }));
    expect(invalid.status).toBe(400);
    expect(mocks.verifyTurnstile).not.toHaveBeenCalled();

    mocks.verifyTurnstile.mockRejectedValueOnce(new Error("failed"));
    const challenged = await POST(resendRequest({ email: "owner@example.invalid", type: "email-verification", turnstileToken: "invalid" }));
    expect(challenged.status).toBe(400);
    expect(mocks.issueCode).not.toHaveBeenCalled();
  });

  it("checks the challenge and recipient limit before issuing a code", async () => {
    const response = await POST(resendRequest(
      { email: "Owner@Example.invalid", type: "email-verification", turnstileToken: "challenge" },
      { "x-real-ip": "203.0.113.10" },
    ));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(mocks.verifyTurnstile).toHaveBeenCalledWith({ token: "challenge", remoteIp: "203.0.113.10" });
    expect(mocks.assertAllowed).not.toHaveBeenCalled();
    expect(mocks.issueCode).toHaveBeenCalledWith("owner@example.invalid", "203.0.113.10");
  });

  it("prefers Railway's trusted client IP header", async () => {
    await POST(resendRequest(
      { email: "owner@example.invalid", type: "email-verification", turnstileToken: "challenge" },
      { "x-real-ip": "203.0.113.10", "cf-connecting-ip": "198.51.100.20" },
    ));
    expect(mocks.verifyTurnstile).toHaveBeenCalledWith({ token: "challenge", remoteIp: "203.0.113.10" });
    expect(mocks.issueCode).toHaveBeenCalledWith("owner@example.invalid", "203.0.113.10");
  });

  it("omits the remote IP when no trusted header is configured", async () => {
    vi.stubEnv("TRUSTED_CLIENT_IP_HEADER", "");
    const response = await POST(resendRequest(
      { email: "owner@example.invalid", type: "email-verification", turnstileToken: "challenge" },
      { "x-real-ip": "203.0.113.10" },
    ));
    expect(response.status).toBe(200);
    expect(mocks.verifyTurnstile).toHaveBeenCalledWith({ token: "challenge" });
    expect(mocks.issueCode).toHaveBeenCalledWith("owner@example.invalid", undefined);
  });

  it("returns the same success response when no unverified recipient exists", async () => {
    mocks.issueCode.mockResolvedValueOnce(false);
    const response = await POST(resendRequest({ email: "missing@example.invalid", type: "email-verification", turnstileToken: "challenge" }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
  });

  it("returns a generic recipient cooldown without issuing a code", async () => {
    mocks.issueCode.mockRejectedValueOnce(new mocks.RateLimitError());
    const response = await POST(resendRequest({ email: "owner@example.invalid", type: "email-verification", turnstileToken: "challenge" }));
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
    expect(mocks.issueCode).toHaveBeenCalledTimes(1);
  });
});
