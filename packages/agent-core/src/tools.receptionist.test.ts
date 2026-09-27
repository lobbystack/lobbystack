import { demoSnapshot } from "@lobbystack/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

const domain = vi.hoisted(() => ({
  searchKnowledgeEvidence: vi.fn(),
  findOpenings: vi.fn(),
  checkOpening: vi.fn(),
  bookForCaller: vi.fn(),
  lookupCallerAppointments: vi.fn(),
}));
vi.mock("@lobbystack/domain", () => domain);

import { createReceptionistTools } from "./tools";

// A snapshot already projected for one receptionist that skips a document and a service.
const snapshot = { ...demoSnapshot, agentId: "night", excludedKnowledgeDocumentIds: ["doc-prices"], excludedServiceIds: ["svc-surgery"] };
const options = { toolCallId: "call", messages: [] };
const run = (tool: { execute?: unknown }, input: object, opts: object) => (tool.execute as (input: object, options: object) => Promise<unknown>)(input, opts);

beforeEach(() => {
  vi.clearAllMocks();
  domain.searchKnowledgeEvidence.mockResolvedValue({ matches: [], outcome: "empty" });
  domain.findOpenings.mockResolvedValue({ ok: true, openings: [] });
  domain.checkOpening.mockResolvedValue({ ok: true, available: true });
  domain.bookForCaller.mockResolvedValue({ ok: true });
  domain.lookupCallerAppointments.mockResolvedValue({ ok: true });
});

describe("receptionist scope in tools", () => {
  it("skips the receptionist's opted-out documents in knowledge search", async () => {
    const tools = createReceptionistTools({ domain: { db: {} as never }, channel: "web_chat", snapshot });
    await run(tools.searchKnowledge!, { query: "price" }, options);
    expect(domain.searchKnowledgeEvidence).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ excludedDocumentIds: ["doc-prices"] }));
  });

  it("won't find or book a service the receptionist opted out of", async () => {
    const tools = createReceptionistTools({ domain: { db: {} as never }, channel: "voice", callerPhone: "+14165550100", snapshot });
    await run(tools.findAvailability!, { serviceName: "Surgery", date: "2030-01-08" }, options);
    await run(tools.bookAppointment!, { serviceName: "Surgery", startsAt: "2030-01-08T14:00:00.000Z", smsConsentGranted: false }, options);
    expect(domain.findOpenings).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ excludedServiceIds: ["svc-surgery"] }));
    expect(domain.checkOpening).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ excludedServiceIds: ["svc-surgery"] }));
    expect(domain.bookForCaller).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ excludedServiceIds: ["svc-surgery"] }));
  });

  it("checks appointment changes against the answering receptionist's policy", async () => {
    const tools = createReceptionistTools({ domain: { db: {} as never }, channel: "voice", callerPhone: "+14165550100", snapshot });
    await run(tools.lookupAppointmentForChange!, {}, options);
    expect(domain.lookupCallerAppointments).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ agentId: "night" }));
  });
});
