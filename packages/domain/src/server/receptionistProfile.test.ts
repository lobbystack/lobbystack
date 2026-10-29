import { defaultAppointmentChangePolicy, defaultGreeting, RECEPTIONIST_INSTRUCTIONS_MAX_LENGTH, RECEPTIONIST_TEXT_MAX_LENGTH } from "@lobbystack/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ enqueueOutbox: vi.fn() }));

vi.mock("@lobbystack/db", async (original) => ({
  ...(await original<typeof import("@lobbystack/db")>()),
  enqueueOutbox: mocks.enqueueOutbox,
}));

import { defaultReceptionistProfile, readReceptionistSettingsChange, saveReceptionistProfileInTransaction } from "./receptionistProfile";

beforeEach(() => mocks.enqueueOutbox.mockReset());

// The dashboard answers with these messages, so moving the rules here must not reword them.
describe("readReceptionistSettingsChange", () => {
  it.each([
    [null, "A profile object is required."],
    [[], "A profile object is required."],
    [{}, "At least one profile field is required."],
    [{ greeting: "" }, "greeting is invalid."],
    [{ greeting: "   " }, "greeting is invalid."],
    [{ greeting: null }, "greeting cannot be empty."],
    [{ tone: 5 }, "tone must be a string."],
    [{ summary: "x".repeat(RECEPTIONIST_TEXT_MAX_LENGTH + 1) }, "summary is invalid."],
    [{ voiceInstructions: "x".repeat(RECEPTIONIST_INSTRUCTIONS_MAX_LENGTH + 1) }, "voiceInstructions is invalid."],
    [{ transferMode: "sometimes" }, "transferMode is invalid."],
    [{ bookingMode: "later" }, "bookingMode is invalid."],
    [{ voice: "nova" }, "voice is invalid."],
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
    expect(() => readReceptionistSettingsChange(body)).toThrow(message);
    try {
      readReceptionistSettingsChange(body);
    } catch (error) {
      expect(error).toMatchObject({ status: 400, message });
    }
  });

  it("trims text, keeps only the fields sent, and clears optional ones with null", () => {
    expect(readReceptionistSettingsChange({ greeting: "  Hi there.  ", voiceInstructions: null, transferNumber: null, bookingMode: "request", locale: "fr" })).toEqual({
      patch: { greeting: "Hi there.", voiceInstructions: null, transferNumber: null, bookingMode: "request" },
      locale: "fr",
      regenerateSummary: false,
    });
  });

  it("keeps a voice from the shared list", () => {
    expect(readReceptionistSettingsChange({ voice: "cedar" })).toEqual({ patch: { voice: "cedar" }, regenerateSummary: false });
  });

  it("reads the team language, and null as going back to the customer language", () => {
    expect(readReceptionistSettingsChange({ teamLocale: "sr" })).toEqual({ patch: {}, teamLocale: "sr", regenerateSummary: false });
    expect(readReceptionistSettingsChange({ teamLocale: null })).toEqual({ patch: {}, teamLocale: null, regenerateSummary: false });
  });

  it("keeps only the policy's known fields, and the longest allowed text", () => {
    const policy = { enabled: true, allowCancel: false, allowReschedule: true, verificationMode: "otp_required" };
    const longest = "x".repeat(RECEPTIONIST_TEXT_MAX_LENGTH);
    expect(readReceptionistSettingsChange({ appointmentChangePolicy: { ...policy, extra: "dropped" }, tone: longest }).patch).toEqual({ tone: longest, appointmentChangePolicy: policy });
  });

  it("takes a summary regeneration on its own", () => {
    expect(readReceptionistSettingsChange({ regenerateSummary: true })).toEqual({ patch: {}, regenerateSummary: true });
  });
});

describe("defaultReceptionistProfile", () => {
  it("greets callers with the business's name until someone writes a greeting", () => {
    expect(defaultReceptionistProfile("Maple Clinic")).toMatchObject({ greeting: defaultGreeting("Maple Clinic"), summary: "Maple Clinic", summarySource: "placeholder", transferMode: "on_request", bookingMode: "instant", voice: "marin" });
  });
});

describe("saveReceptionistProfileInTransaction", () => {
  const savedAt = new Date("2026-10-11T12:00:00.000Z");

  /** Records what the upsert would write, and returns `saved` as the stored row. */
  function upsert(saved: Record<string, unknown> | null) {
    const recorded: { values?: Record<string, unknown>; set?: Record<string, unknown> } = {};
    const tx = {
      insert: () => ({
        values: (values: Record<string, unknown>) => {
          recorded.values = values;
          return { onConflictDoUpdate: (config: { set: Record<string, unknown> }) => { recorded.set = config.set; return { returning: async () => (saved ? [saved] : []) }; } };
        },
      }),
    };
    return { tx: tx as never, recorded };
  }

  it("creates a missing profile from the defaults, changes only the fields sent, and refreshes the snapshot", async () => {
    const { tx, recorded } = upsert({ id: "profile_1", updatedAt: savedAt });
    expect(await saveReceptionistProfileInTransaction(tx, { businessId: "biz_1", businessName: "Maple", patch: { tone: "warm" } })).toMatchObject({ id: "profile_1" });
    expect(recorded.values).toMatchObject({ businessId: "biz_1", greeting: defaultGreeting("Maple"), tone: "warm", summary: "Maple", summarySource: "placeholder", transferMode: "on_request", appointmentChangePolicy: defaultAppointmentChangePolicy });
    expect(recorded.set).toEqual({ tone: "warm", updatedAt: expect.any(Date) });
    expect(mocks.enqueueOutbox).toHaveBeenCalledTimes(1);
    expect(mocks.enqueueOutbox).toHaveBeenCalledWith(tx, expect.objectContaining({ topic: "snapshot.refresh", businessId: "biz_1", aggregateType: "receptionist_profile", aggregateId: "profile_1", dedupeKey: `snapshot:biz_1:profile:${savedAt.toISOString()}` }));
  });

  it("marks a written summary as the business's own", async () => {
    const { tx, recorded } = upsert({ id: "profile_1", updatedAt: savedAt });
    await saveReceptionistProfileInTransaction(tx, { businessId: "biz_1", businessName: "Maple", patch: { summary: "Maple cuts hair." } });
    expect(recorded.values).toMatchObject({ summary: "Maple cuts hair.", summarySource: "operator" });
    expect(recorded.set).toMatchObject({ summary: "Maple cuts hair.", summarySource: "operator" });
  });

  it("hands the summary back to AI and queues the rewrite", async () => {
    const { tx, recorded } = upsert({ id: "profile_1", updatedAt: savedAt });
    await saveReceptionistProfileInTransaction(tx, { businessId: "biz_1", businessName: "Maple", patch: {}, regenerateSummary: true });
    expect(recorded.set).toMatchObject({ summarySource: "generated" });
    expect(mocks.enqueueOutbox).toHaveBeenLastCalledWith(tx, expect.objectContaining({ topic: "business.generateSummary", businessId: "biz_1", payload: { businessId: "biz_1", reason: "operator_regenerate", force: true } }));
  });

  it("returns null and queues nothing when nothing was saved", async () => {
    const { tx } = upsert(null);
    expect(await saveReceptionistProfileInTransaction(tx, { businessId: "biz_1", businessName: "Maple", patch: { tone: "warm" } })).toBeNull();
    expect(mocks.enqueueOutbox).not.toHaveBeenCalled();
  });
});
