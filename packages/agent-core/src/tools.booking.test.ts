import { demoSnapshot, type BusinessContextSnapshot } from "@lobbystack/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@lobbystack/domain", async () => ({
  countKnowledgeTokens: (await import("../../domain/src/knowledgeRanking")).countKnowledgeTokens,
  KNOWLEDGE_SEARCH_TOKEN_BUDGET: 3000,
  knowledgeQueryTerms: (await import("../../domain/src/knowledgeRanking")).knowledgeQueryTerms,
  checkOpening: vi.fn(),
  findCallerBooking: vi.fn(async () => undefined),
  findCallBooking: vi.fn(async () => undefined),
  bookForCaller: vi.fn(async () => ({ ok: true })),
  findOpenings: vi.fn(),
  getSmsConsentOnFile: vi.fn(async () => "not_asked"),
  rescheduleForCaller: vi.fn(),
  resolveEmployee: vi.fn(),
}));

import { bookForCaller, checkOpening, findOpenings, rescheduleForCaller, resolveEmployee } from "@lobbystack/domain";
import { createReceptionistTools, UNAVAILABLE_TOOL_MESSAGES } from "./tools";

type Execute = (input: object, options: object) => Promise<Record<string, unknown>>;

function tools(snapshot: Partial<BusinessContextSnapshot> = {}) {
  const set = createReceptionistTools({ domain: { db: {} as never }, channel: "voice", callerPhone: "+14165550100", snapshot: { ...demoSnapshot, timezone: "America/Toronto", appointmentChangePolicy: { enabled: true, allowCancel: true, allowReschedule: true, verificationMode: "phone_match_and_facts" }, ...snapshot } });
  const run = (name: string, input: object) => (set[name]!.execute! as Execute)(input, { toolCallId: "1", messages: [] });
  return { set, run };
}

const booking = { serviceName: "General Checkup", startsAt: "2026-10-06T10:00", contactName: "Milan" };

// The fixtures use early October 2026: keep those times in the future.
vi.setSystemTime(new Date("2026-10-01T12:00:00Z"));
beforeEach(() => { vi.clearAllMocks(); });

describe("booking with an employee", () => {
  it("looks up and books only the employee the caller asked for", async () => {
    vi.mocked(resolveEmployee).mockResolvedValue({ ok: true, staffId: "staff-ana", name: "Ana Petrović", phone: null });
    vi.mocked(findOpenings).mockResolvedValueOnce({ ok: true, serviceName: "General Checkup", date: "2026-10-06", timezone: "America/Toronto", openings: [{ startsAt: "2026-10-06T14:00:00.000Z", displayTime: "Tuesday Oct 6, 10:00 AM" }] } as never);
    const { run } = tools();
    await expect(run("findAvailability", { serviceName: "General Checkup", date: "2026-10-06", employeeName: "ana" })).resolves.toMatchObject({ employeeName: "Ana Petrović" });
    expect(vi.mocked(findOpenings).mock.lastCall?.[1]).toMatchObject({ staffId: "staff-ana" });
    vi.mocked(checkOpening).mockResolvedValueOnce({ ok: true, serviceName: "General Checkup", available: true } as never);
    await run("bookAppointment", { ...booking, employeeName: "ana" });
    expect(vi.mocked(checkOpening).mock.lastCall?.[1]).toMatchObject({ staffId: "staff-ana" });
    expect(vi.mocked(bookForCaller).mock.lastCall?.[1]).toMatchObject({ staffId: "staff-ana" });
  });

  it("books whoever is available first when the caller has no preference", async () => {
    vi.mocked(checkOpening).mockResolvedValueOnce({ ok: true, serviceName: "General Checkup", available: true } as never);
    await tools().run("bookAppointment", booking);
    expect(resolveEmployee).not.toHaveBeenCalled();
    expect(vi.mocked(bookForCaller).mock.lastCall?.[1]).not.toHaveProperty("staffId");
  });

  it("asks the agent to clarify a name that matches no single employee", async () => {
    vi.mocked(resolveEmployee).mockResolvedValueOnce({ ok: false, employees: ["Ana Petrović", "Ana Ilić"] });
    const result = await tools().run("bookAppointment", { ...booking, employeeName: "Ana" });
    expect(result).toEqual({ ok: false, reason: expect.stringContaining("The employees are: Ana Petrović, Ana Ilić") });
    expect(bookForCaller).not.toHaveBeenCalled();
  });
});

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

  it("refuses a time that has already passed", async () => {
    await expect(tools().run("bookAppointment", { ...booking, startsAt: "2026-09-30T10:00" })).resolves.toEqual({ ok: false, reason: expect.stringContaining("already passed") });
    expect(checkOpening).not.toHaveBeenCalled();
    expect(bookForCaller).not.toHaveBeenCalled();
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
    await expect(tools().run("findAvailability", { serviceName: "General Checkup", date: "2026-10-06" })).resolves.toMatchObject({ reason: "No times are free that day. Offer another day." });
  });

  it("passes openings through unchanged, with the caller's answer about texts on a phone call", async () => {
    const found = { ok: true, serviceName: "General Checkup", date: "2026-10-06", timezone: "America/Toronto", openings: [{ startsAt: "2026-10-06T14:00:00.000Z", displayTime: "Tuesday Oct 6, 10:00 AM" }] };
    vi.mocked(findOpenings).mockResolvedValueOnce(found as never);
    await expect(tools().run("findAvailability", { serviceName: "General Checkup", date: "2026-10-06" })).resolves.toEqual({ ...found, smsConsentOnFile: "not_asked" });
  });
});

describe("rescheduleAppointment", () => {
  it("says why the new time can't be booked", async () => {
    vi.mocked(rescheduleForCaller).mockResolvedValueOnce({ ok: false, reason: "That time is outside the business's opening hours.", unavailableReason: "outside_hours" } as never);
    await expect(tools().run("rescheduleAppointment", { appointmentId: "apt_1", verificationId: "ver_1", startsAt: "2026-10-06T22:00:00.000Z", finalConfirmation: true }))
      .resolves.toEqual({ ok: false, reason: UNAVAILABLE_TOOL_MESSAGES.outside_hours });
  });

  it("reads a time without an offset in the business's timezone", async () => {
    vi.mocked(rescheduleForCaller).mockResolvedValueOnce({ ok: true } as never);
    await tools().run("rescheduleAppointment", { appointmentId: "apt_1", verificationId: "ver_1", startsAt: "2026-10-06T10:00", finalConfirmation: true });
    expect(vi.mocked(rescheduleForCaller).mock.lastCall?.[1]).toMatchObject({ startsAt: "2026-10-06T10:00:00.000-04:00" });
  });

  it("refuses a time that has already passed, keeping the verification", async () => {
    await expect(tools().run("rescheduleAppointment", { appointmentId: "apt_1", verificationId: "ver_1", startsAt: "2026-09-30T10:00", finalConfirmation: true }))
      .resolves.toEqual({ ok: false, reason: expect.stringContaining("already passed") });
    expect(rescheduleForCaller).not.toHaveBeenCalled();
  });
});
