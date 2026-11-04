import { describe, expect, it } from "vitest";

import { demoSnapshot, type BusinessContextSnapshot, type SnapshotAgent } from "@lobbystack/shared";

import { buildBusinessContextSnapshot, businessHasPhoneNumber, snapshotForAgent } from "./snapshot";

const base: Parameters<typeof buildBusinessContextSnapshot>[0] = {
  businessId: "biz-1",
  version: "v1",
  generatedAt: "2026-03-08T12:00:00.000Z",
  displayName: "Maple Family Clinic",
  timezone: "America/Toronto",
  defaultLocale: "en",
  businessType: "clinic",
  greeting: "Hello",
  voice: "marin",
  tone: "warm",
  bookingPolicy: "Only confirm after booking.",
  bookingMode: "instant",
  summary: "General clinic",
  hours: [],
  closures: [],
  services: [],
  snippets: [],
  transferPolicy: { mode: "on_request", transferNumber: "+14165551234" },
  staffFirstPolicy: { mode: "always", number: "+14165550001", ringSeconds: 15 },
  appointmentChangePolicy: { enabled: true, allowCancel: true, allowReschedule: true, verificationMode: "otp_required" },
  rules: [{ id: "rule-default", title: "Default", content: "Default rule", order: 0 }],
};

const afterHours: SnapshotAgent = {
  id: "agent-after-hours",
  name: "After hours",
  isDefault: false,
  greeting: "We're closed, but I can help.",
  tone: "calm",
  voice: "cedar",
  voiceInstructions: "After-hours voice",
  smsInstructions: "After-hours text",
  chatInstructions: "After-hours chat",
  bookingPolicy: "Take a request only.",
  bookingMode: "request",
  transferPolicy: { mode: "never" },
  staffFirstPolicy: { mode: "business_hours", number: "+14165550002", ringSeconds: 20, message: "Staff", handoverMessage: "Handover" },
  appointmentChangePolicy: { enabled: false, allowCancel: false, allowReschedule: false, verificationMode: "operator_only" },
  rules: [{ id: "rule-after", title: "After", content: "After-hours rule", order: 0 }],
};

const defaultAgent: SnapshotAgent = {
  id: "agent-default",
  name: "Agent",
  isDefault: true,
  greeting: "Hello",
  tone: "warm",
  voice: "marin",
  voiceInstructions: "",
  smsInstructions: "",
  chatInstructions: "",
  bookingPolicy: "Only confirm after booking.",
  bookingMode: "instant",
  transferPolicy: { mode: "on_request", transferNumber: "+14165551234" },
  staffFirstPolicy: { mode: "always", number: "+14165550001", ringSeconds: 15 },
  appointmentChangePolicy: { enabled: true, allowCancel: true, allowReschedule: true, verificationMode: "otp_required" },
  rules: [],
};

const snapshot: BusinessContextSnapshot = { ...buildBusinessContextSnapshot(base), agents: [defaultAgent, afterHours] };

describe("snapshotForAgent", () => {
  it("replaces every per-agent field with the agent's", () => {
    expect(snapshotForAgent(snapshot, afterHours.id)).toMatchObject({
      agentId: afterHours.id,
      agentName: afterHours.name,
      tone: afterHours.tone,
      greeting: afterHours.greeting,
      voice: afterHours.voice,
      voiceInstructions: afterHours.voiceInstructions,
      smsInstructions: afterHours.smsInstructions,
      chatInstructions: afterHours.chatInstructions,
      bookingPolicy: afterHours.bookingPolicy,
      bookingMode: afterHours.bookingMode,
      transferPolicy: afterHours.transferPolicy,
      staffFirstPolicy: afterHours.staffFirstPolicy,
      appointmentChangePolicy: afterHours.appointmentChangePolicy,
      rules: afterHours.rules,
    });
  });

  it("answers a paused agent's channels as the default agent, on the paused agent's number", () => {
    const paused = { ...afterHours, paused: true, phoneNumber: "+15145550199" };
    const projected = snapshotForAgent({ ...snapshot, agents: [defaultAgent, paused] }, paused.id)!;
    expect(projected).toMatchObject({ agentId: defaultAgent.id, greeting: defaultAgent.greeting, voice: defaultAgent.voice, transferPolicy: defaultAgent.transferPolicy });
    expect(projected.contactChannels.phoneNumber).toBe("+15145550199");
  });

  it("keeps a field for each key of SnapshotAgent, so a new one can't be left out", () => {
    const projected = snapshotForAgent(snapshot, afterHours.id)!;
    const flatName: Record<string, string> = { id: "agentId", name: "agentName" };
    for (const key of Object.keys(afterHours).filter((field) => field !== "isDefault")) {
      expect(projected).toHaveProperty(flatName[key] ?? key, afterHours[key as keyof SnapshotAgent]);
    }
  });

  it("drops the default agent's optional policies when this agent has none", () => {
    const { staffFirstPolicy: _staffFirstPolicy, appointmentChangePolicy: _appointmentChangePolicy, ...plain } = afterHours;
    const projected = snapshotForAgent({ ...snapshot, agents: [defaultAgent, plain] }, plain.id);
    expect(projected).not.toHaveProperty("staffFirstPolicy");
    expect(projected).not.toHaveProperty("appointmentChangePolicy");
  });

  it("leaves what the agents share and the snapshot it was given", () => {
    const before = structuredClone(snapshot);
    const projected = snapshotForAgent(snapshot, afterHours.id)!;
    expect(projected).toMatchObject({ businessId: "biz-1", displayName: "Maple Family Clinic", summary: "General clinic", agents: snapshot.agents });
    expect(snapshot).toEqual(before);
  });

  it("can project a projection again", () => {
    const projected = snapshotForAgent(snapshot, afterHours.id)!;
    expect(snapshotForAgent(projected, defaultAgent.id)).toMatchObject({ greeting: "Hello", agentId: defaultAgent.id, staffFirstPolicy: defaultAgent.staffFirstPolicy });
  });

  it("returns null for an agent the snapshot doesn't list, and never the default", () => {
    expect(snapshotForAgent(snapshot, "agent-unknown")).toBeNull();
    expect(snapshotForAgent({ ...snapshot, agents: [] }, "agent-unknown")).toBeNull();
  });

  it("returns the flat fields when no agent is named", () => {
    expect(snapshotForAgent(snapshot, undefined)).toBe(snapshot);
    expect(snapshotForAgent(snapshot, null)).toBe(snapshot);
  });

  it("projects a snapshot built before agents existed to its flat fields, the default agent", () => {
    expect(demoSnapshot).not.toHaveProperty("agents");
    expect(snapshotForAgent(demoSnapshot)).toBe(demoSnapshot);
    expect(snapshotForAgent(demoSnapshot, "agent-any")).toBe(demoSnapshot);
  });
});

describe("buildBusinessContextSnapshot with agents", () => {
  const agentInput = { id: "agent-default", name: "Agent", isDefault: true, greeting: base.greeting, tone: base.tone, voice: "marin" as const, bookingPolicy: base.bookingPolicy, bookingMode: "instant" as const, transferPolicy: base.transferPolicy };

  it("gives an agent without instructions the same default text as the flat fields", () => {
    const built = buildBusinessContextSnapshot({ ...base, agents: [agentInput] });
    expect(built.agents?.[0]).toMatchObject({ voiceInstructions: built.voiceInstructions, smsInstructions: built.smsInstructions, chatInstructions: built.chatInstructions });
  });

  it("writes each agent's own tone into its default voice instructions", () => {
    const built = buildBusinessContextSnapshot({ ...base, agents: [{ ...agentInput, tone: "calm" }] });
    expect(built.agents?.[0]?.voiceInstructions).toContain("Speak in a calm tone.");
    expect(built.voiceInstructions).toContain("Speak in a warm tone.");
  });

  it("orders and trims an agent's rules as it does the flat rules", () => {
    const rules = [{ id: "second", title: "2", content: "Second", order: 2 }, { id: "first", title: "1", content: "x".repeat(5000), order: 1 }];
    const built = buildBusinessContextSnapshot({ ...base, rules, agents: [{ ...agentInput, rules }] });
    expect(built.agents?.[0]?.rules).toEqual(built.rules);
    expect(built.rules?.map((rule) => rule.id)).toEqual(["first", "second"]);
  });

  it("adds nothing to the flat fields, and leaves agents out unless given them", () => {
    const { agents, ...flat } = buildBusinessContextSnapshot({ ...base, agents: [agentInput] });
    expect(agents).toHaveLength(1);
    expect(flat).toEqual(buildBusinessContextSnapshot(base));
    expect(buildBusinessContextSnapshot(base)).not.toHaveProperty("agents");
  });

  it("keeps today's default instruction text", () => {
    const built = buildBusinessContextSnapshot(base);
    const constraints = "You are the AI receptionist for Maple Family Clinic. Use the business timezone America/Toronto. Use structured business facts as the source of truth for hours, services, and transfer rules. Never promise a booking until the booking tool confirms success.";
    expect(built.voiceInstructions).toBe(`${constraints} Speak in a warm tone. Keep answers concise and helpful.`);
    expect(built.smsInstructions).toBe(`${constraints} Reply clearly in SMS form. Ask one follow-up question at a time.`);
    expect(built.chatInstructions).toBe(`${constraints} Be friendly and concise. Use short paragraphs and plain language.`);
  });
});

describe("an agent's phone number", () => {
  const flat = "+14165550100";
  const own = "+14165550199";
  const withChannels = { ...snapshot, contactChannels: { phoneNumber: flat, smsNumber: "+18005550100", email: "desk@example.com" } };

  it("gives each agent its own number and leaves the other channels", () => {
    const projected = snapshotForAgent({ ...withChannels, agents: [{ ...defaultAgent, phoneNumber: flat }, { ...afterHours, phoneNumber: own }] }, afterHours.id)!;
    expect(projected.contactChannels).toEqual({ phoneNumber: own, smsNumber: "+18005550100", email: "desk@example.com" });
  });

  it("gives an agent with no number none, rather than the first number the business has", () => {
    const projected = snapshotForAgent({ ...withChannels, agents: [{ ...defaultAgent, phoneNumber: flat }, { ...afterHours, phoneNumber: null }] }, afterHours.id)!;
    expect(projected.contactChannels).toEqual({ smsNumber: "+18005550100", email: "desk@example.com" });
  });

  it("keeps the flat number for the default agent of a snapshot from before agents had their own", () => {
    const projected = snapshotForAgent({ ...withChannels, agents: [defaultAgent, afterHours] }, defaultAgent.id)!;
    expect(projected.contactChannels.phoneNumber).toBe(flat);
  });

  it("gives another agent of such a snapshot no number, because the flat one isn't theirs", () => {
    const projected = snapshotForAgent({ ...withChannels, agents: [defaultAgent, afterHours] }, afterHours.id)!;
    expect(projected.contactChannels.phoneNumber).toBeUndefined();
  });

  it("counts a number held by any agent as the business having one", () => {
    expect(businessHasPhoneNumber({ ...snapshot, contactChannels: { phoneNumber: flat } })).toBe(true);
    expect(businessHasPhoneNumber({ ...snapshot, contactChannels: {}, agents: [{ ...defaultAgent, phoneNumber: null }, { ...afterHours, phoneNumber: own }] })).toBe(true);
    expect(businessHasPhoneNumber({ ...snapshot, contactChannels: {}, agents: [{ ...defaultAgent, phoneNumber: null }] })).toBe(false);
    expect(businessHasPhoneNumber({ ...snapshot, contactChannels: {} })).toBe(false);
  });
});
