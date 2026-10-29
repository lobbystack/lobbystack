import { asSchema } from "ai";
import { demoSnapshot, type BusinessContextSnapshot, type KnowledgeSnippet } from "@lobbystack/shared";
import { describe, expect, it, vi } from "vitest";

vi.mock("@lobbystack/domain", async () => ({
  countKnowledgeTokens: (await import("../../domain/src/knowledgeRanking")).countKnowledgeTokens,
  KNOWLEDGE_SEARCH_TOKEN_BUDGET: 3000,
  knowledgeQueryTerms: (await import("../../domain/src/knowledgeRanking")).knowledgeQueryTerms,
  searchKnowledgeEvidence: vi.fn(),
  recordUnansweredQuestion: vi.fn(async () => null),
  bookForCaller: vi.fn(async () => ({ ok: true })),
  requestCancellationForCaller: vi.fn(async () => ({ ok: true, inboxItemId: "inbox_1" })),
  resolveEmployee: vi.fn(),
}));

import { bookForCaller, recordUnansweredQuestion, requestCancellationForCaller, resolveEmployee, searchKnowledgeEvidence } from "@lobbystack/domain";
import { receptionistCapabilities, type Conversation } from "./capabilities";
import { createReceptionistTools, type AgentChannel } from "./tools";

const callControl = { transfer: vi.fn(async () => true), hangup: vi.fn(async () => undefined) };

// The booking fixtures use early October 2026: keep those times in the future.
vi.setSystemTime(new Date("2026-10-01T12:00:00Z"));

describe("createReceptionistTools", () => {
  it("creates exactly the tools capabilities.ts offers", () => {
    const phoneCall: Conversation = { channel: "voice", callerPhone: "+14165550100", callId: "call_1", callControl };
    for (const [snapshot, conversation] of [
      [demoSnapshot, { channel: "web_chat" }],
      [demoSnapshot, phoneCall],
      [{ ...demoSnapshot, bookingMode: "request" }, phoneCall],
      [demoSnapshot, { channel: "web_voice", intakeOnly: true, callControl }],
    ] as Array<[BusinessContextSnapshot, Conversation]>) {
      expect(Object.keys(createReceptionistTools({ domain: { db: {} as never }, snapshot, ...conversation }))).toEqual(receptionistCapabilities(snapshot, conversation).tools);
    }
  });

  // GPT-Live said goodbye before it handed the call over, so a reply would be a second one.
  it("tells the agent a caller who is done gets no reply", () => {
    const endCall = createReceptionistTools({ domain: { db: {} as never }, channel: "voice", snapshot: demoSnapshot, callControl: { hangup: vi.fn() } }).endCall!;
    expect(endCall.description).toBe("End the call. Use the reason caller_finished when the caller is done or is saying goodbye: the voice model says goodbye when it hears the call is ending, so don't write a reply. Use spam or abuse for a spam or abusive call.");
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

describe("transferCall to an employee", () => {
  const transferTo = (snapshot: Partial<BusinessContextSnapshot> = {}) => {
    callControl.transfer.mockClear();
    const tools = createReceptionistTools({
      domain: { db: {} as never },
      channel: "voice",
      callControl,
      snapshot: { ...demoSnapshot, transferPolicy: { mode: "on_request", transferNumber: "+14165550199" }, ...snapshot },
    });
    return tools.transferCall!.execute! as (input: object, options: object) => Promise<Record<string, unknown>>;
  };
  const ask = (employeeName: string) => ({ callerRequested: true, urgent: false, employeeName });

  it("transfers to the employee's own number", async () => {
    vi.mocked(resolveEmployee).mockResolvedValueOnce({ ok: true, staffId: "staff-ana", name: "Ana Petrović", phone: "+381641234567", services: [], timeOff: [] });
    await expect(transferTo()(ask("Ana"), { toolCallId: "1", messages: [] })).resolves.toEqual({ ok: true, transferring: true, employeeName: "Ana Petrović" });
    expect(callControl.transfer).toHaveBeenCalledWith("+381641234567");
  });

  it("falls back to the business's transfer number when the employee has none", async () => {
    vi.mocked(resolveEmployee).mockResolvedValueOnce({ ok: true, staffId: "staff-marko", name: "Marko", phone: null, services: [], timeOff: [] });
    await expect(transferTo()(ask("Marko"), { toolCallId: "1", messages: [] })).resolves.toMatchObject({ ok: true, employeeName: "Marko" });
    expect(callControl.transfer).toHaveBeenCalledWith("+14165550199");
  });

  it("follows the business's transfer rules, even for an employee with a number", async () => {
    vi.mocked(resolveEmployee).mockResolvedValue({ ok: true, staffId: "staff-ana", name: "Ana Petrović", phone: "+381641234567", services: [], timeOff: [] });
    for (const transferPolicy of [{ mode: "on_request" as const }, { mode: "never" as const, transferNumber: "+14165550199" }]) {
      expect(createReceptionistTools({ domain: { db: {} as never }, channel: "voice", callControl, snapshot: { ...demoSnapshot, transferPolicy } }).transferCall).toBeUndefined();
    }
    await expect(transferTo()({ callerRequested: false, urgent: false, employeeName: "Ana" }, { toolCallId: "1", messages: [] })).resolves.toMatchObject({ ok: false });
    expect(callControl.transfer).not.toHaveBeenCalled();
    vi.mocked(resolveEmployee).mockReset();
  });

  it("doesn't transfer to an employee who is off today", async () => {
    vi.mocked(resolveEmployee).mockResolvedValueOnce({ ok: true, staffId: "staff-ana", name: "Ana Petrović", phone: "+381641234567", services: [], timeOff: [{ startsOn: "2026-09-28", endsOn: "2026-10-09" }] });
    await expect(transferTo({ timezone: "UTC" })(ask("Ana"), { toolCallId: "1", messages: [] })).resolves.toEqual({ ok: false, reason: expect.stringContaining("Ana Petrović is off until Friday, October 9.") });
    expect(callControl.transfer).not.toHaveBeenCalled();
  });

  it("asks which employee the caller means when the name matches none or several", async () => {
    vi.mocked(resolveEmployee).mockResolvedValueOnce({ ok: false, employees: ["Ana Petrović", "Ana Ilić"] });
    const result = await transferTo()(ask("Ana"), { toolCallId: "1", messages: [] });
    expect(result).toEqual({ ok: false, reason: expect.stringContaining("The employees are: Ana Petrović, Ana Ilić") });
    expect(callControl.transfer).not.toHaveBeenCalled();
  });
});

describe("requestAppointmentCancellation", () => {
  const operatorOnly = { appointmentChangePolicy: { enabled: true, allowCancel: true, allowReschedule: true, verificationMode: "operator_only" as const } };

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

  // The team reads these notes in the business's language, not the caller's.
  it("asks for the notes in the business's language", async () => {
    const schema = async (locale: "en" | "sr") => {
      const tools = createReceptionistTools({ domain: { db: {} as never }, channel: "web_voice", snapshot: { ...demoSnapshot, defaultLocale: locale } });
      return JSON.stringify(await asSchema(tools.requestAppointmentCancellation!.inputSchema).jsonSchema);
    };
    expect(await schema("sr")).toContain("Write it in Serbian (Latin script), even when the caller spoke another language.");
    expect(await schema("en")).toContain("Write it in English, even when the caller spoke another language.");
  });

  it("prefers the team language over the customer language for those notes", async () => {
    const tools = createReceptionistTools({ domain: { db: {} as never }, channel: "web_voice", snapshot: { ...demoSnapshot, defaultLocale: "en", teamLocale: "sr" } });
    expect(JSON.stringify(await asSchema(tools.requestAppointmentCancellation!.inputSchema).jsonSchema)).toContain("Write it in Serbian (Latin script)");
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
    return execute({ serviceName: "General Checkup", startsAt, contactName: "Milan" }, { toolCallId: "1", messages: [] });
  };

  it("books a time the caller accepted from the conversation, in the business's timezone", async () => {
    await expect(book("2026-10-06T10:00")).resolves.toMatchObject({ ok: true });
    expect(vi.mocked(bookForCaller).mock.lastCall?.[1]).toMatchObject({ service: { name: "General Checkup" }, startsAt: "2026-10-06T10:00:00.000-04:00", contactName: "Milan", channel: "voice" });
  });

  it("returns the caller's existing booking for a repeated request, found by the call's own number", async () => {
    vi.mocked(bookForCaller).mockResolvedValueOnce({ ok: true, appointmentId: "appt_1", serviceName: "General Checkup", startsAt: "2026-10-06T10:00:00.000-04:00", alreadyBooked: true });
    await expect(book("2026-10-06T10:00")).resolves.toMatchObject({ ok: true, appointmentId: "appt_1", alreadyBooked: true });
    expect(vi.mocked(bookForCaller).mock.lastCall?.[1]).toMatchObject({ contactPhone: "+14165550100", callerPhone: "+14165550100" });
  });

  it("never treats a typed or spoken number as the call's own", async () => {
    const run = (channel: AgentChannel, callId?: string) => {
      const tools = createReceptionistTools({ domain: { db: {} as never }, channel, ...(callId ? { callId } : {}), snapshot: demoSnapshot });
      return (tools.bookAppointment!.execute! as (input: object, options: object) => Promise<unknown>)({ serviceName: "General Checkup", startsAt: "2026-10-06T10:00", contactName: "Milan", contactPhone: "+14165550199", smsConsent: "not_asked" }, { toolCallId: "1", messages: [] });
    };
    await run("web_chat");
    expect(vi.mocked(bookForCaller).mock.lastCall?.[1]).not.toHaveProperty("callerPhone");
    // A browser call finds only its own booking.
    await run("web_voice", "call_1");
    expect(vi.mocked(bookForCaller).mock.lastCall?.[1]).toMatchObject({ callId: "call_1", contactPhone: "+14165550199" });
    expect(vi.mocked(bookForCaller).mock.lastCall?.[1]).not.toHaveProperty("callerPhone");
  });

  it("says the booking couldn't be completed when it fails unexpectedly", async () => {
    vi.mocked(bookForCaller).mockRejectedValueOnce(new Error("database is down"));
    await expect(book("2026-10-06T10:00")).resolves.toEqual({ ok: false, reason: "The booking could not be completed." });
  });

  it("keeps the instant of a findAvailability startsAt", async () => {
    await book("2026-10-06T14:00:00.000Z");
    expect(vi.mocked(bookForCaller).mock.lastCall?.[1]).toMatchObject({ startsAt: "2026-10-06T10:00:00.000-04:00" });
  });

  it("uses the caller's number when the model sends an empty phone", async () => {
    const tools = createReceptionistTools({ domain: { db: {} as never }, channel: "voice", callerPhone: "+14165550100", snapshot: demoSnapshot });
    const execute = tools.bookAppointment!.execute! as (input: object, options: object) => Promise<unknown>;
    await expect(execute({ serviceName: "General Checkup", startsAt: "2026-10-06T10:00", contactName: "Milan", contactPhone: "" }, { toolCallId: "1", messages: [] })).resolves.toMatchObject({ ok: true });
    expect(vi.mocked(bookForCaller).mock.lastCall?.[1]).toMatchObject({ contactPhone: "+14165550100" });
  });

  it("asks for the caller's name before booking", async () => {
    vi.mocked(bookForCaller).mockClear();
    const tools = createReceptionistTools({ domain: { db: {} as never }, channel: "voice", callerPhone: "+14165550100", snapshot: demoSnapshot });
    const execute = tools.bookAppointment!.execute! as (input: object, options: object) => Promise<unknown>;
    await expect(execute({ serviceName: "General Checkup", startsAt: "2026-10-06T10:00", contactName: " " }, { toolCallId: "1", messages: [] })).resolves.toEqual({ ok: false, reason: "Ask for the caller's name before booking." });
    expect(bookForCaller).not.toHaveBeenCalled();
  });

  it("asks for a usable time instead of booking an unreadable one", async () => {
    vi.mocked(bookForCaller).mockClear();
    await expect(book("tomorrow at ten")).resolves.toMatchObject({ ok: false });
    expect(bookForCaller).not.toHaveBeenCalled();
  });
});

describe("getBusinessHours", () => {
  it("gives closures in the business's local time, like its hours", async () => {
    const closures = [{ startsAt: "2026-12-24T23:00:00.000Z", endsAt: "2026-12-25T23:00:00.000Z", reason: "Christmas Day" }];
    const tools = createReceptionistTools({ domain: { db: {} as never }, channel: "web_chat", snapshot: { ...demoSnapshot, timezone: "Europe/Belgrade", closures } });
    const execute = tools.getBusinessHours!.execute! as (input: object, options: object) => Promise<unknown>;
    await expect(execute({}, { toolCallId: "1", messages: [] })).resolves.toMatchObject({
      upcomingClosures: [{ from: "2026-12-25T00:00:00.000+01:00", to: "2026-12-26T00:00:00.000+01:00", reason: "Christmas Day" }],
    });
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

  it("finds a text entry beyond the few the prompt lists", async () => {
    const snippets = [...Array.from({ length: 12 }, (_, index) => chatter(`Topic ${index}`)), snippet("Do you offer valet parking?", "Yes, valet parking is free on weekends.", -5)];
    await expect(search("valet parking", snippets, evidence([]))).resolves.toEqual({ outcome: "found", titles: ["Do you offer valet parking?"] });
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

describe("unanswered questions", () => {
  const evidence = (outcome: "found" | "empty" | "unavailable") => ({
    matches: outcome === "found" ? [{ chunkId: "c", documentId: "d", title: "Parking", content: "Parking is free.", sourceUrl: null, sourceRevision: 1, sequence: 0 }] : [],
    mode: "hybrid" as const,
    outcome,
    durationMs: 1,
  });
  const searchOn = async (conversation: Conversation, found: ReturnType<typeof evidence> | Error, query = "Do you validate parking?") => {
    vi.mocked(recordUnansweredQuestion).mockClear();
    if (found instanceof Error) vi.mocked(searchKnowledgeEvidence).mockRejectedValueOnce(found);
    else vi.mocked(searchKnowledgeEvidence).mockResolvedValueOnce(found);
    const tools = createReceptionistTools({ domain: { db: {} as never }, snapshot: { ...demoSnapshot, knowledgeSnippets: [] }, ...conversation });
    const execute = tools.searchKnowledge!.execute! as (input: object, options: object) => Promise<{ outcome: string }>;
    const result = await execute({ query }, { toolCallId: "1", messages: [] });
    // The save runs after the reply; let it start.
    await new Promise((resolve) => setTimeout(resolve, 0));
    return result;
  };

  it("saves a question the knowledge base has no answer for, with the call or chat it came from", async () => {
    await expect(searchOn({ channel: "voice", callId: "call_1", conversationId: "conversation_1", callerPhone: "+14165550100", callControl }, evidence("empty"))).resolves.toMatchObject({ outcome: "empty" });
    expect(recordUnansweredQuestion).toHaveBeenCalledWith(expect.anything(), { businessId: demoSnapshot.businessId, question: "Do you validate parking?", channel: "voice", callId: "call_1", conversationId: "conversation_1" });

    await searchOn({ channel: "web_chat", conversationId: "chat_1" }, evidence("empty"));
    expect(recordUnansweredQuestion).toHaveBeenCalledWith(expect.anything(), { businessId: demoSnapshot.businessId, question: "Do you validate parking?", channel: "web_chat", conversationId: "chat_1" });
  });

  it("saves nothing when the knowledge base answers, the search fails, or the call is a prospect demo", async () => {
    await expect(searchOn({ channel: "web_chat" }, evidence("found"))).resolves.toMatchObject({ outcome: "found" });
    expect(recordUnansweredQuestion).not.toHaveBeenCalled();
    await expect(searchOn({ channel: "web_chat" }, evidence("unavailable"))).resolves.toMatchObject({ outcome: "unavailable" });
    expect(recordUnansweredQuestion).not.toHaveBeenCalled();
    await expect(searchOn({ channel: "web_chat" }, new Error("search down"))).resolves.toMatchObject({ outcome: "unavailable" });
    expect(recordUnansweredQuestion).not.toHaveBeenCalled();
    await expect(searchOn({ channel: "web_voice", intakeOnly: true, callControl }, evidence("empty"))).resolves.toMatchObject({ outcome: "empty" });
    expect(recordUnansweredQuestion).not.toHaveBeenCalled();
  });

  it("doesn't save the lookup getBusinessServices makes for itself", async () => {
    vi.mocked(recordUnansweredQuestion).mockClear();
    vi.mocked(searchKnowledgeEvidence).mockResolvedValueOnce(evidence("empty"));
    const tools = createReceptionistTools({ domain: { db: {} as never }, channel: "voice", snapshot: { ...demoSnapshot, services: [], knowledgeSnippets: [] } });
    const execute = tools.getBusinessServices!.execute! as (input: object, options: object) => Promise<unknown>;
    await execute({}, { toolCallId: "1", messages: [] });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(recordUnansweredQuestion).not.toHaveBeenCalled();
  });

  it("answers without waiting for the save, and only logs when it fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    let finishSave: (() => void) | undefined;
    vi.mocked(recordUnansweredQuestion).mockImplementationOnce(() => new Promise((_, reject) => { finishSave = () => reject(new Error("database down")); }));
    await expect(searchOn({ channel: "web_chat" }, evidence("empty"))).resolves.toMatchObject({ outcome: "empty" });
    finishSave?.();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(warn).toHaveBeenCalledWith("[knowledge] couldn't save an unanswered question", "database down");
    warn.mockRestore();
  });
});
