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

it("accepts proof on a partner's host only from the origin the proxy resolved it on", () => {
  const { cookie } = proof();
  const partner = { "x-lobbystack-brand": "partner:5b1f6c43-34a5-4a8e-9a43-6c1f8d5f1c11", "x-lobbystack-brand-origin": "https://bright.portal.example.test" };
  const onPartner = (origin: string, brand: Record<string, string> = partner) => new Request("http://0.0.0.0:3000/api/auth/email-otp/send-verification-otp", { headers: { cookie, origin, ...brand } });
  expect(hasVerificationFlow(onPartner("https://bright.portal.example.test"), "owner@example.test")).toBe(true);
  // The host's own origin is another site there.
  expect(hasVerificationFlow(onPartner("https://app.example.test"), "owner@example.test")).toBe(false);
  // Without the proxy's say, a partner's origin is just another site.
  expect(hasVerificationFlow(onPartner("https://bright.portal.example.test", {}), "owner@example.test")).toBe(false);
});
