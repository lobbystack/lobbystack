import { demoSnapshot, type BusinessContextSnapshot } from "@lobbystack/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@lobbystack/domain", async () => ({
  countKnowledgeTokens: (await import("../../domain/src/knowledgeRanking")).countKnowledgeTokens,
  KNOWLEDGE_SEARCH_TOKEN_BUDGET: 3000,
  knowledgeQueryTerms: (await import("../../domain/src/knowledgeRanking")).knowledgeQueryTerms,
  employeeDoesService: vi.fn(async () => ({ does: true })),
  bookForCaller: vi.fn(async () => ({ ok: true })),
  findOpenings: vi.fn(),
  getSmsConsentOnFile: vi.fn(async () => "not_asked"),
  rescheduleForCaller: vi.fn(),
  resolveEmployee: vi.fn(),
}));

import { bookForCaller, employeeDoesService, findOpenings, rescheduleForCaller, resolveEmployee } from "@lobbystack/domain";
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
beforeEach(() => {
  vi.clearAllMocks();
  // clearAllMocks keeps implementations, so a test that refuses a service mustn't leak into the next.
  vi.mocked(employeeDoesService).mockResolvedValue({ does: true });
});

describe("booking with an employee", () => {
  it("looks up and books only the employee the caller asked for", async () => {
    vi.mocked(resolveEmployee).mockResolvedValue({ ok: true, staffId: "staff-ana", name: "Ana Petrović", phone: null, services: ["General Checkup"], vacation: null });
    vi.mocked(findOpenings).mockResolvedValueOnce({ ok: true, serviceName: "General Checkup", date: "2026-10-06", timezone: "America/Toronto", openings: [{ startsAt: "2026-10-06T14:00:00.000Z", displayTime: "Tuesday Oct 6, 10:00 AM" }] } as never);
    const { run } = tools();
    await expect(run("findAvailability", { serviceName: "General Checkup", date: "2026-10-06", employeeName: "ana" })).resolves.toMatchObject({ employeeName: "Ana Petrović" });
    expect(vi.mocked(findOpenings).mock.lastCall?.[1]).toMatchObject({ staffId: "staff-ana" });
    await run("bookAppointment", { ...booking, employeeName: "ana" });
    expect(vi.mocked(bookForCaller).mock.lastCall?.[1]).toMatchObject({ preferredStaffId: "staff-ana" });
  });

  it("books whoever is available first when the caller has no preference", async () => {
    await tools().run("bookAppointment", booking);
    expect(resolveEmployee).not.toHaveBeenCalled();
    expect(vi.mocked(bookForCaller).mock.lastCall?.[1]).not.toHaveProperty("preferredStaffId");
  });

  it("asks the agent to clarify a name that matches no single employee", async () => {
    vi.mocked(resolveEmployee).mockResolvedValueOnce({ ok: false, employees: ["Ana Petrović", "Ana Ilić"] });
    const result = await tools().run("bookAppointment", { ...booking, employeeName: "Ana" });
    expect(result).toEqual({ ok: false, reason: expect.stringContaining("The employees are: Ana Petrović, Ana Ilić") });
    expect(bookForCaller).not.toHaveBeenCalled();
  });

  it("tells the caller which services the employee does instead of looking up or booking one they don't do", async () => {
    vi.mocked(resolveEmployee).mockResolvedValue({ ok: true, staffId: "staff-ana", name: "Ana Petrović", phone: null, services: ["Colour", "Haircut"], vacation: null });
    vi.mocked(employeeDoesService).mockResolvedValue({ does: false, serviceName: "General Checkup" });
    const { run } = tools();
    const refusal = { ok: false, reason: expect.stringContaining("Ana Petrović doesn't do General Checkup, so it can't be booked with them. Ana Petrović does: Colour, Haircut.") };
    await expect(run("findAvailability", { serviceName: "General Checkup", date: "2026-10-06", employeeName: "Ana" })).resolves.toEqual(refusal);
    await expect(run("bookAppointment", { ...booking, employeeName: "Ana" })).resolves.toEqual(refusal);
    expect(vi.mocked(employeeDoesService).mock.lastCall?.[1]).toEqual({ businessId: demoSnapshot.businessId, staffId: "staff-ana", serviceName: "General Checkup" });
    expect(findOpenings).not.toHaveBeenCalled();
    expect(bookForCaller).not.toHaveBeenCalled();
  });

  it("tells the caller when an employee on vacation is back instead of booking them that day", async () => {
    vi.mocked(resolveEmployee).mockResolvedValue({ ok: true, staffId: "staff-ana", name: "Ana Petrović", phone: null, services: ["General Checkup"], vacation: { startsOn: "2026-10-05", endsOn: "2026-10-09" } });
    const { run } = tools();
    const refusal = { ok: false, reason: expect.stringContaining("Ana Petrović is on vacation from Monday, October 5 to Friday, October 9, so they can't be booked that day. Tell the caller, then offer Ana Petrović from Saturday, October 10 on") };
    await expect(run("findAvailability", { serviceName: "General Checkup", date: "2026-10-06", employeeName: "Ana" })).resolves.toEqual(refusal);
    await expect(run("bookAppointment", { ...booking, employeeName: "Ana" })).resolves.toEqual(refusal);
    expect(findOpenings).not.toHaveBeenCalled();
    expect(bookForCaller).not.toHaveBeenCalled();

    vi.mocked(findOpenings).mockResolvedValueOnce({ ok: true, serviceName: "General Checkup", date: "2026-10-12", timezone: "America/Toronto", openings: [] } as never);
    await expect(run("findAvailability", { serviceName: "General Checkup", date: "2026-10-12", employeeName: "Ana" })).resolves.toMatchObject({ ok: true });
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
    vi.mocked(bookForCaller).mockResolvedValueOnce({ ok: false, reason } as never);
    const result = await tools().run("bookAppointment", booking);
    expect(result).toEqual({ ok: false, reason: expect.stringContaining(text) });
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

  it("refuses a time that has already passed", async () => {
    await expect(tools().run("bookAppointment", { ...booking, startsAt: "2026-09-30T10:00" })).resolves.toEqual({ ok: false, reason: expect.stringContaining("already passed") });
    expect(bookForCaller).not.toHaveBeenCalled();
  });

  it("doesn't call an unknown service a taken time", async () => {
    vi.mocked(bookForCaller).mockResolvedValueOnce({ ok: false, reason: "unknown_service" } as never);
    const result = await tools().run("bookAppointment", booking);
    expect(result.reason).toContain("Service is not available.");
    expect(result.reason).not.toContain("already booked");
  });
});

describe("findAvailability", () => {
  it("says the business can't take bookings yet when it has no opening hours", async () => {
    vi.mocked(findOpenings).mockResolvedValueOnce({ ok: true, serviceName: "General Checkup", date: "2026-10-06", timezone: "America/Toronto", openings: [], reason: "no_hours" } as never);
    const result = await tools({ hours: [] }).run("findAvailability", { serviceName: "General Checkup", date: "2026-10-06" });
    expect(result).toMatchObject({ openings: [], reason: UNAVAILABLE_TOOL_MESSAGES.no_hours });
  });

  it("asks the agent to check the service name when the business has no such service", async () => {
    vi.mocked(findOpenings).mockResolvedValueOnce({ ok: false, reason: "unknown_service" } as never);
    await expect(tools().run("findAvailability", { serviceName: "Oil change", date: "2026-10-06" })).resolves.toEqual({ ok: false, reason: expect.stringContaining("getBusinessServices") });
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
