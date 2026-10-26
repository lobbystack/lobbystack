import { describe, expect, it } from "vitest";

import { applyBusinessTemplate, applyWebsites, businessTemplateSchema, onboardManifestSchema, type BusinessSetupPort, type BusinessTemplate, type SetupChange, type SetupFile } from "./businessSetup";

type Row = Record<string, unknown>;

/** A business in memory behind the port, which records every write. */
function fakeBusiness(options: { files?: boolean } = {}) {
  let next = 1;
  const id = () => `00000000-0000-4000-8000-${String(next++).padStart(12, "0")}`;
  const state = {
    business: { id: id(), name: "Pier Dental", timezone: "America/Vancouver", locale: "en", website_url: null as string | null, business_type: "service_company", onboarding_stage: "website", booking_mode: "instant", hours: [] as Row[], created_at: "", updated_at: "" },
    receptionist: { greeting: "Hi", tone: "warm", summary: "Pier Dental", summary_source: "placeholder", booking_policy: "Book", voice_instructions: null, sms_instructions: null, chat_instructions: null, transfer_mode: "on_request", transfer_number: null, booking_mode: "instant", appointment_change_policy: { enabled: true, allow_cancel: true, allow_reschedule: true, verification_mode: "phone_match_and_facts" }, updated_at: "" } as Row,
    services: [] as Row[],
    rules: [] as Row[],
    entries: [] as Row[],
    sources: [] as Row[],
    writes: [] as string[],
  };
  const port: BusinessSetupPort = {
    getBusiness: async () => state.business as never,
    updateBusiness: async (changes) => { state.writes.push(`business ${Object.keys(changes).join(",")}`); Object.assign(state.business, changes); },
    getReceptionist: async () => state.receptionist as never,
    updateReceptionist: async (changes) => { state.writes.push(`receptionist ${Object.keys(changes).join(",")}`); Object.assign(state.receptionist, changes); },
    listServices: async () => state.services as never,
    createService: async (service) => { state.writes.push(`service ${service.name}`); state.services.push({ id: id(), active: true, staff_ids: [], ...service }); },
    updateService: async (serviceId, changes) => { state.writes.push(`service update ${serviceId}`); Object.assign(state.services.find((service) => service.id === serviceId)!, changes); },
    listRules: async () => state.rules as never,
    createRule: async (rule) => { state.writes.push(`rule ${rule.title}`); state.rules.push({ id: id(), active: true, ...rule }); },
    updateRule: async (ruleId, changes) => { state.writes.push(`rule update ${ruleId}`); Object.assign(state.rules.find((rule) => rule.id === ruleId)!, changes); },
    listKnowledgeEntries: async (type) => state.entries.filter((entry) => entry.type === type) as never,
    createKnowledgeEntry: async (entry) => {
      const [title, content] = entry.type === "faq" ? [entry.question, entry.answer] : [entry.title, entry.content];
      state.writes.push(`${entry.type} ${title}`);
      state.entries.push({ id: id(), type: entry.type, title, content });
    },
    updateKnowledgeEntry: async (entryId, changes) => { state.writes.push(`entry update ${entryId}`); Object.assign(state.entries.find((entry) => entry.id === entryId)!, changes); },
    listKnowledgeSources: async (type) => state.sources.filter((source) => source.type === type) as never,
    addWebsite: async (url) => {
      state.writes.push(`website ${url}`);
      const source = { id: id(), type: "website", title: url, url, status: "processing", error: null, active: true, page_limit: 10 };
      state.sources.push(source);
      return source as never;
    },
    ...(options.files === false ? {} : {
      async uploadFile(file: SetupFile) {
        state.writes.push(`file ${file.path}`);
        state.sources.push({ id: id(), type: "file", title: file.title ?? file.path, url: null, status: "pending", error: null, active: true, page_limit: null });
      },
    }),
  };
  return { state, port };
}

const template: BusinessTemplate = businessTemplateSchema.parse({
  business: { name: "Harbor Dental", timezone: "America/Toronto", locale: "fr", business_type: "dental", hours: [{ day: "mon", open: "08:00", close: "17:00" }] },
  receptionist: { greeting: "Thanks for calling, how can we help?", booking_mode: "request" },
  services: [{ name: "Cleaning", duration_minutes: 45 }],
  rules: [{ title: "Emergencies", content: "Send emergencies to the dentist on call." }],
  knowledge: {
    websites: ["https://harbor.example.com"],
    read_full_site: true,
    files: ["prices.pdf", { path: "forms/intake.pdf", title: "Intake form" }],
    faqs: [{ question: "Do you take new patients?", answer: "Yes." }],
    texts: [{ title: "Parking", content: "Behind the building." }],
  },
});

describe("applyBusinessTemplate", () => {
  it("sets the business up from the template in onboard's order, then changes nothing when applied again", async () => {
    const { state, port } = fakeBusiness();
    const first = await applyBusinessTemplate(port, template);
    expect(state.writes).toEqual([
      "business name,timezone,locale,business_type,hours",
      "receptionist greeting,booking_mode",
      "service Cleaning",
      "rule Emergencies",
      "website https://harbor.example.com",
      "file prices.pdf",
      "file forms/intake.pdf",
      "faq Do you take new patients?",
      "text Parking",
    ]);
    expect(state.business.hours).toEqual([{ day: "monday", open: "08:00", close: "17:00" }]);
    // The whole site is read once the sample is, which the template leaves for the dashboard.
    expect(first.changes.at(-1)).toEqual({ step: "full site", action: "left", detail: "https://harbor.example.com: read the whole site from the dashboard once the sample is read" });

    state.writes.length = 0;
    const second = await applyBusinessTemplate(port, template);
    expect(state.writes).toEqual([]);
    expect(second.changes.filter((change) => !["unchanged", "left"].includes(change.action))).toEqual([]);
  });

  it("changes only what differs, and with a plan changes nothing", async () => {
    const { state, port } = fakeBusiness();
    await applyBusinessTemplate(port, template);
    const changed = businessTemplateSchema.parse({ ...template, rules: [{ title: "emergencies ", content: "Call 911 first." }], knowledge: { ...template.knowledge, faqs: [{ question: "Do you take new patients?", answer: "Yes, on weekdays." }] } });

    state.writes.length = 0;
    const planned = await applyBusinessTemplate(port, changed, { plan: true });
    expect(state.writes).toEqual([]);
    expect(planned.changes.filter((change) => change.action !== "unchanged" && change.action !== "left")).toEqual<SetupChange[]>([
      // Found by its name whatever the case, so the new spelling is a change to it.
      { step: "rule emergencies", action: "would update", detail: "title, content" },
      { step: "FAQ Do you take new patients?", action: "would update", detail: "answer" },
    ]);

    await applyBusinessTemplate(port, changed);
    expect(state.writes).toEqual([expect.stringMatching(/^rule update /), expect.stringMatching(/^entry update /)]);
  });

  it("needs a port that uploads documents when the template lists any", async () => {
    const { port } = fakeBusiness({ files: false });
    await expect(applyBusinessTemplate(port, template)).rejects.toThrow("This setup can't upload the template's documents.");
    const { state, port: withoutFiles } = fakeBusiness({ files: false });
    await applyBusinessTemplate(withoutFiles, { ...template, knowledge: { faqs: template.knowledge!.faqs! } });
    expect(state.writes).toContain("faq Do you take new patients?");
  });
});

describe("applyWebsites", () => {
  it("reports a site whose reading stopped, unless the caller reads it again", async () => {
    const { state, port } = fakeBusiness();
    state.sources.push({ id: "site", type: "website", title: "https://harbor.example.com", url: "https://harbor.example.com/", status: "error", error: "The site didn't answer.", active: true, page_limit: 10 });
    const changes: SetupChange[] = [];
    const run = { port, plan: false, log: (change: SetupChange) => { changes.push(change); } };
    expect(await applyWebsites(run, ["harbor.example.com"])).toEqual([]);
    expect(changes).toEqual([{ step: "websites", action: "not read", detail: "harbor.example.com: The site didn't answer." }]);
    const retried = await applyWebsites(run, ["harbor.example.com"], { unreadable: async (source) => ({ ...source, status: "processing" }) });
    expect(retried).toEqual([expect.objectContaining({ id: "site", status: "processing" })]);
    expect(state.writes).toEqual([]);
  });
});

describe("businessTemplateSchema", () => {
  it("holds a setup without anything that belongs to one business, and reads as an onboard manifest", () => {
    expect(onboardManifestSchema.safeParse(template).success).toBe(true);
    const refused = (change: Row) => businessTemplateSchema.safeParse({ ...template, ...change }).error?.issues.map((issue) => issue.path.join(".") || issue.message);
    expect(refused({ business: { ...template.business, id: "5d0bd9a4-7e1c-4a51-9a50-8e1b2c3d4e5f" } })).toBeDefined();
    expect(refused({ business: { ...template.business, slug: "harbor" } })).toBeDefined();
    expect(refused({ plan: { managed: true } })).toBeDefined();
    expect(refused({ phone_number: { country: "CA" } })).toBeDefined();
    expect(refused({ owner: { email: "owner@harbor.example.com" } })).toBeDefined();
    expect(refused({ onboarding: { complete: true } })).toBeDefined();
    expect(refused({ receptionist: { transfer_number: "+14165550100" } })).toBeDefined();
    expect(refused({ services: [{ name: "Cleaning", duration_minutes: 45, staff_ids: ["5d0bd9a4-7e1c-4a51-9a50-8e1b2c3d4e5f"] }] })).toBeDefined();
    expect(refused({ rules: [{ title: "A", content: "One." }, { title: "a", content: "Two." }] })).toEqual(["rules.1.title"]);
  });
});
