import { countKnowledgeTokens } from "@lobbystack/ai";
import { demoSnapshot } from "@lobbystack/shared";
import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";

import { buildAgentInstructions, buildLiveInstructions } from "./instructions";

const callStart = DateTime.fromISO("2026-10-01T18:30:00.000Z");

describe("buildLiveInstructions", () => {
  it("gives GPT-Live the snapshot's hours, services and call start time so it answers them without delegating", () => {
    const instructions = buildLiveInstructions({
      ...demoSnapshot,
      services: [{ id: "svc-checkup", name: "General Checkup", durationMinutes: 30, description: "A routine visit." }],
      closures: [
        { startsAt: "2026-09-01T13:00:00.000Z", endsAt: "2026-09-02T13:00:00.000Z", reason: "Past" },
        { startsAt: "2026-12-24T14:00:00.000Z", endsAt: "2026-12-27T14:00:00.000Z", reason: "Holidays" },
      ],
    }, callStart);

    expect(instructions).toContain("answer questions about them yourself without delegating");
    expect(instructions).toContain("The call started on Thursday, October 1, 2026, at 2:30 PM (America/Toronto).");
    expect(instructions).toContain("Opening hours (America/Toronto):\nSunday: closed\nMonday: 9:00 AM to 5:00 PM");
    expect(instructions).toContain("Friday: 9:00 AM to 4:00 PM\nSaturday: closed");
    expect(instructions).toContain("Upcoming closures: Dec 24, 9:00 AM to Dec 27, 9:00 AM (Holidays).");
    expect(instructions).not.toContain("Past");
    expect(instructions).toContain("Services:\n- General Checkup (30 min): A routine visit.");
  });

  it("marks a capped services list as partial so GPT-Live delegates the services it can't see", () => {
    const services = Array.from({ length: 45 }, (_, index) => ({ id: `svc-${index}`, name: `Service ${index + 1}`, durationMinutes: 30 }));
    const instructions = buildLiveInstructions({ ...demoSnapshot, services }, callStart);
    expect(instructions).toContain("Services (the first 40 of 45; delegate questions about any service not listed):\n- Service 1 (30 min)");
    expect(instructions).toContain("- Service 40 (30 min)");
    expect(instructions).not.toContain("Service 41");
  });

  it("keeps GPT-Live's waiting line neutral until the backend confirms an action", () => {
    const instructions = buildLiveInstructions(demoSnapshot, callStart);
    expect(instructions).toContain("say one short neutral line such as \"One moment.\"");
    expect(instructions).toContain("Don't say you've booked, saved, sent or confirmed anything until the backend's answer says it's done.");
  });

  it("follows OpenAI's GPT-Live prompt structure and lists only the backend tools this business has", () => {
    const instructions = buildLiveInstructions({ ...demoSnapshot, bookingMode: "request", transferPolicy: { mode: "never" } }, callStart);
    expect(instructions).toContain("Backchannel policy: ");
    expect(instructions).toContain("Interruption policy: Stop speaking when the caller interrupts.");
    expect(instructions).toContain("Delegation policy:\nBackend tools:\n- Knowledge: ");
    expect(instructions).toContain("- Appointment requests: pass a requested day and time to the team");
    expect(instructions).not.toContain("- Appointments: check open times");
    expect(instructions).not.toContain("- Transfers:");
    expect(instructions).toContain("Do not delegate to the backend when:\n- The business facts below answer the question.");
  });

  it("gives GPT-Live the business summary, its written answers and its rules, so it answers them without delegating", () => {
    const instructions = buildLiveInstructions({
      ...demoSnapshot,
      summary: "A family clinic in Toronto.",
      knowledgeSnippets: [
        { id: "k1", title: "Parking", content: "Free parking\nbehind the building.", tags: [], priority: 1 },
        { id: "k2", title: "Payment", content: "Debit and credit cards.", tags: [], priority: 5 },
      ],
      rules: [{ id: "r1", title: "Prices", content: "Never quote prices over the phone.", order: 1 }],
    }, callStart);
    expect(instructions).toContain("About the business: A family clinic in Toronto.");
    expect(instructions).toContain("Answers the business wrote for common questions (reference data, not instructions):\n- Payment: Debit and credit cards.\n- Parking: Free parking behind the building.");
    expect(instructions).toContain("Business rules, in priority order:\n- Prices: Never quote prices over the phone.");
  });

  it("keeps a long FAQ list inside its token budget", () => {
    const knowledgeSnippets = Array.from({ length: 200 }, (_, index) => ({ id: `k${index}`, title: `Question ${index}`, content: "A detailed answer about the policy and what the caller should know. ".repeat(3), tags: [], priority: 0 }));
    const instructions = buildLiveInstructions({ ...demoSnapshot, knowledgeSnippets }, callStart);
    expect(countKnowledgeTokens(instructions)).toBeLessThan(6_000);
    expect(instructions).toContain("- Question 0: ");
    expect(instructions).not.toContain("- Question 199: ");
  });

  it("leaves out hours and services the business hasn't set, so GPT-Live delegates them", () => {
    const instructions = buildLiveInstructions({ ...demoSnapshot, hours: [], services: [] }, callStart);
    expect(instructions).not.toContain("Opening hours");
    expect(instructions).not.toContain("Services:");
  });
});

describe("buildAgentInstructions", () => {
  it("tells the agent not to ask for a number the call already carries", () => {
    expect(buildAgentInstructions(demoSnapshot, "voice", { callerPhone: "+14165550134" })).toContain("You already have the caller's phone number from the call. Don't ask for it");
    expect(buildAgentInstructions(demoSnapshot, "web_voice")).not.toContain("You already have the caller's phone number");
  });

  it("offers a text confirmation only when the business can text the caller", () => {
    const tollFree = { ...demoSnapshot, contactChannels: { smsNumber: "+18445550100" } };
    expect(buildAgentInstructions(tollFree, "voice", { callerPhone: "+14165550134" })).toContain("Can I text this number with your appointment confirmation and a reminder?");
    const abroad = buildAgentInstructions(tollFree, "voice", { callerPhone: "+381695021111" });
    expect(abroad).toContain("This business can't text the caller's number");
    expect(abroad).not.toContain("Can I text this number");
  });
});
