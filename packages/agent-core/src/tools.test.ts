import { demoSnapshot, type BookingMode, type BusinessContextSnapshot, type KnowledgeSnippet } from "@lobbystack/shared";
import { describe, expect, it, vi } from "vitest";

vi.mock("@lobbystack/domain", async () => ({
  countKnowledgeTokens: (await import("../../domain/src/knowledgeRanking")).countKnowledgeTokens,
  KNOWLEDGE_SEARCH_TOKEN_BUDGET: 3000,
  knowledgeQueryTerms: (await import("../../domain/src/knowledgeRanking")).knowledgeQueryTerms,
  searchKnowledgeEvidence: vi.fn(),
  checkOpening: vi.fn(async () => ({ ok: true, available: true })),
  findCallerBooking: vi.fn(async () => undefined),
  bookForCaller: vi.fn(async () => ({ ok: true })),
  requestCancellationForCaller: vi.fn(async () => ({ ok: true, inboxItemId: "inbox_1" })),
}));

import { bookForCaller, checkOpening, findCallerBooking, requestCancellationForCaller, searchKnowledgeEvidence } from "@lobbystack/domain";
import { createReceptionistTools, type AgentToolContext } from "./tools";

function toolNames(overrides: Omit<Partial<AgentToolContext>, "snapshot"> & { bookingMode?: BookingMode; snapshot?: Partial<BusinessContextSnapshot> } = {}): string[] {
  const { bookingMode, snapshot, ...context } = overrides;
  return Object.keys(createReceptionistTools({
    domain: { db: {} as never },
    channel: "web_chat",
    ...context,
    snapshot: { ...demoSnapshot, ...snapshot, ...(bookingMode ? { bookingMode } : {}) },
  })).sort();
}

const callControl = { transfer: vi.fn(async () => true), hangup: vi.fn(async () => undefined) };

describe("createReceptionistTools", () => {
  it("books directly by default", () => {
    expect(toolNames()).toEqual(["bookAppointment", "findAvailability", "getBusinessHours", "getBusinessServices", "requestAppointmentCancellation", "searchKnowledge", "takeMessage"]);
  });

  it("takes requests instead of booking in request mode", () => {
    const names = toolNames({ bookingMode: "request" });
    expect(names).toContain("requestAppointment");
    expect(names).not.toContain("bookAppointment");
    expect(names).not.toContain("findAvailability");
  });

  it("offers no booking actions when booking is off", () => {
    const names = toolNames({ bookingMode: "off", channel: "voice", callerPhone: "+14165550100" });
    expect(names).toEqual(["getBusinessHours", "getBusinessServices", "searchKnowledge", "takeMessage"]);
  });

  it("offers appointment changes only when the call carries the caller's number", () => {
    expect(toolNames({ channel: "web_voice" })).not.toContain("cancelAppointment");
    expect(toolNames({ channel: "voice", callerPhone: "+14165550100" })).toEqual(expect.arrayContaining(["lookupAppointmentForChange", "verifyAppointmentForChange", "cancelAppointment", "rescheduleAppointment"]));
  });

  it("offers transfer and hang-up only on calls it can control", () => {
    expect(toolNames({ channel: "web_voice" })).not.toContain("transferCall");
    expect(toolNames({ channel: "voice", callControl })).toEqual(expect.arrayContaining(["transferCall", "endCall"]));
  });

  it("limits prospect demos to answering questions and taking messages", () => {
    expect(toolNames({ channel: "web_voice", intakeOnly: true, callControl })).toEqual(["endCall", "getBusinessHours", "getBusinessServices", "searchKnowledge", "takeMessage"]);
  });

  it("offers hang-up but not transfer on browser calls", () => {
    const names = toolNames({ channel: "web_voice", callControl: { hangup: vi.fn() } });
    expect(names).toContain("endCall");
    expect(names).not.toContain("transferCall");
  });

  // GPT-Live said goodbye before it handed the call over, so a reply would be a second one.
  it("tells the agent a caller who is done gets no reply", () => {
    const endCall = createReceptionistTools({ domain: { db: {} as never }, channel: "voice", snapshot: demoSnapshot, callControl: { hangup: vi.fn() } }).endCall!;
    expect(endCall.description).toBe("End the call. Use the reason caller_finished when the caller is done or is saying goodbye: the voice model has already said goodbye, so don't write a reply. Use spam or abuse for a spam or abusive call.");
  });

  it("refuses a transfer the rules don't allow", async () => {
    const tools = createReceptionistTools({
      domain: { db: {} as never },
      channel: "voice",
      callControl,
      snapshot: { ...demoSnapshot, transferPolicy: { mode: "on_request", transferNumber: "+14165550199" } },
    });
    const execute = tools.transferCall!.execute! as (input: object, options: object) => Promise<unknown>;
    await expect(execute({ callerRequested: false, urgent: false }, { toolCallId: "1", messages: [] })).resolves.toMatchObject({ ok: false });
    expect(callControl.transfer).not.toHaveBeenCalled();
    await expect(execute({ callerRequested: true, urgent: false }, { toolCallId: "2", messages: [] })).resolves.toMatchObject({ ok: true });
    expect(callControl.transfer).toHaveBeenCalledWith("+14165550199");
  });
});

describe("requestAppointmentCancellation", () => {
  const operatorOnly = { appointmentChangePolicy: { enabled: true, allowCancel: true, allowReschedule: true, verificationMode: "operator_only" as const } };

  it("passes cancellations to the team wherever the business takes bookings", () => {
    expect(toolNames({ channel: "web_voice" })).toContain("requestAppointmentCancellation");
    expect(toolNames({ channel: "web_chat", bookingMode: "request" })).toContain("requestAppointmentCancellation");
    expect(toolNames({ channel: "voice", callerPhone: "+14165550100", snapshot: operatorOnly })).toContain("requestAppointmentCancellation");
    // Next to self-service, for an appointment the caller's number doesn't find or verify.
    expect(toolNames({ channel: "voice", callerPhone: "+14165550100" })).toEqual(expect.arrayContaining(["cancelAppointment", "lookupAppointmentForChange", "requestAppointmentCancellation"]));
  });

  it("isn't offered where the business takes no bookings, or in a demo", () => {
    expect(toolNames({ channel: "web_voice", bookingMode: "off" })).not.toContain("requestAppointmentCancellation");
    expect(toolNames({ channel: "voice", callerPhone: "+14165550100", bookingMode: "off" })).not.toContain("requestAppointmentCancellation");
    expect(toolNames({ channel: "web_voice", intakeOnly: true })).not.toContain("requestAppointmentCancellation");
  });

  it("saves the caller's details as a request and says the appointment isn't cancelled", async () => {
    const tools = createReceptionistTools({ domain: { db: {} as never }, channel: "web_voice", callId: "call_1", conversationId: "conversation_1", snapshot: { ...demoSnapshot, timezone: "America/Toronto" } });
    const execute = tools.requestAppointmentCancellation!.execute! as (input: object, options: object) => Promise<unknown>;
    await expect(execute({ callerName: "Milan", appointmentStartsAt: "2026-10-14T15:00", serviceName: "General Checkup", callbackPhone: "+14165550100" }, { toolCallId: "1", messages: [] }))
      .resolves.toMatchObject({ ok: true, inboxItemId: "inbox_1", cancelled: false, status: expect.stringContaining("still booked") });
    expect(vi.mocked(requestCancellationForCaller).mock.lastCall?.[1]).toEqual({
      businessId: demoSnapshot.businessId, channel: "web_voice", timezone: "America/Toronto", callerName: "Milan",
      appointmentStartsAt: "2026-10-14T15:00", serviceName: "General Checkup", callbackPhone: "+14165550100", callId: "call_1", conversationId: "conversation_1",
    });
  });

  it("uses the trusted caller number and asks for a name before saving", async () => {
    vi.mocked(requestCancellationForCaller).mockClear();
    const tools = createReceptionistTools({ domain: { db: {} as never }, channel: "voice", callerPhone: "+14165550100", snapshot: { ...demoSnapshot, ...operatorOnly } });
    const execute = tools.requestAppointmentCancellation!.execute! as (input: object, options: object) => Promise<unknown>;
    await expect(execute({ callerName: " " }, { toolCallId: "1", messages: [] })).resolves.toMatchObject({ ok: false });
    expect(requestCancellationForCaller).not.toHaveBeenCalled();
    await execute({ callerName: "Milan", callbackPhone: "" }, { toolCallId: "2", messages: [] });
    expect(vi.mocked(requestCancellationForCaller).mock.lastCall?.[1]).toMatchObject({ callerName: "Milan", callbackPhone: "+14165550100", channel: "voice" });
  });
});

describe("bookAppointment", () => {
  const book = (startsAt: string) => {
    const tools = createReceptionistTools({ domain: { db: {} as never }, channel: "voice", callerPhone: "+14165550100", snapshot: { ...demoSnapshot, timezone: "America/Toronto" } });
    const execute = tools.bookAppointment!.execute! as (input: object, options: object) => Promise<unknown>;
    return execute({ serviceName: "General Checkup", startsAt, contactName: "Milan", smsConsentGranted: false }, { toolCallId: "1", messages: [] });
  };

  it("books a time the caller accepted from the conversation, in the business's timezone", async () => {
    await expect(book("2026-10-06T10:00")).resolves.toMatchObject({ ok: true });
    expect(vi.mocked(checkOpening).mock.lastCall?.[1]).toMatchObject({ startsAt: "2026-10-06T10:00:00.000-04:00" });
    expect(vi.mocked(bookForCaller).mock.lastCall?.[1]).toMatchObject({ startsAt: "2026-10-06T10:00:00.000-04:00" });
  });

  it("returns the caller's existing booking for a repeated request instead of calling the slot taken", async () => {
    vi.mocked(findCallerBooking).mockResolvedValueOnce({ ok: true, appointmentId: "appt_1", serviceName: "General Checkup", startsAt: "2026-10-06T10:00:00.000-04:00", alreadyBooked: true });
    vi.mocked(checkOpening).mockClear();
    vi.mocked(bookForCaller).mockClear();
    await expect(book("2026-10-06T10:00")).resolves.toMatchObject({ ok: true, appointmentId: "appt_1", alreadyBooked: true });
    expect(vi.mocked(findCallerBooking).mock.lastCall?.[1]).toMatchObject({ serviceName: "General Checkup", startsAt: "2026-10-06T10:00:00.000-04:00", contactPhone: "+14165550100" });
    expect(checkOpening).not.toHaveBeenCalled();
    expect(bookForCaller).not.toHaveBeenCalled();
  });

  it("keeps the instant of a findAvailability startsAt", async () => {
    await book("2026-10-06T14:00:00.000Z");
    expect(vi.mocked(bookForCaller).mock.lastCall?.[1]).toMatchObject({ startsAt: "2026-10-06T10:00:00.000-04:00" });
  });

  it("uses the caller's number when the model sends an empty phone", async () => {
    const tools = createReceptionistTools({ domain: { db: {} as never }, channel: "voice", callerPhone: "+14165550100", snapshot: demoSnapshot });
    const execute = tools.bookAppointment!.execute! as (input: object, options: object) => Promise<unknown>;
    await expect(execute({ serviceName: "General Checkup", startsAt: "2026-10-06T10:00", contactName: "Milan", contactPhone: "", smsConsentGranted: true }, { toolCallId: "1", messages: [] })).resolves.toMatchObject({ ok: true });
    expect(vi.mocked(bookForCaller).mock.lastCall?.[1]).toMatchObject({ contactPhone: "+14165550100" });
  });

  it("books without text consent when the business can't text the number, and says so", async () => {
    const tools = createReceptionistTools({ domain: { db: {} as never }, channel: "web_voice", snapshot: { ...demoSnapshot, contactChannels: { smsNumber: "+18445550100" } } });
    const execute = tools.bookAppointment!.execute! as (input: object, options: object) => Promise<unknown>;
    await expect(execute({ serviceName: "General Checkup", startsAt: "2026-10-06T10:00", contactName: "Milan", contactPhone: "+381695021111", smsConsentGranted: true }, { toolCallId: "1", messages: [] })).resolves.toMatchObject({ ok: true, textConfirmation: expect.stringContaining("won't get a text") });
    expect(vi.mocked(bookForCaller).mock.lastCall?.[1]).toMatchObject({ contactPhone: "+381695021111", smsConsentGranted: false });
  });

  it("asks for the caller's name before booking", async () => {
    vi.mocked(bookForCaller).mockClear();
    const tools = createReceptionistTools({ domain: { db: {} as never }, channel: "voice", callerPhone: "+14165550100", snapshot: demoSnapshot });
    const execute = tools.bookAppointment!.execute! as (input: object, options: object) => Promise<unknown>;
    await expect(execute({ serviceName: "General Checkup", startsAt: "2026-10-06T10:00", contactName: " ", smsConsentGranted: false }, { toolCallId: "1", messages: [] })).resolves.toEqual({ ok: false, reason: "Ask for the caller's name before booking." });
    expect(bookForCaller).not.toHaveBeenCalled();
  });

  it("asks for a usable time instead of booking an unreadable one", async () => {
    vi.mocked(bookForCaller).mockClear();
    await expect(book("tomorrow at ten")).resolves.toMatchObject({ ok: false });
    expect(bookForCaller).not.toHaveBeenCalled();
  });
});

describe("getBusinessServices", () => {
  it("returns what the knowledge base says the business offers when it lists no services", async () => {
    vi.mocked(searchKnowledgeEvidence).mockResolvedValueOnce({ outcome: "found", matches: [{ title: "About", content: "An AI receptionist for small businesses." }] } as never);
    const tools = createReceptionistTools({ domain: { db: {} as never }, channel: "voice", snapshot: { ...demoSnapshot, services: [] } });
    const execute = tools.getBusinessServices!.execute! as (input: object, options: object) => Promise<unknown>;
    await expect(execute({}, { toolCallId: "1", messages: [] })).resolves.toMatchObject({ services: [], knowledge: { outcome: "found", matches: [{ title: "About", text: "An AI receptionist for small businesses." }] } });
  });

  it("doesn't search when the business lists services", async () => {
    vi.mocked(searchKnowledgeEvidence).mockClear();
    const tools = createReceptionistTools({ domain: { db: {} as never }, channel: "voice", snapshot: demoSnapshot });
    const execute = tools.getBusinessServices!.execute! as (input: object, options: object) => Promise<unknown>;
    const result = await execute({}, { toolCallId: "1", messages: [] }) as { services: unknown[]; knowledge?: unknown };
    expect(result.services.length).toBeGreaterThan(0);
    expect(result.knowledge).toBeUndefined();
    expect(searchKnowledgeEvidence).not.toHaveBeenCalled();
  });
});

describe("searchKnowledge", () => {
  const snippet = (title: string, content: string, priority = 0): KnowledgeSnippet => ({ id: title, title, content, tags: [], priority });
  const passage = (title: string, content = `${title} details`) => ({ chunkId: title, documentId: title, title, content, sourceUrl: null, sourceRevision: 1, sequence: 0 });
  const evidence = (titles: string[], content?: string) => ({ matches: titles.map((title) => passage(title, content)), mode: "hybrid" as const, outcome: titles.length ? "found" as const : "empty" as const, durationMs: 1 });
  // Long pasted text full of common words, like production snippets.
  const chatter = (topic: string) => snippet(topic, `What are the things you should know about ${topic}? You can ask us, and we are happy to help with the details.`);

  async function search(query: string, snippets: KnowledgeSnippet[], found: ReturnType<typeof evidence> | Error) {
    if (found instanceof Error) vi.mocked(searchKnowledgeEvidence).mockRejectedValueOnce(found);
    else vi.mocked(searchKnowledgeEvidence).mockResolvedValueOnce(found);
    const tools = createReceptionistTools({ domain: { db: {} as never }, channel: "web_chat", snapshot: { ...demoSnapshot, knowledgeSnippets: snippets } });
    const execute = tools.searchKnowledge!.execute! as (input: object, options: object) => Promise<{ outcome: string; matches: Array<{ title: string; text: string }> }>;
    const result = await execute({ query }, { toolCallId: "1", messages: [] });
    return { outcome: result.outcome, titles: result.matches.map((match) => match.title) };
  }

  it("keeps every evidence match ahead of snippets that only share common words", async () => {
    const snippets = ["Welcome", "Team", "History", "Insurance", "Hours", "Directions", "Pets"].map(chatter);
    await expect(search("What are the parking rates?", snippets, evidence(["Parking", "Rates", "Garage"]))).resolves.toEqual({ outcome: "found", titles: ["Parking", "Rates", "Garage"] });
  });

  it("returns no snippets for a query of only common words", async () => {
    const snippets = ["Welcome", "Team", "History"].map(chatter);
    await expect(search("what are the", snippets, evidence([]))).resolves.toEqual({ outcome: "empty", titles: [] });
    await expect(search("what are the", snippets, new Error("search down"))).resolves.toEqual({ outcome: "unavailable", titles: [] });
  });

  it("adds relevant snippets after the evidence, strongest first, within six matches", async () => {
    const snippets = [
      snippet("Clinic history", "The clinic opened in 1990.", 9),
      snippet("Parking fees", "Parking costs $5 a day. Fees are waived for seniors.", 1),
      snippet("Getting here", "Our downtown clinic has parking behind the building.", 0),
      snippet("Seniors", "Parking fees are waived for seniors.", 5),
      ...["Welcome", "Team"].map(chatter),
    ];
    await expect(search("Parking fees at the downtown clinic", snippets, evidence(["Garage", "Rates", "Map"]))).resolves.toEqual({ outcome: "found", titles: ["Garage", "Rates", "Map", "Getting here", "Seniors", "Parking fees"] });
    await expect(search("Parking fees at the downtown clinic", snippets, evidence(["Garage", "Rates", "Map", "Lot", "Street"]))).resolves.toEqual({ outcome: "found", titles: ["Garage", "Rates", "Map", "Lot", "Street", "Getting here"] });
  });

  it("falls back to relevant snippets when knowledge search fails", async () => {
    const snippets = [chatter("Welcome"), snippet("Parking", "Parking is available behind the building.")];
    await expect(search("Where can I park? Is parking free?", snippets, new Error("search down"))).resolves.toEqual({ outcome: "found", titles: ["Parking"] });
    await expect(search("Do you take insurance cards?", [snippet("Parking", "Parking is available behind the building.")], new Error("search down"))).resolves.toEqual({ outcome: "unavailable", titles: [] });
  });

  it("counts plurals and longer endings, but not unrelated words that share a short prefix", async () => {
    const snippets = [snippet("Car care", "We offer care plans for pets."), snippet("Fees", "Late fees are $10."), snippet("Lot", "The parking lot opens at 7.")];
    await expect(search("car", snippets, evidence([]))).resolves.toEqual({ outcome: "found", titles: ["Car care"] });
    await expect(search("car", [snippets[0]!].map((item) => ({ ...item, title: "Pets" })), evidence([]))).resolves.toEqual({ outcome: "empty", titles: [] });
    await expect(search("late fee", snippets, evidence([]))).resolves.toEqual({ outcome: "found", titles: ["Fees"] });
    await expect(search("park", snippets, evidence([]))).resolves.toEqual({ outcome: "found", titles: ["Lot"] });
  });

  it("gives snippets only the token budget the evidence leaves", async () => {
    // About 1,000 tokens each, like the longest pasted snippets in production.
    const long = (title: string) => snippet(title, `Parking rules for ${title}. ${"Visitors park in marked bays only. ".repeat(110)}`);
    const snippets = ["North lot", "South lot", "East lot", "West lot"].map(long);
    // Small evidence leaves room for two long snippets, not four.
    await expect(search("parking rules", snippets, evidence(["Garage"]))).resolves.toEqual({ outcome: "found", titles: ["Garage", "North lot", "South lot"] });
    // Evidence that fills most of the budget stays whole, and no long snippet fits after it.
    const fullEvidence = evidence(["Garage", "Rates"], "Garage parking rates and hours. ".repeat(140));
    await expect(search("parking rules", snippets, fullEvidence)).resolves.toEqual({ outcome: "found", titles: ["Garage", "Rates"] });
    // The fallback path keeps the same budget.
    await expect(search("parking rules", snippets, new Error("search down"))).resolves.toEqual({ outcome: "found", titles: ["North lot", "South lot"] });
  });

  it("matches French, accented and Spanish queries to the right snippet", async () => {
    const snippets = [
      snippet("Stationnement", "Le stationnement est gratuit dans la cour arrière."),
      snippet("Stratégie", "Le cours MNGT 10407 porte sur la stratégie d'entreprise."),
      snippet("Horario", "El horario es de lunes a viernes. El precio de la consulta se paga al llegar."),
      snippet("Limpieza dental", "Una limpieza dental cuesta 90 dólares."),
    ];
    await expect(search("Quel est le numéro du cours de stratégie MNGT 10407 ?", snippets, evidence([]))).resolves.toEqual({ outcome: "found", titles: ["Stratégie"] });
    await expect(search("Où est le stationnement ?", snippets, evidence([]))).resolves.toEqual({ outcome: "found", titles: ["Stationnement"] });
    await expect(search("¿Cuál es el precio de la limpieza dental?", snippets, evidence([]))).resolves.toEqual({ outcome: "found", titles: ["Limpieza dental"] });
  });
});
