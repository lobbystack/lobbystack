import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ read: vi.fn(), refresh: vi.fn(), context: { db: {} } }));
vi.mock("@lobbystack/db", () => ({ businessContextSnapshots: {}, withBusinessTransaction: mocks.read }));
vi.mock("@lobbystack/domain", () => ({ refreshBusinessSnapshot: mocks.refresh }));
vi.mock("./api-helpers", () => ({ getWorkerDatabase: () => ({ db: {} }) }));
vi.mock("./domain-context", () => ({ createWorkerDomainContext: () => mocks.context }));
import { loadValidBusinessSnapshot } from "./business-snapshot";

const snapshot = {
  businessId: "11111111-1111-4111-8111-111111111111", version: "1", generatedAt: new Date().toISOString(),
  displayName: "Certification", timezone: "UTC", defaultLocale: "en", businessType: "clinic",
  greeting: "Hello", voiceInstructions: "Be helpful", smsInstructions: "", chatInstructions: "Be helpful", summary: "Clinic",
  bookingPolicy: "Confirm availability", knowledgeDigest: "", transferPolicy: { mode: "never" },
  hours: [], closures: [], services: [], contactChannels: {},
};
describe("voice snapshot readiness", () => {
  it("preserves curated evidence and customer rules through validated API transport", async () => {
    const knowledgeSnippets = [{ id: "snippet", title: "Programme populaire", content: "Le BAA est notre programme le plus populaire.", tags: [], priority: 75 }];
    const rules = [{ id: "rule", title: "Callbacks", content: "Offer to take a callback message.", order: 1 }];
    mocks.read.mockResolvedValueOnce({ ...snapshot, knowledgeSnippets, rules, legalName: "HEC Montréal" });
    const transported = JSON.parse(JSON.stringify(await loadValidBusinessSnapshot(snapshot.businessId)));
    expect(transported.knowledgeSnippets).toEqual(knowledgeSnippets);
    expect(transported.rules).toEqual(rules);
    expect(transported.legalName).toBe("HEC Montréal");
  });
  beforeEach(() => { mocks.read.mockReset(); mocks.refresh.mockReset(); });
  it("generates a missing snapshot before the first voice session", async () => {
    mocks.read.mockResolvedValueOnce(null).mockResolvedValueOnce(snapshot);
    await expect(loadValidBusinessSnapshot(snapshot.businessId)).resolves.toMatchObject({ businessId: snapshot.businessId });
    expect(mocks.refresh).toHaveBeenCalledWith(mocks.context, { businessId: snapshot.businessId });
  });
  it("reuses an existing valid snapshot without rebuilding it", async () => {
    mocks.read.mockResolvedValueOnce(snapshot);
    await expect(loadValidBusinessSnapshot(snapshot.businessId)).resolves.toMatchObject({ businessId: snapshot.businessId });
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
