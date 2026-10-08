import { countKnowledgeTokens } from "@lobbystack/domain";
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
    expect(instructions).toContain("Don't say you've booked, cancelled, saved, sent or confirmed anything until the backend's result says it's done.");
  });

  it("has the lines OpenAI's template requires, names the call's language, and the greeting to open with once told to start", () => {
    const instructions = buildLiveInstructions({ ...demoSnapshot, defaultLocale: "fr" }, callStart);
    expect(instructions).toContain("Delegate to the backend when:\n");
    expect(instructions).toContain("- A correction changes the work already requested.");
    expect(instructions).toContain("Delegate before giving an answer that depends on backend work.");
    expect(instructions).toContain("Do not guess the result while waiting.");
    expect(instructions).toContain("If the caller is frustrated, acknowledge it briefly and focus on the next helpful step.");
    expect(instructions).toContain("Speak French unless the caller asks to switch");
    expect(instructions).toContain("Backchannel policy: Use moderate backchannels. Acknowledge naturally without competing with the main response.");
    expect(instructions).toContain(`Open the call with this greeting as soon as you're told to start: "${demoSnapshot.greeting}" Say it once, at the start of the call only.`);
  });

  it("keeps later rules when an earlier one is too long for the budget", () => {
    const rules = [
      { id: "r1", order: 1, title: "Huge", content: "word ".repeat(5_000) },
      { id: "r2", order: 2, title: "Parking", content: "Park behind the building." },
    ];
    const instructions = buildLiveInstructions({ ...demoSnapshot, rules } as never, callStart);
    expect(instructions).toContain("- Parking: Park behind the building.");
    expect(instructions).not.toContain("- Huge:");
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

  it("asks GPT-Live to move the caller forward instead of capping its replies", () => {
    const instructions = buildLiveInstructions(demoSnapshot, callStart);
    expect(instructions).toContain("Your job is to help each caller get what they called for.");
    expect(instructions).toContain("offer to book a time");
    expect(instructions).not.toMatch(/one or two short sentences|in a sentence or two/);
    expect(buildAgentInstructions(demoSnapshot, "voice")).toContain("give the next step that moves them forward");
  });

  it("lists the knowledge base's topics so GPT-Live knows what the backend can look up", () => {
    const knowledgeDigest = [JSON.stringify({ title: "Pricing", sourceUrl: "https://example.com/pricing", tags: [], revision: 1 }), JSON.stringify({ title: "Parking and directions", sourceUrl: null, tags: [], revision: 2 }), "not a digest line"].join("\n");
    const instructions = buildLiveInstructions({ ...demoSnapshot, knowledgeDigest }, callStart);
    expect(instructions).toContain("Topics the backend can look up in the business's documents and website (titles only; delegate questions about them):\n- Pricing\n- Parking and directions");
    expect(instructions).not.toContain("not a digest line");
  });

  it("leaves out the placeholder summary a new business starts with", () => {
    for (const summary of ["Maple Clinic uses LobbyStack to answer calls.", "lobbystack uses LobbyStack to handle calls and SMS."]) {
      const live = buildLiveInstructions({ ...demoSnapshot, summary }, callStart);
      expect(live).not.toContain("uses LobbyStack");
      expect(live).not.toContain("About the business:");
      expect(buildAgentInstructions({ ...demoSnapshot, summary }, "voice")).not.toContain("uses LobbyStack");
    }
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
  it("gives the voice backend OpenAI's voice-context and result rules, and asks for facts rather than a script", () => {
    const instructions = buildAgentInstructions(demoSnapshot, "voice");
    expect(instructions).toContain("Transcripts can contain mistakes, unfinished phrases, and later corrections. Use the latest context and verified records.");
    expect(instructions).toContain("Return the relevant facts, the request's current status, and the next step");
    expect(instructions).toContain("Report an action as complete only after the tool confirms success. If the outcome is unclear, say so");
    expect(instructions).not.toContain("Reply with what it should say next");
    expect(buildAgentInstructions(demoSnapshot, "web_chat")).not.toContain("Transcripts can contain mistakes");
  });

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

describe("cancellations without a trusted caller number", () => {
  it("tells the agent to say it can't cancel here and to pass the request to the team", () => {
    const browser = buildAgentInstructions(demoSnapshot, "web_voice");
    expect(browser).toContain("You can't cancel appointments on this call. When the caller asks to cancel one, tell them that plainly and that the team will take care of the cancellation.");
    expect(browser).toContain("save the request with requestAppointmentCancellation");
    expect(browser).toContain("Never say or suggest the appointment is already cancelled.");
    expect(buildAgentInstructions(demoSnapshot, "web_chat")).toContain("You can't cancel appointments in this chat.");
  });

  it("keeps direct cancellation on phone calls from a trusted number, with a request when it can't find or verify the appointment", () => {
    const phone = buildAgentInstructions(demoSnapshot, "voice", { callerPhone: "+14165550134" });
    expect(phone).not.toContain("You can't cancel appointments");
    expect(phone).toContain("When you can't find or verify the appointment a caller wants to cancel, for example because they aren't calling from the number it was booked with, don't take a message.");
    expect(phone).toContain("save the request with requestAppointmentCancellation");
    for (const instructions of [buildAgentInstructions({ ...demoSnapshot, bookingMode: "off" }, "web_voice"), buildAgentInstructions(demoSnapshot, "voice", { callerPhone: "+14165550134", intakeOnly: true })]) {
      expect(instructions).not.toContain("requestAppointmentCancellation");
    }
  });

  it("tells GPT-Live a cancellation the backend can't make goes to the team and stays booked", () => {
    expect(buildLiveInstructions(demoSnapshot, callStart)).toContain("When it can't find or verify the appointment, as on a call from another number, the backend passes a cancellation request to the team, and the appointment stays booked until the team cancels it.");
    const operatorOnly = buildLiveInstructions({ ...demoSnapshot, appointmentChangePolicy: { enabled: true, allowCancel: true, allowReschedule: true, verificationMode: "operator_only" } }, callStart);
    expect(operatorOnly).toContain("- Appointment cancellations: the backend passes a cancellation request to the team.");
    expect(operatorOnly).not.toContain("reschedule or cancel an appointment");
  });
});

describe("instant booking without opening hours", () => {
  const noHours = { ...demoSnapshot, bookingMode: "instant" as const, hours: [] };

  it("tells the agent it can't book and to take the request as a message", () => {
    const instructions = buildAgentInstructions(noHours, "voice", { callerPhone: "+14165550100" });
    expect(instructions).toContain("The business hasn't set its opening hours yet, so you can't book appointments.");
    expect(instructions).toContain("take a message with their name, number, the service and their preferred time");
    expect(buildAgentInstructions(demoSnapshot, "voice")).not.toContain("hasn't set its opening hours");
    expect(buildAgentInstructions(demoSnapshot, "voice")).toContain("Say a time is taken only when the tool says it's already booked.");
  });

  it("tells GPT-Live the backend takes appointment requests instead of booking", () => {
    const instructions = buildLiveInstructions(noHours, callStart);
    expect(instructions).toContain("the business hasn't set opening hours, so the backend can't book");
    expect(instructions).not.toContain("- Appointments: check open times and book appointments.");
    expect(buildLiveInstructions(demoSnapshot, callStart)).toContain("- Appointments: check open times and book appointments.");
  });

  it("leaves request mode and demos alone", () => {
    expect(buildAgentInstructions({ ...noHours, bookingMode: "request" }, "voice")).not.toContain("hasn't set its opening hours");
    expect(buildAgentInstructions(noHours, "voice", { intakeOnly: true })).not.toContain("hasn't set its opening hours");
  });
});
