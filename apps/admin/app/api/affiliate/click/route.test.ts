import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ enforce: vi.fn(), record: vi.fn(), ip: vi.fn() }));
vi.mock("@/lib/fixed-window-limit", async (original) => ({ ...await original<typeof import("@/lib/fixed-window-limit")>(), enforceFixedWindow: mocks.enforce }));
vi.mock("@/lib/trusted-client-ip", () => ({ trustedClientIp: mocks.ip }));
vi.mock("@/lib/domain-context", () => ({ createDomainContext: () => ({}) }));
vi.mock("@lobbystack/domain", async (original) => ({ ...await original<typeof import("@lobbystack/domain")>(), recordAffiliateClick: mocks.record }));

import { POST } from "./route";

const click = () => POST(new Request("http://localhost:3000/api/affiliate/click", { method: "POST", body: JSON.stringify({ referralCode: "Bob" }) }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.record.mockResolvedValue(true);
  mocks.ip.mockReturnValue("203.0.113.7");
});

describe("affiliate click API", () => {
  it("limits each referral code and each client IP", async () => {
    mocks.enforce.mockResolvedValue({ allowed: true });
    await expect((await click()).json()).resolves.toEqual({ recorded: true });
    const [limits] = mocks.enforce.mock.calls[0]!;
    expect(limits.map((entry: { name: string; limit: number; windowSeconds: number }) => [entry.name, entry.limit, entry.windowSeconds])).toEqual([
      ["code-hour", 500, 3600],
      ["ip-hour", 30, 3600],
    ]);
  });

  it("drops a click over the limit without writing it", async () => {
    mocks.enforce.mockResolvedValue({ allowed: false, status: 429, reason: "rate_limit_ip_hour" });
    const response = await click();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ recorded: false });
    expect(mocks.record).not.toHaveBeenCalled();
  });
});
