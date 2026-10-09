import { demoSnapshot, type BusinessContextSnapshot } from "@lobbystack/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { z } from "zod";

vi.mock("@lobbystack/domain", async () => ({
  countKnowledgeTokens: (await import("../../domain/src/knowledgeRanking")).countKnowledgeTokens,
  KNOWLEDGE_SEARCH_TOKEN_BUDGET: 3000,
  knowledgeQueryTerms: (await import("../../domain/src/knowledgeRanking")).knowledgeQueryTerms,
  checkOpening: vi.fn(async () => ({ ok: true, serviceName: "General Checkup", available: true })),
  findCallerBooking: vi.fn(async () => undefined),
  findCallBooking: vi.fn(async () => undefined),
  bookForCaller: vi.fn(async () => ({ ok: true, appointmentId: "apt_1" })),
  findOpenings: vi.fn(async () => ({ ok: true, serviceName: "General Checkup", date: "2026-10-06", timezone: "America/Toronto", openings: [{ startsAt: "2026-10-06T14:00:00.000Z", displayTime: "Tuesday Oct 6, 10:00 AM" }] })),
  getSmsConsentOnFile: vi.fn(async () => "subscribed"),
  verifyCallerForChange: vi.fn(),
  verifyCallerChangeCode: vi.fn(),
  cancelForCaller: vi.fn(),
}));

import { bookForCaller, cancelForCaller, getSmsConsentOnFile, verifyCallerChangeCode, verifyCallerForChange } from "@lobbystack/domain";
import { createReceptionistTools, type AgentChannel } from "./tools";

type Execute = (input: object, options: object) => Promise<Record<string, unknown>>;

const callerPhone = "+14165550100";
// A toll-free number can't text a number outside North America.
const tollFree = { contactChannels: { smsNumber: "+18445550100" } };

function tools(options: { channel?: AgentChannel; callerPhone?: string | undefined; snapshot?: Partial<BusinessContextSnapshot> } = {}) {
  const set = createReceptionistTools({
    domain: { db: {} as never },
    channel: options.channel ?? "voice",
    ...("callerPhone" in options ? (options.callerPhone ? { callerPhone: options.callerPhone } : {}) : { callerPhone }),
    snapshot: { ...demoSnapshot, timezone: "America/Toronto", appointmentChangePolicy: { enabled: true, allowCancel: true, allowReschedule: true, verificationMode: "phone_match_and_facts" }, ...options.snapshot },
  });
  const run = (name: string, input: object) => (set[name]!.execute! as Execute)(input, { toolCallId: "1", messages: [] });
  const schema = (name: string) => set[name]!.inputSchema as unknown as z.ZodType;
  return { set, run, schema };
}

const booking = { serviceName: "General Checkup", startsAt: "2026-10-06T10:00", contactName: "Milan" };
const verified = { ok: true, verified: true, requiresOtp: false, verificationId: "ver_1", appointmentId: "apt_1", status: "facts_verified" };

// The fixtures use early October 2026: keep those times in the future.
vi.setSystemTime(new Date("2026-10-01T12:00:00Z"));
beforeEach(() => { vi.clearAllMocks(); });

describe("tool schemas for texts", () => {
  it("makes bookAppointment take an explicit answer, not a yes or no", () => {
    const schema = tools().schema("bookAppointment");
    for (const smsConsent of ["agreed", "declined", "not_asked"]) expect(schema.safeParse({ ...booking, smsConsent }).success).toBe(true);
    expect(schema.safeParse({ ...booking, smsConsent: true }).success).toBe(false);
    expect(schema.safeParse(booking).success).toBe(false);
  });

  it("lets cancelAppointment take the caller's answer, or nothing when the agent didn't ask", () => {
    const schema = tools().schema("cancelAppointment");
    const cancel = { appointmentId: "apt_1", verificationId: "ver_1", finalConfirmation: true };
    expect(schema.safeParse(cancel).success).toBe(true);
    for (const smsConsent of ["agreed", "declined"]) expect(schema.safeParse({ ...cancel, smsConsent }).success).toBe(true);
    expect(schema.safeParse({ ...cancel, smsConsent: "not_asked" }).success).toBe(false);
  });
});

describe("bookAppointment", () => {
  it.each(["agreed", "declined", "not_asked"] as const)("passes the caller's answer (%s) to the booking", async (smsConsent) => {
    await tools().run("bookAppointment", { ...booking, smsConsent });
    expect(vi.mocked(bookForCaller).mock.lastCall?.[1]).toMatchObject({ contactPhone: callerPhone, smsConsent });
  });

  it.each(["web_chat", "web_voice"] as const)("records no answer from a %s, even one the visitor gave", async (channel) => {
    for (const smsConsent of ["agreed", "declined"] as const) {
      const result = await tools({ channel, callerPhone: undefined }).run("bookAppointment", { ...booking, contactPhone: callerPhone, smsConsent });
      expect(vi.mocked(bookForCaller).mock.lastCall?.[1]).toMatchObject({ channel, contactPhone: callerPhone, smsConsent: "not_asked" });
      if (smsConsent === "agreed") expect(result).toMatchObject({ textConfirmation: expect.stringContaining("only be set up on a phone call") });
    }
  });

  it("drops an answer when the business can't text the number", async () => {
    await tools({ callerPhone: "+381695021111", snapshot: tollFree }).run("bookAppointment", { ...booking, smsConsent: "declined" });
    expect(vi.mocked(bookForCaller).mock.lastCall?.[1]).toMatchObject({ smsConsent: "not_asked" });
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

  it("records the caller's answer with the cancellation and says a text is coming when they agreed", async () => {
    vi.mocked(cancelForCaller).mockResolvedValueOnce({ ...cancelled, smsConsentOnFile: "subscribed" } as never);
    await expect(tools().run("cancelAppointment", { ...cancel, smsConsent: "agreed" })).resolves.toEqual({ ...cancelled, smsConsentOnFile: "subscribed", textConfirmation: "The caller will get a text confirming the cancellation." });
    expect(cancelForCaller).toHaveBeenCalledWith(expect.anything(), { businessId: demoSnapshot.businessId, callerPhone, ...cancel, smsConsent: "agreed" });
  });

  it.each(["declined", "opted_out"] as const)("promises no text when the answer on file is %s", async (smsConsentOnFile) => {
    vi.mocked(cancelForCaller).mockResolvedValueOnce({ ...cancelled, smsConsentOnFile } as never);
    const result = await tools().run("cancelAppointment", cancel);
    expect(result).toEqual({ ...cancelled, smsConsentOnFile });
    expect(vi.mocked(cancelForCaller).mock.lastCall?.[1]).not.toHaveProperty("smsConsent");
  });

  it("ignores an answer and promises nothing when the business can't text the caller", async () => {
    vi.mocked(cancelForCaller).mockResolvedValueOnce({ ...cancelled, smsConsentOnFile: "subscribed" } as never);
    await expect(tools({ snapshot: { contactChannels: {} } }).run("cancelAppointment", { ...cancel, smsConsent: "agreed" })).resolves.toEqual(cancelled);
    expect(vi.mocked(cancelForCaller).mock.lastCall?.[1]).not.toHaveProperty("smsConsent");
  });
});
