import { afterEach, expect, it, vi } from "vitest";
import { attachVerificationFlow, hasVerificationFlow } from "./verification-flow";

afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

function proof() {
  vi.stubEnv("APP_BASE_URL", "https://app.example.test");
  vi.stubEnv("BETTER_AUTH_SECRET", "test-secret-for-verification-flow");
  const response = new Response();
  attachVerificationFlow(response, "Owner@example.test");
  const cookie = response.headers.get("set-cookie")!.split(";")[0]!;
  return { response, cookie };
}
function request(cookie: string, origin = "https://app.example.test") {
  return new Request("https://app.example.test/api/auth/email-otp/send-verification-otp", { headers: { cookie, origin } });
}

it("accepts proof for the same email and origin with secure HttpOnly cookie attributes", () => {
  const { response, cookie } = proof();
  expect(hasVerificationFlow(request(cookie), "owner@example.test")).toBe(true);
  expect(response.headers.get("set-cookie")).toContain("HttpOnly; SameSite=Strict; Max-Age=600; Secure");
  expect(cookie).not.toContain("owner@example.test");
});

it("rejects missing, tampered, cross-origin, different-email and expired proof", () => {
  vi.useFakeTimers();
  const { cookie } = proof();
  expect(hasVerificationFlow(request(""), "owner@example.test")).toBe(false);
  expect(hasVerificationFlow(request(cookie + "x"), "owner@example.test")).toBe(false);
  expect(hasVerificationFlow(request(cookie, "https://other.example.test"), "owner@example.test")).toBe(false);
  expect(hasVerificationFlow(request(cookie), "other@example.test")).toBe(false);
  vi.advanceTimersByTime(600_000);
  expect(hasVerificationFlow(request(cookie), "owner@example.test")).toBe(false);
});
