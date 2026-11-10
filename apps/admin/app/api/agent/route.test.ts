import { beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ insert: vi.fn(), conflict: vi.fn(), update: vi.fn(), enqueue: vi.fn(), business: {} as Record<string, unknown>, profile: undefined as Record<string, unknown> | undefined }));
vi.mock("@/lib/operator-request", () => import("@/lib/operator-request.fake"));
vi.mock("@lobbystack/db", async (original) => ({ ...await original<typeof import("@lobbystack/db")>(), enqueueOutbox: fixture.enqueue }));
const domain = vi.hoisted(() => ({ requireActiveAgentInTransaction: vi.fn(), staffFirstBlockInTransaction: vi.fn() }));
vi.mock("@lobbystack/domain", async (original) => ({ ...await original<typeof import("@lobbystack/domain")>(), ...domain }));
import { agents } from "@lobbystack/db";
import { defaultGreeting, runtimeLocales } from "@lobbystack/shared";
import { fakeOperator, resetFakeOperator } from "@/lib/operator-request.fake";
import { GET, PATCH } from "./route";
const patch = (body: unknown) => PATCH(new Request("http://localhost:3000/api/agent", { method: "PATCH", body: JSON.stringify(body) }));
beforeEach(() => {
  vi.clearAllMocks();
  resetFakeOperator();
  fixture.business = { name: "Clinic", defaultLocale: "en" };
  fixture.profile = undefined;
  fakeOperator.tx = {
    select: () => ({ from: (table: unknown) => ({ where: () => ({ limit: async () => table === agents ? (fixture.profile ? [{ id: "profile", ...fixture.profile }] : []) : [fixture.business], for: async () => [{ timezone: "America/Toronto", ...fixture.business }] }) }) }),
    // A business without an agent gets one from the defaults; one with an agent has it updated, which `conflict` records.
    insert: () => ({ values: (value: unknown) => { fixture.insert(value); return { onConflictDoNothing: () => ({ returning: async () => [{ id: "profile", updatedAt: new Date(0) }] }) }; } }),
    update: (table: unknown) => ({ set: (value: unknown) => { fixture.update(value); if (table === agents) fixture.conflict(value); return { where: () => ({ returning: async () => [table === agents ? { id: "profile", updatedAt: new Date(0) } : { id: "business" }] }) }; } }),
  };
});

const AGENT = "00000000-0000-4000-8000-000000000001";
const get = (query = "") => GET(new Request(`http://localhost:3000/api/agent${query}`));

describe("reading one agent's settings", () => {
  it("reads the default agent without an agentId, as before", async () => {
    fixture.profile = { greeting: "Default here" };
    domain.staffFirstBlockInTransaction.mockResolvedValue(null);
    expect(await (await get()).json()).toMatchObject({ business: { name: "Clinic" }, profile: { id: "profile", greeting: "Default here" }, staffFirstBlock: null });
    expect(domain.requireActiveAgentInTransaction).not.toHaveBeenCalled();
    expect(domain.staffFirstBlockInTransaction).toHaveBeenCalledWith(expect.anything(), "business", undefined);
  });

  it("reads the agent named, with the staff-first block of its own numbers", async () => {
    domain.requireActiveAgentInTransaction.mockResolvedValue({ id: AGENT, greeting: "Evening here" });
    domain.staffFirstBlockInTransaction.mockResolvedValue("carrier");
    expect(await (await get(`?agentId=${AGENT}`)).json()).toMatchObject({ profile: { id: AGENT, greeting: "Evening here" }, staffFirstBlock: "carrier" });
    expect(domain.requireActiveAgentInTransaction).toHaveBeenCalledWith(expect.anything(), "business", AGENT);
    expect(domain.staffFirstBlockInTransaction).toHaveBeenCalledWith(expect.anything(), "business", AGENT);
  });

  it("refuses an agentId that isn't a UUID and passes an unknown agent's 404 on", async () => {
    expect((await get("?agentId=evening")).status).toBe(400);
    domain.requireActiveAgentInTransaction.mockRejectedValue(Object.assign(new Error("Agent not found."), { status: 404, code: "agent_not_found" }));
    expect((await get(`?agentId=${AGENT}`)).status).toBe(404);
  });
});

describe("agent settings validation", () => {
  it.each([{}, { locale: "xx" }, { locale: "pt-BR" }, { locale: "ja" }, { timezone: "Eastern" }, { timezone: "+05:00" }, { timezone: 5 }, { greeting: "" }, { transferMode: "invalid" }, { appointmentChangePolicy: {} }])("rejects invalid input %j before writing", async (body) => {
    expect((await patch(body)).status).toBe(400);
    expect(fixture.insert).not.toHaveBeenCalled();
    expect(fixture.enqueue).not.toHaveBeenCalled();
  });
  it.each(runtimeLocales)("accepts the caller language %s", async (locale) => {
    expect((await patch({ locale })).status).toBe(200);
    expect(fixture.update).toHaveBeenCalledWith(expect.objectContaining({ defaultLocale: locale }));
  });
  it("names the field that is wrong, with the same message as before the rules moved to the domain", async () => {
    expect(await (await patch({ greeting: "" })).json()).toEqual({ error: "greeting is invalid." });
    expect(await (await patch({ bookingMode: "later" })).json()).toEqual({ error: "bookingMode is invalid." });
    expect(await (await patch({})).json()).toEqual({ error: "At least one profile field is required." });
  });
  it("persists locale-only changes and refreshes the live-call snapshot", async () => {
    expect((await patch({ locale: "fr" })).status).toBe(200);
    expect(fixture.update).toHaveBeenCalledWith(expect.objectContaining({ defaultLocale: "fr" }));
    expect(fixture.enqueue).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ topic: "snapshot.refresh", businessId: "business" }));
  });
  it("persists the business timezone and refreshes the live-call snapshot", async () => {
    expect((await patch({ timezone: "Europe/Belgrade" })).status).toBe(200);
    expect(fixture.update).toHaveBeenCalledWith(expect.objectContaining({ timezone: "Europe/Belgrade" }));
    expect(fixture.enqueue).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ topic: "snapshot.refresh", businessId: "business" }));
  });
  it("persists the typed appointment policy without unrecognized properties", async () => {
    const policy = { enabled: true, allowCancel: false, allowReschedule: true, verificationMode: "otp_required" };
    expect((await patch({ appointmentChangePolicy: { ...policy, arbitrary: "discard" } })).status).toBe(200);
    expect(fixture.insert).toHaveBeenCalledWith(expect.objectContaining({ appointmentChangePolicy: policy }));
  });
  it("saves the keypad PIN check", async () => {
    const policy = { enabled: true, allowCancel: true, allowReschedule: true, verificationMode: "passcode_required" };
    expect((await patch({ appointmentChangePolicy: policy })).status).toBe(200);
    expect(fixture.insert).toHaveBeenCalledWith(expect.objectContaining({ appointmentChangePolicy: policy }));
  });
  it("marks a summary a person writes so AI never replaces it", async () => {
    expect((await patch({ summary: "Maple Family Clinic offers checkups in Toronto." })).status).toBe(200);
    expect(fixture.insert).toHaveBeenCalledWith(expect.objectContaining({ summary: "Maple Family Clinic offers checkups in Toronto.", summarySource: "operator" }));
    fixture.profile = { greeting: "Hi" };
    expect((await patch({ summary: "Maple Family Clinic offers checkups in Toronto." })).status).toBe(200);
    expect(fixture.conflict).toHaveBeenCalledWith(expect.objectContaining({ summarySource: "operator" }));
  });
  it("hands the summary back to AI and queues a regeneration", async () => {
    fixture.profile = { greeting: "Hi" };
    expect((await patch({ regenerateSummary: true })).status).toBe(200);
    expect(fixture.conflict).toHaveBeenCalledWith(expect.objectContaining({ summarySource: "generated" }));
    expect(fixture.enqueue).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ topic: "business.generateSummary", businessId: "business", payload: expect.objectContaining({ force: true }) }));
  });
  it.each([{ regenerateSummary: false }, { regenerateSummary: true, summary: "Written by hand." }])("rejects an unclear summary request %j", async (body) => {
    expect((await patch(body)).status).toBe(400);
    expect(fixture.enqueue).not.toHaveBeenCalled();
  });
  it("requires administrator access before any mutation", async () => {
    fakeOperator.denied = Object.assign(new Error("Forbidden"), { status: 403 });
    expect((await patch({ transferMode: "always" })).status).toBe(403);
    expect(fakeOperator.transactions).toEqual([{ minimumRole: "business_admin" }]);
    expect(fixture.insert).not.toHaveBeenCalled();
  });
});

describe("the greeting when the caller language changes", () => {
  it("switches a default greeting to the new language's default", async () => {
    fixture.profile = { greeting: defaultGreeting("Clinic", "en") };
    expect((await patch({ locale: "de" })).status).toBe(200);
    expect(fixture.update).toHaveBeenCalledWith(expect.objectContaining({ greeting: defaultGreeting("Clinic", "de") }));
  });
  it("switches the English default that older businesses have", async () => {
    fixture.profile = { greeting: "Thanks for calling Clinic." };
    expect((await patch({ locale: "es" })).status).toBe(200);
    expect(fixture.update).toHaveBeenCalledWith(expect.objectContaining({ greeting: defaultGreeting("Clinic", "es") }));
  });
  it("keeps a greeting the owner edited", async () => {
    fixture.profile = { greeting: "Welcome to Clinic, how can we help?" };
    expect((await patch({ locale: "de" })).status).toBe(200);
    expect(fixture.update).not.toHaveBeenCalledWith(expect.objectContaining({ greeting: expect.anything() }));
    expect(fixture.conflict).toHaveBeenCalledWith(expect.not.objectContaining({ greeting: expect.anything() }));
  });
  it("keeps the greeting sent with the language", async () => {
    fixture.profile = { greeting: defaultGreeting("Clinic", "en") };
    expect((await patch({ locale: "de", greeting: "Hallo, hier ist Clinic." })).status).toBe(200);
    expect(fixture.conflict).toHaveBeenCalledWith(expect.objectContaining({ greeting: "Hallo, hier ist Clinic." }));
  });
  it("compares against the default of the business's current language", async () => {
    fixture.business = { name: "Clinic", defaultLocale: "fr" };
    fixture.profile = { greeting: defaultGreeting("Clinic", "fr") };
    expect((await patch({ locale: "it" })).status).toBe(200);
    expect(fixture.update).toHaveBeenCalledWith(expect.objectContaining({ greeting: defaultGreeting("Clinic", "it") }));
  });
  it("gives a business without a profile the default in its new language", async () => {
    expect((await patch({ locale: "nl" })).status).toBe(200);
    expect(fixture.insert).toHaveBeenCalledWith(expect.objectContaining({ greeting: defaultGreeting("Clinic", "nl") }));
  });
});
