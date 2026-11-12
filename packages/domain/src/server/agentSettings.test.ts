import { defaultAppointmentChangePolicy, defaultGreeting, AGENT_INSTRUCTIONS_MAX_LENGTH, AGENT_TEXT_MAX_LENGTH } from "@lobbystack/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ enqueueOutbox: vi.fn() }));

vi.mock("@lobbystack/db", async (original) => ({
  ...(await original<typeof import("@lobbystack/db")>()),
  enqueueOutbox: mocks.enqueueOutbox,
}));

import { defaultAgentSettings, readAgentSettingsChange, saveAgentSettingsInTransaction } from "./agentSettings";

beforeEach(() => mocks.enqueueOutbox.mockReset());

// The dashboard answers with these messages, so moving the rules here must not reword them.
describe("readAgentSettingsChange", () => {
  it.each([
    [null, "A profile object is required."],
    [[], "A profile object is required."],
    [{}, "At least one profile field is required."],
    [{ greeting: "" }, "greeting is invalid."],
    [{ greeting: "   " }, "greeting is invalid."],
    [{ greeting: null }, "greeting cannot be empty."],
    [{ tone: 5 }, "tone must be a string."],
    [{ summary: "x".repeat(AGENT_TEXT_MAX_LENGTH + 1) }, "summary is invalid."],
    [{ voiceInstructions: "x".repeat(AGENT_INSTRUCTIONS_MAX_LENGTH + 1) }, "voiceInstructions is invalid."],
    [{ transferMode: "sometimes" }, "transferMode is invalid."],
    [{ bookingMode: "later" }, "bookingMode is invalid."],
    [{ voice: "nova" }, "voice is invalid."],
    [{ staffFirstMode: "weekends" }, "staffFirstMode is invalid."],
    [{ staffFirstMode: null }, "staffFirstMode cannot be empty."],
    [{ staffFirstRingSeconds: 12 }, "staffFirstRingSeconds is invalid."],
    [{ staffFirstRingSeconds: "15" }, "staffFirstRingSeconds is invalid."],
    [{ staffFirstMessage: "x".repeat(201) }, "staffFirstMessage is invalid."],
    [{ staffFirstHandoverMessage: "x".repeat(201) }, "staffFirstHandoverMessage is invalid."],
    [{ voice: "Marin" }, "voice is invalid."],
    [{ voice: null }, "voice is invalid."],
    [{ appointmentChangePolicy: {} }, "appointmentChangePolicy is invalid."],
    [{ appointmentChangePolicy: { enabled: true, allowCancel: true, allowReschedule: true, verificationMode: "email" } }, "appointmentChangePolicy is invalid."],
    [{ locale: "ja" }, "locale is invalid."],
    [{ teamLocale: "ja" }, "teamLocale is invalid."],
    [{ timezone: 5 }, "timezone must be a string."],
    [{ regenerateSummary: false }, "regenerateSummary must be true."],
    [{ regenerateSummary: true, summary: "Written by hand." }, "Send summary or regenerateSummary, not both."],
    // With several problems, the first check that fails names the field, as before.
    [{ transferMode: "sometimes", greeting: "" }, "greeting is invalid."],
    [{ bookingMode: "later", transferMode: "sometimes" }, "transferMode is invalid."],
    [{ locale: "ja", bookingMode: "later" }, "bookingMode is invalid."],
    [{ regenerateSummary: false, locale: "ja" }, "locale is invalid."],
  ])("refuses %j with a 400", (body, message) => {
    expect(() => readAgentSettingsChange(body)).toThrow(message);
    try {
      readAgentSettingsChange(body);
    } catch (error) {
      expect(error).toMatchObject({ status: 400, message });
    }
  });

  it("trims text, keeps only the fields sent, and clears optional ones with null", () => {
    expect(readAgentSettingsChange({ greeting: "  Hi there.  ", voiceInstructions: null, transferNumber: null, bookingMode: "request", locale: "fr" })).toEqual({
      patch: { greeting: "Hi there.", voiceInstructions: null, transferNumber: null, bookingMode: "request" },
      locale: "fr",
      regenerateSummary: false,
    });
  });

  it("keeps a voice from the shared list", () => {
    expect(readAgentSettingsChange({ voice: "cedar" })).toEqual({ patch: { voice: "cedar" }, regenerateSummary: false });
  });

  it("reads the team language, and null as going back to the customer language", () => {
    expect(readAgentSettingsChange({ teamLocale: "sr" })).toEqual({ patch: {}, teamLocale: "sr", regenerateSummary: false });
    expect(readAgentSettingsChange({ teamLocale: null })).toEqual({ patch: {}, teamLocale: null, regenerateSummary: false });
  });

  it("keeps only the policy's known fields, and the longest allowed text", () => {
    const policy = { enabled: true, allowCancel: false, allowReschedule: true, verificationMode: "otp_required" };
    const longest = "x".repeat(AGENT_TEXT_MAX_LENGTH);
    expect(readAgentSettingsChange({ appointmentChangePolicy: { ...policy, extra: "dropped" }, tone: longest }).patch).toEqual({ tone: longest, appointmentChangePolicy: policy });
  });

  it("takes a summary regeneration on its own", () => {
    expect(readAgentSettingsChange({ regenerateSummary: true })).toEqual({ patch: {}, regenerateSummary: true });
  });
});

describe("defaultAgentSettings", () => {
  it("greets callers with the business's name until someone writes a greeting", () => {
    expect(defaultAgentSettings("Maple Clinic")).toMatchObject({ greeting: defaultGreeting("Maple Clinic"), transferMode: "on_request", bookingMode: "instant", voice: "marin" });
  });
});

describe("saveAgentSettingsInTransaction", () => {
  const savedAt = new Date("2026-10-11T12:00:00.000Z");

  /**
   * Records what the save would write. `existing` is the agent the save finds,
   * or null for a business without one; `saved` is the row the write returns.
   */
  function store(existing: { id: string } | null, saved: Record<string, unknown> | null) {
    // `set` is the last write, the agent's; `sets` has every write, the business's summary first.
    const recorded: { values?: Record<string, unknown>; set?: Record<string, unknown>; sets: Array<Record<string, unknown>> } = { sets: [] };
    // The agent's channel rules, which the row returned reads its instructions from, come back empty.
    const rows = (value: unknown[]) => ({ limit: async () => value, orderBy: async () => [] });
    const tx = {
      select: () => ({ from: () => ({ where: () => rows(existing ? [existing] : []) }) }),
      update: () => ({ set: (set: Record<string, unknown>) => { recorded.set = set; recorded.sets.push(set); return { where: () => ({ returning: async () => (saved ? [saved] : []) }) }; } }),
      insert: () => ({
        values: (values: Record<string, unknown>) => {
          recorded.values = values;
          return { onConflictDoNothing: () => ({ returning: async () => (saved ? [saved] : []) }) };
        },
      }),
    };
    return { tx: tx as never, recorded };
  }

  it("changes only the fields sent on the default agent, and refreshes the snapshot", async () => {
    const { tx, recorded } = store({ id: "profile_1" }, { id: "profile_1", updatedAt: savedAt });
    expect(await saveAgentSettingsInTransaction(tx, { businessId: "biz_1", businessName: "Maple", patch: { tone: "warm" } })).toMatchObject({ id: "profile_1" });
    expect(recorded.values).toBeUndefined();
    expect(recorded.set).toEqual({ tone: "warm", updatedAt: expect.any(Date) });
    expect(mocks.enqueueOutbox).toHaveBeenCalledTimes(1);
    expect(mocks.enqueueOutbox).toHaveBeenCalledWith(tx, expect.objectContaining({ topic: "snapshot.refresh", businessId: "biz_1", aggregateType: "agent", aggregateId: "profile_1", dedupeKey: `snapshot:biz_1:profile:${savedAt.toISOString()}`, payload: { businessId: "biz_1", reason: "agent_updated" } }));
  });

  it("creates a missing default agent from the defaults and the fields sent", async () => {
    const { tx, recorded } = store(null, { id: "profile_1", updatedAt: savedAt });
    expect(await saveAgentSettingsInTransaction(tx, { businessId: "biz_1", businessName: "Maple", patch: { tone: "warm" } })).toMatchObject({ id: "profile_1" });
    expect(recorded.values).toMatchObject({ businessId: "biz_1", isDefault: true, greeting: defaultGreeting("Maple"), tone: "warm", transferMode: "on_request", appointmentChangePolicy: defaultAppointmentChangePolicy });
    expect(recorded.values).not.toHaveProperty("summary");
  });

  it("refuses an agent the business doesn't have", async () => {
    const { tx } = store(null, null);
    await expect(saveAgentSettingsInTransaction(tx, { businessId: "biz_1", agentId: "agent_2", businessName: "Maple", patch: { tone: "warm" } })).rejects.toMatchObject({ status: 404, code: "agent_not_found" });
    expect(mocks.enqueueOutbox).not.toHaveBeenCalled();
  });

  it("saves a written summary on the business, as the business's own", async () => {
    const { tx, recorded } = store({ id: "profile_1" }, { id: "profile_1", updatedAt: savedAt });
    await saveAgentSettingsInTransaction(tx, { businessId: "biz_1", businessName: "Maple", patch: { summary: "Maple cuts hair." } });
    expect(recorded.sets[0]).toMatchObject({ summary: "Maple cuts hair.", summarySource: "operator", summaryRegenerateStatus: null });
    expect(recorded.set).toEqual({ updatedAt: expect.any(Date) });
  });

  it("hands the summary back to AI and queues the rewrite", async () => {
    const { tx, recorded } = store({ id: "profile_1" }, { id: "profile_1", updatedAt: savedAt });
    await saveAgentSettingsInTransaction(tx, { businessId: "biz_1", businessName: "Maple", patch: {}, regenerateSummary: true });
    expect(recorded.sets[0]).toMatchObject({ summarySource: "generated", summaryRegenerateStatus: "pending" });
    expect(mocks.enqueueOutbox).toHaveBeenLastCalledWith(tx, expect.objectContaining({ topic: "business.generateSummary", businessId: "biz_1", payload: { businessId: "biz_1", reason: "operator_regenerate", force: true } }));
  });

  it("returns null and queues nothing when nothing was saved", async () => {
    const { tx } = store({ id: "profile_1" }, null);
    expect(await saveAgentSettingsInTransaction(tx, { businessId: "biz_1", businessName: "Maple", patch: { tone: "warm" } })).toBeNull();
    expect(mocks.enqueueOutbox).not.toHaveBeenCalled();
  });
});
