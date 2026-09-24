import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getAuth: () => ({}) }));
vi.mock("better-auth/next-js", () => ({ toNextJsHandler: () => ({ POST: mocks.post }) }));
import { POST } from "../../app/api/auth/[...all]/route";
import { hasVerificationFlow } from "./verification-flow";
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

it.each([200, 400, 429])("issues resend proof only after successful signup (%s)", async status => {
  vi.stubEnv("APP_BASE_URL", "https://app.example.test");
  mocks.post.mockResolvedValue(Response.json({}, { status }));
  const response = await POST(new Request("https://app.example.test/api/auth/sign-up/email", { method: "POST", body: JSON.stringify({ email: "owner@example.test" }) }));
  const cookie = response.headers.get("set-cookie");
  if (status !== 200) expect(cookie).toBeNull();
  else expect(hasVerificationFlow(new Request("https://app.example.test/api/auth/email-otp/send-verification-otp", { headers: { origin: "https://app.example.test", cookie: cookie!.split(";")[0]! } }), "owner@example.test")).toBe(true);
});
