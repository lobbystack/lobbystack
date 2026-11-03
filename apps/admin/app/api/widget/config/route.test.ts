import { beforeEach, describe, expect, it, vi } from "vitest";

const businessId = "00000000-0000-4000-8000-000000000001";
const visitorId = "00000000-0000-4000-8000-000000000002";

const mocks = vi.hoisted(() => ({
  session: {} as { agentId?: string },
  snapshot: { greeting: "Hi! How can we help?", contactChannels: { phoneNumber: "+15145550100" } as { phoneNumber?: string }, agents: undefined as undefined | Array<{ id: string; greeting: string; phoneNumber: string | null }> },
  registerWidgetVisitor: vi.fn(),
  touchWidgetKeyLastUsed: vi.fn(),
}));

vi.mock("@/lib/widget-access", () => ({
  resolveWidgetSessionAccess: async () => ({
    ok: true,
    session: { ...mocks.session, businessId, widgetKeyId: "key-1", visitorId, origin: "https://business.test", businessName: "Acme Dental", businessSlug: "acme-dental", defaultLocale: "en", config: { title: "Acme Dental" } },
  }),
}));
vi.mock("@/lib/widget-policy", () => ({ enforceWidgetRateLimits: async () => ({ allowed: true }) }));
vi.mock("@/lib/widget-keys", () => ({ requestIpHash: () => "ip-hash", touchWidgetKeyLastUsed: mocks.touchWidgetKeyLastUsed }));
vi.mock("@/lib/domain-context", () => ({ createWorkerDomainContext: () => ({}) }));
vi.mock("@/lib/api-helpers", () => ({ asApiResponse: (error: unknown) => { throw error; } }));
vi.mock("@lobbystack/domain", () => ({
  businessHasPhoneNumber: (snapshot: typeof mocks.snapshot) => Boolean(snapshot.contactChannels.phoneNumber || snapshot.agents?.some((agent) => agent.phoneNumber)),
  snapshotForAgent: (snapshot: typeof mocks.snapshot, agentId?: string) => {
    if (!agentId || !snapshot.agents) return snapshot;
    const agent = snapshot.agents.find((candidate) => candidate.id === agentId);
    return agent ? { ...snapshot, greeting: agent.greeting } : null;
  },
  getCachedBusinessSnapshot: async () => mocks.snapshot,
  getWidgetChatAllowance: async () => ({ allowed: true, plan: "scale" }),
  getWebVoiceBillingAllowance: async () => ({ allowed: true }),
  registerWidgetVisitor: mocks.registerWidgetVisitor,
}));

import { GET } from "./route";

beforeEach(() => {
  mocks.registerWidgetVisitor.mockReset();
  mocks.touchWidgetKeyLastUsed.mockReset();
  mocks.session = {};
  mocks.snapshot = { greeting: "Hi! How can we help?", contactChannels: { phoneNumber: "+15145550100" }, agents: undefined };
});

describe("GET /api/widget/config", () => {
  it("sends the chat's settings without saving the visitor or the key's last use, which its session did", async () => {
    const response = await GET(new Request("http://localhost/api/widget/config", { headers: { authorization: "Bearer token" } }));

    expect(await response.json()).toEqual({
      key: "key-1",
      business: { id: businessId, name: "Acme Dental", defaultLocale: "en" },
      config: { title: "Acme Dental" },
      billing: { chatAllowed: true, plan: "scale", voiceAllowed: true },
      greeting: "Hi! How can we help?",
      snapshotPresent: true,
      businessSlug: "acme-dental",
      voiceEnabled: true,
    });
    expect(mocks.registerWidgetVisitor).not.toHaveBeenCalled();
    expect(mocks.touchWidgetKeyLastUsed).not.toHaveBeenCalled();
  });

  const config = async () => await (await GET(new Request("http://localhost/api/widget/config", { headers: { authorization: "Bearer token" } }))).json() as { greeting: string; voiceEnabled: boolean };

  it("greets as the key's agent, and offers voice when another agent holds the business's number", async () => {
    mocks.session = { agentId: "agent-b" };
    mocks.snapshot = { greeting: "Default", contactChannels: {}, agents: [{ id: "agent-a", greeting: "Default", phoneNumber: "+15145550100" }, { id: "agent-b", greeting: "Evening", phoneNumber: null }] };
    expect(await config()).toMatchObject({ greeting: "Evening", voiceEnabled: true });
  });

  it("shows the default agent's greeting for a key whose agent isn't in the snapshot yet", async () => {
    mocks.session = { agentId: "agent-new" };
    mocks.snapshot = { greeting: "Default", contactChannels: {}, agents: [{ id: "agent-a", greeting: "Default", phoneNumber: null }] };
    expect(await config()).toMatchObject({ greeting: "Default", voiceEnabled: false });
  });
});
