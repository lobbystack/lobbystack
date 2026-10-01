import { demoSnapshot, type BookingMode, type BusinessContextSnapshot, type KnowledgeSnippet } from "@lobbystack/shared";
import { describe, expect, it, vi } from "vitest";

// knowledgeRanking re-exports a helper from @lobbystack/ai, which the built copy of
// this test can't resolve. The tools only need the real knowledgeQueryTerms.
vi.mock("@lobbystack/ai", () => ({}));
vi.mock("@lobbystack/domain", async () => ({
  knowledgeQueryTerms: (await import("../../domain/src/knowledgeRanking")).knowledgeQueryTerms,
  searchKnowledgeEvidence: vi.fn(),
}));

import { searchKnowledgeEvidence } from "@lobbystack/domain";
import { createReceptionistTools, type AgentToolContext } from "./tools";

function toolNames(overrides: Partial<AgentToolContext> & { bookingMode?: BookingMode; snapshot?: Partial<BusinessContextSnapshot> } = {}): string[] {
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
    expect(toolNames()).toEqual(["bookAppointment", "findAvailability", "getBusinessHours", "getBusinessServices", "searchKnowledge", "takeMessage"]);
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

describe("searchKnowledge", () => {
  const snippet = (title: string, content: string, priority = 0): KnowledgeSnippet => ({ id: title, title, content, tags: [], priority });
  const passage = (title: string) => ({ chunkId: title, documentId: title, title, content: `${title} details`, sourceUrl: null, sourceRevision: 1, sequence: 0 });
  const evidence = (titles: string[]) => ({ matches: titles.map(passage), mode: "hybrid" as const, outcome: titles.length ? "found" as const : "empty" as const, durationMs: 1 });
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
