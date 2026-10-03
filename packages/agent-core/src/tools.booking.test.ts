import { demoSnapshot, type BusinessContextSnapshot } from "@lobbystack/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@lobbystack/ai", async () => ({ countKnowledgeTokens: (await import("../../ai/src/tokenBudget")).countKnowledgeTokens }));
vi.mock("@lobbystack/domain", async () => ({
  countKnowledgeTokens: (await import("../../ai/src/tokenBudget")).countKnowledgeTokens,
  KNOWLEDGE_SEARCH_TOKEN_BUDGET: 3000,
  knowledgeQueryTerms: (await import("../../domain/src/knowledgeRanking")).knowledgeQueryTerms,
  checkOpening: vi.fn(),
  findCallerBooking: vi.fn(async () => undefined),
  bookForCaller: vi.fn(async () => ({ ok: true })),
  findOpenings: vi.fn(),
  rescheduleForCaller: vi.fn(),
}));

import { bookForCaller, checkOpening, findOpenings, rescheduleForCaller } from "@lobbystack/domain";
import { createReceptionistTools, UNAVAILABLE_TOOL_MESSAGES } from "./tools";

type Execute = (input: object, options: object) => Promise<Record<string, unknown>>;

function tools(snapshot: Partial<BusinessContextSnapshot> = {}) {
  const set = createReceptionistTools({ domain: { db: {} as never }, channel: "voice", callerPhone: "+14165550100", snapshot: { ...demoSnapshot, timezone: "America/Toronto", appointmentChangePolicy: { enabled: true, allowCancel: true, allowReschedule: true, verificationMode: "phone_match_and_facts" }, ...snapshot } });
  const run = (name: string, input: object) => (set[name]!.execute! as Execute)(input, { toolCallId: "1", messages: [] });
  return { set, run };
}

const booking = { serviceName: "General Checkup", startsAt: "2026-10-06T10:00", contactName: "Milan", smsConsentGranted: false };

beforeEach(() => { vi.clearAllMocks(); });

describe("bookAppointment refusals", () => {
  it.each([
    ["no_hours", "the business hasn't set its opening hours"],
    ["closed_day", "closed that day"],
    ["outside_hours", "outside the business's opening hours"],
    ["closure", "planned closure"],
    ["no_staff", "No staff member takes bookings"],
    ["calendar_not_synced", "calendar hasn't synced"],
    ["taken", "already booked"],
  ])("tells the agent the real reason for %s", async (reason, text) => {
    vi.mocked(checkOpening).mockResolvedValueOnce({ ok: true, serviceName: "General Checkup", available: false, reason } as never);
    const result = await tools().run("bookAppointment", booking);
    expect(result).toEqual({ ok: false, reason: expect.stringContaining(text) });
    expect(bookForCaller).not.toHaveBeenCalled();
  });

  it("calls a time taken only when it is", () => {
    for (const [reason, message] of Object.entries(UNAVAILABLE_TOOL_MESSAGES)) {
      if (reason !== "taken") expect(message).not.toMatch(/already booked/);
    }
  });

  it("offers to take a message when the business has no opening hours", () => {
    expect(UNAVAILABLE_TOOL_MESSAGES.no_hours).toContain("can't be booked automatically yet");
    expect(UNAVAILABLE_TOOL_MESSAGES.no_hours).toContain("take a message");
    expect(UNAVAILABLE_TOOL_MESSAGES.no_hours).toContain("Don't offer times");
  });

  it("reports the reason when the booking itself is refused after the check", async () => {
    vi.mocked(checkOpening).mockResolvedValueOnce({ ok: true, serviceName: "General Checkup", available: true } as never);
    vi.mocked(bookForCaller).mockResolvedValueOnce({ ok: false, reason: "That time is no longer available.", unavailableReason: "taken" } as never);
    await expect(tools().run("bookAppointment", booking)).resolves.toEqual({ ok: false, reason: UNAVAILABLE_TOOL_MESSAGES.taken });
  });

  it("doesn't call an unknown service a taken time", async () => {
    vi.mocked(checkOpening).mockResolvedValueOnce({ ok: false, reason: "Service is not available." } as never);
    const result = await tools().run("bookAppointment", booking);
    expect(result.reason).toContain("Service is not available.");
    expect(result.reason).not.toContain("no longer available");
  });
});

describe("findAvailability", () => {
  it("says the business can't take bookings yet when it has no opening hours", async () => {
    vi.mocked(findOpenings).mockResolvedValueOnce({ ok: true, serviceName: "General Checkup", date: "2026-10-06", timezone: "America/Toronto", openings: [], reason: "no_hours" } as never);
    const result = await tools({ hours: [] }).run("findAvailability", { serviceName: "General Checkup", date: "2026-10-06" });
    expect(result).toMatchObject({ openings: [], reason: UNAVAILABLE_TOOL_MESSAGES.no_hours });
    expect(vi.mocked(findOpenings).mock.lastCall?.[1]).toMatchObject({ hours: [] });
  });

  it("says a day is fully booked only when every time is taken", async () => {
    vi.mocked(findOpenings).mockResolvedValueOnce({ ok: true, serviceName: "General Checkup", date: "2026-10-06", timezone: "America/Toronto", openings: [], reason: "taken" } as never);
    await expect(tools().run("findAvailability", { serviceName: "General Checkup", date: "2026-10-06" })).resolves.toMatchObject({ reason: "Every time that day is already booked. Offer another day." });
  });

  it("passes openings through unchanged", async () => {
    const found = { ok: true, serviceName: "General Checkup", date: "2026-10-06", timezone: "America/Toronto", openings: [{ startsAt: "2026-10-06T14:00:00.000Z", displayTime: "Tuesday Oct 6, 10:00 AM" }] };
    vi.mocked(findOpenings).mockResolvedValueOnce(found as never);
    await expect(tools().run("findAvailability", { serviceName: "General Checkup", date: "2026-10-06" })).resolves.toEqual(found);
  });
});

describe("rescheduleAppointment", () => {
  it("says why the new time can't be booked", async () => {
    vi.mocked(rescheduleForCaller).mockResolvedValueOnce({ ok: false, reason: "That time is outside the business's opening hours.", unavailableReason: "outside_hours" } as never);
    await expect(tools().run("rescheduleAppointment", { appointmentId: "apt_1", verificationId: "ver_1", startsAt: "2026-10-06T22:00:00.000Z", finalConfirmation: true }))
      .resolves.toEqual({ ok: false, reason: UNAVAILABLE_TOOL_MESSAGES.outside_hours });
  });
});
