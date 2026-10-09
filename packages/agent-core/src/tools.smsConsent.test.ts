import { demoSnapshot, type BusinessContextSnapshot } from "@lobbystack/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { z } from "zod";

vi.mock("@lobbystack/domain", async () => ({
  countKnowledgeTokens: (await import("../../domain/src/knowledgeRanking")).countKnowledgeTokens,
  KNOWLEDGE_SEARCH_TOKEN_BUDGET: 3000,
  knowledgeQueryTerms: (await import("../../domain/src/knowledgeRanking")).knowledgeQueryTerms,
  checkOpening: vi.fn(async () => ({ ok: true, serviceName: "General Checkup", available: true })),
  findCallerBooking: vi.fn(async () => undefined),
  bookForCaller: vi.fn(async () => ({ ok: true, appointmentId: "apt_1" })),
  findOpenings: vi.fn(async () => ({ ok: true, serviceName: "General Checkup", date: "2026-10-06", timezone: "America/Toronto", openings: [{ startsAt: "2026-10-06T14:00:00.000Z", displayTime: "Tuesday Oct 6, 10:00 AM" }] })),
  getSmsConsentOnFile: vi.fn(async () => "subscribed"),
  verifyCallerForChange: vi.fn(),
  verifyCallerChangeCode: vi.fn(),
  cancelForCaller: vi.fn(),
  recordTextConsentForCaller: vi.fn(async () => "subscribed"),
}));

import { cancelForCaller, getSmsConsentOnFile, recordTextConsentForCaller, verifyCallerChangeCode, verifyCallerForChange } from "@lobbystack/domain";
import { createReceptionistTools, type AgentChannel } from "./tools";

type Execute = (input: object, options: object) => Promise<Record<string, unknown>>;

const callerPhone = "+14165550100";
// A toll-free number can't text a number outside North America.
const tollFree = { contactChannels: { smsNumber: "+18445550100" } };

function tools(options: { channel?: AgentChannel; callerPhone?: string | undefined; callId?: string | undefined; snapshot?: Partial<BusinessContextSnapshot> } = {}) {
  const set = createReceptionistTools({
    domain: { db: {} as never },
    channel: options.channel ?? "voice",
    ...("callId" in options ? (options.callId ? { callId: options.callId } : {}) : { callId: "call_1" }),
    ...("callerPhone" in options ? (options.callerPhone ? { callerPhone: options.callerPhone } : {}) : { callerPhone }),
    snapshot: { ...demoSnapshot, timezone: "America/Toronto", appointmentChangePolicy: { enabled: true, allowCancel: true, allowReschedule: true, verificationMode: "phone_match_and_facts" }, ...options.snapshot },
  });
  const run = (name: string, input: object) => (set[name]!.execute! as Execute)(input, { toolCallId: "1", messages: [] });
  const schema = (name: string) => set[name]!.inputSchema as unknown as z.ZodType;
  return { set, run, schema };
}

const verified = { ok: true, verified: true, requiresOtp: false, verificationId: "ver_1", appointmentId: "apt_1", status: "facts_verified" };

beforeEach(() => { vi.clearAllMocks(); });

describe("recordTextPreference", () => {
  it("saves the caller's answer for the call's own number and says what it means", async () => {
    await expect(tools().run("recordTextPreference", { answer: "agreed" })).resolves.toEqual({ ok: true, smsConsentOnFile: "subscribed", result: "Saved: the caller will get texts about their appointments." });
    expect(recordTextConsentForCaller).toHaveBeenCalledWith(expect.anything(), { businessId: demoSnapshot.businessId, callId: "call_1", callerPhone, answer: "agreed" });
    vi.mocked(recordTextConsentForCaller).mockResolvedValueOnce("opted_out");
    await expect(tools().run("recordTextPreference", { answer: "agreed" })).resolves.toMatchObject({ ok: true, smsConsentOnFile: "opted_out", result: expect.stringContaining("opted out") });
    vi.mocked(recordTextConsentForCaller).mockResolvedValueOnce(null);
    await expect(tools().run("recordTextPreference", { answer: "declined" })).resolves.toMatchObject({ ok: false });
  });

  it("is only offered on a phone call the business can text back", async () => {
    for (const set of [tools({ channel: "web_chat", callerPhone: undefined }), tools({ channel: "web_voice", callerPhone: undefined }), tools({ callerPhone: "+381695021111", snapshot: tollFree }), tools({ snapshot: { contactChannels: {} } }), tools({ callId: undefined })]) {
      expect(set.set).not.toHaveProperty("recordTextPreference");
    }
    expect(tools().set).toHaveProperty("recordTextPreference");
    expect(tools().schema("bookAppointment").safeParse({ serviceName: "General Checkup", startsAt: "2026-10-06T10:00" }).success).toBe(true);
  });
});

describe("findAvailability", () => {
  it("returns the answer on file for the call's own number, so the agent asks only once", async () => {
    await expect(tools().run("findAvailability", { serviceName: "General Checkup", date: "2026-10-06" })).resolves.toMatchObject({ ok: true, smsConsentOnFile: "subscribed" });
    expect(getSmsConsentOnFile).toHaveBeenCalledWith(expect.anything(), { businessId: demoSnapshot.businessId, phone: callerPhone });
  });

  it("looks nothing up without a trusted number, or when the business can't text the caller", async () => {
    for (const set of [tools({ channel: "web_chat", callerPhone: undefined }), tools({ channel: "web_voice", callerPhone: undefined }), tools({ callerPhone: "+381695021111", snapshot: tollFree }), tools({ snapshot: { contactChannels: {} } })]) {
      expect(await set.run("findAvailability", { serviceName: "General Checkup", date: "2026-10-06" })).not.toHaveProperty("smsConsentOnFile");
    }
    expect(getSmsConsentOnFile).not.toHaveBeenCalled();
  });

  it("still returns the openings when the lookup fails", async () => {
    vi.mocked(getSmsConsentOnFile).mockRejectedValueOnce(new Error("database unavailable"));
    const result = await tools().run("findAvailability", { serviceName: "General Checkup", date: "2026-10-06" });
    expect(result).toMatchObject({ ok: true, openings: [expect.objectContaining({ startsAt: "2026-10-06T14:00:00.000Z" })] });
    expect(result).not.toHaveProperty("smsConsentOnFile");
  });
});

describe("verifying a cancellation", () => {
  it.each(["subscribed", "declined", "opted_out", "not_asked"] as const)("gives the agent the answer on file (%s) once verified", async (smsConsentOnFile) => {
    vi.mocked(verifyCallerForChange).mockResolvedValueOnce({ ...verified, smsConsentOnFile } as never);
    await expect(tools().run("verifyAppointmentForChange", { action: "cancel", serviceName: "General Checkup" })).resolves.toMatchObject({ verified: true, smsConsentOnFile });
    vi.mocked(verifyCallerChangeCode).mockResolvedValueOnce({ ok: true, status: "otp_verified", verificationId: "ver_1", smsConsentOnFile } as never);
    await expect(tools().run("verifyAppointmentChangeOtp", { verificationId: "ver_1", code: "123456" })).resolves.toMatchObject({ ok: true, smsConsentOnFile });
  });

  it("leaves it out when the business can't text the caller", async () => {
    vi.mocked(verifyCallerForChange).mockResolvedValueOnce({ ...verified, smsConsentOnFile: "subscribed" } as never);
    await expect(tools({ snapshot: { contactChannels: {} } }).run("verifyAppointmentForChange", { action: "cancel", serviceName: "General Checkup" })).resolves.toEqual(verified);
  });
});

describe("cancelAppointment", () => {
  const cancel = { appointmentId: "apt_1", verificationId: "ver_1", finalConfirmation: true };
  const cancelled = { ok: true, appointmentId: "apt_1", startsAt: "2026-10-06T14:00:00.000Z", status: "canceled" };

  it("says a text is coming when the caller gets texts", async () => {
    vi.mocked(cancelForCaller).mockResolvedValueOnce({ ...cancelled, smsConsentOnFile: "subscribed" } as never);
    await expect(tools().run("cancelAppointment", cancel)).resolves.toEqual({ ...cancelled, smsConsentOnFile: "subscribed", textConfirmation: "The caller will get a text confirming the cancellation." });
    expect(cancelForCaller).toHaveBeenCalledWith(expect.anything(), { businessId: demoSnapshot.businessId, callerPhone, ...cancel });
  });

  it.each(["declined", "opted_out", "not_asked"] as const)("promises no text when the answer on file is %s", async (smsConsentOnFile) => {
    vi.mocked(cancelForCaller).mockResolvedValueOnce({ ...cancelled, smsConsentOnFile } as never);
    await expect(tools().run("cancelAppointment", cancel)).resolves.toEqual({ ...cancelled, smsConsentOnFile });
  });

  it("promises nothing when the business can't text the caller", async () => {
    vi.mocked(cancelForCaller).mockResolvedValueOnce({ ...cancelled, smsConsentOnFile: "subscribed" } as never);
    await expect(tools({ snapshot: { contactChannels: {} } }).run("cancelAppointment", cancel)).resolves.toEqual(cancelled);
  });
});
