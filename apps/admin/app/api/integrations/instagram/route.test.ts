import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const domain = vi.hoisted(() => ({ getInstagramAccount: vi.fn(), disconnectInstagramAccount: vi.fn() }));
vi.mock("@/lib/operator-request", () => import("@/lib/operator-request.fake"));
vi.mock("@/lib/domain-context", () => ({ createDomainContext: () => ({ db: "app" }) }));
vi.mock("@lobbystack/domain", async (original) => ({ ...await original<typeof import("@lobbystack/domain")>(), ...domain }));

import { resetFakeOperator } from "@/lib/operator-request.fake";
import { GET } from "./route";

const AGENT = "00000000-0000-4000-8000-0000000000aa";

beforeEach(() => {
  vi.clearAllMocks();
  resetFakeOperator();
  for (const [name, value] of Object.entries({ INSTAGRAM_APP_ID: "app", INSTAGRAM_APP_SECRET: "secret", INSTAGRAM_REDIRECT_URI: "https://admin.test/callback", ENCRYPTION_KEY: "key" })) vi.stubEnv(name, value);
});
afterEach(() => vi.unstubAllEnvs());

describe("GET /api/integrations/instagram", () => {
  it("names the account and the agent it answers as", async () => {
    domain.getInstagramAccount.mockResolvedValue({ id: "11111111-1111-4111-8111-111111111111", username: "javor", status: "connected", connectedAt: new Date("2026-01-01T00:00:00.000Z"), agentId: AGENT });
    expect(await (await GET(new Request("https://admin.test/api/integrations/instagram"))).json()).toEqual({ configured: true, account: { id: "11111111-1111-4111-8111-111111111111", username: "javor", status: "connected", connectedAt: "2026-01-01T00:00:00.000Z", agentId: AGENT } });
  });

  it("reads no account where Instagram isn't set up", async () => {
    vi.stubEnv("INSTAGRAM_APP_ID", "");
    expect(await (await GET(new Request("https://admin.test/api/integrations/instagram"))).json()).toEqual({ configured: false, account: null });
    expect(domain.getInstagramAccount).not.toHaveBeenCalled();
  });
});
