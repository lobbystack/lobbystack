import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("./api-helpers", () => ({ getWorkerDatabase: vi.fn() }));
import { requestIpHash } from "./widget-keys";

afterEach(() => vi.unstubAllEnvs());
describe("widget trusted IP policy", () => {
  it("ignores caller-controlled forwarding headers without explicit trust", () => {
    vi.stubEnv("TRUSTED_CLIENT_IP_HEADER", "");
    expect(requestIpHash(new Request("https://admin.test", { headers: { "x-forwarded-for": "203.0.113.1", "x-real-ip": "203.0.113.2" } }))).toBeUndefined();
  });
  it("accepts only the configured ingress IP header", () => {
    vi.stubEnv("TRUSTED_CLIENT_IP_HEADER", "x-real-ip");
    expect(requestIpHash(new Request("https://admin.test", { headers: { "x-forwarded-for": "203.0.113.1", "x-real-ip": "203.0.113.2" } }))).toBe(createHash("sha256").update("203.0.113.2").digest("hex"));
  });
  it.each(["203.0.113.1, 203.0.113.2", "garbage", ""])('rejects invalid single-IP header "%s"', (value) => {
    vi.stubEnv("TRUSTED_CLIENT_IP_HEADER", "x-real-ip");
    expect(requestIpHash(new Request("https://admin.test", { headers: { "x-real-ip": value } }))).toBeUndefined();
  });
});
