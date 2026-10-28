import { CONTACT_PASSCODE_DEFAULT_LENGTH, CONTACT_PASSCODE_MAX_LENGTH, CONTACT_PASSCODE_MIN_LENGTH, CONTACT_PASSCODES_MAX_PER_REQUEST, isUuid, weekdays, type ApiHoursWindow } from "@lobbystack/shared";

import { createClient } from "./client";
import { stringValue, type Command, type Group } from "./command";
import { readConfig, resolveConnection, writeConfig } from "./config";
import { CliError, exitCodes } from "./errors";
import { defaultSleep, operationCommand, showRecord, waitUntilDone, type Column, type OperationSpec, type Row } from "./operations";
import { formatTable, print } from "./output";
import { readUploadFile, uploadKnowledgeFile } from "./upload";
import { userAgent } from "./version";
import { checkoutWait, claimWait, sourceWait } from "./waits";

// The command groups. Most commands are specs for operationCommand; the few
// that need more than one call, or a file, are written out below.

type Entry = OperationSpec | ((path: string) => Command);

function group(name: string, summary: string, entries: Record<string, Entry>): [string, Group] {
  const commands = Object.fromEntries(Object.entries(entries).map(([command, entry]) => {
    const path = `${name} ${command}`;
    return [command, typeof entry === "function" ? entry(path) : operationCommand(path, entry)];
  }));
  return [name, { summary, commands }];
}

const columns = (...keys: string[]): Column[] => keys.map((key) => ({ key, label: key.replace(/_/g, " ").replace(/^./, (first) => first.toUpperCase()) }));

const businessUse = (path: string): Command => ({
  summary: "Make a business the one this profile's commands act on.",
  usage: `lobbystack ${path} <business_id> [--profile <name>]`,
  operations: ["getBusiness"],
  async run({ io, output, values, positionals, configPath }) {
    const [id, ...extra] = positionals;
    if (!id || extra.length) throw new CliError(`Usage: lobbystack ${path} <business_id> [--profile <name>]`);
    if (!isUuid(id)) throw new CliError("<business_id> must be a business id, a UUID such as 5d0bd9a4-7e1c-4a51-9a50-8e1b2c3d4e5f.");
    const connection = resolveConnection(await readConfig(configPath), io.env, { profile: stringValue(values, "profile"), business: id });
    const profile = connection.profile;
    if (profile === null) throw new CliError("LOBBYSTACK_URL and LOBBYSTACK_API_KEY are in use, so there's no profile to save the business in. Set LOBBYSTACK_BUSINESS instead.");
    // Checks the key can act on it before saving it.
    const business = (await createClient({ url: connection.url, key: connection.key, business: id, userAgent, ...(io.fetch ? { fetch: io.fetch } : {}) }).call("getBusiness")).data;
    // Read again: another command may have changed the file during the call.
    const config = await readConfig(configPath);
    const saved = config.profiles[profile];
    if (!saved || saved.url !== connection.url || saved.key !== connection.key) throw new CliError(`The ${profile} profile changed while this ran. Run the command again.`);
    config.profiles[profile] = { ...saved, business: id };
    await writeConfig(configPath, config);
    print(output, business, () => `The ${profile} profile now acts on ${business.name} (${id}).`);
  },
});

const windowPattern = /^((?:[01]\d|2[0-3]):[0-5]\d|24:00)-((?:[01]\d|2[0-3]):[0-5]\d|24:00)$/;

function hoursTable(hours: readonly ApiHoursWindow[]): string {
  return formatTable(weekdays.map((day) => ({ day, hours: hours.filter((window) => window.day === day).map((window) => `${window.open}-${window.close}`).join(", ") || "closed" })), columns("day", "hours"));
}

const hoursGet = (path: string): Command => ({
  summary: "Show the opening hours, day by day.",
  usage: `lobbystack ${path}`,
  operations: ["getBusiness"],
  async run({ output, connect }) {
    const { client } = await connect();
    const { hours } = (await client.call("getBusiness")).data;
    print(output, hours, () => hoursTable(hours));
  },
});

const hoursSet = (path: string): Command => {
  const usage = `lobbystack ${path} [--monday 09:00-17:00] [--saturday 10:00-14:00] [--sunday closed] ...`;
  return {
    summary: "Change the opening hours of the days named. The other days keep theirs.",
    usage,
    options: Object.fromEntries(weekdays.map((day) => [day, { type: "string", placeholder: "<hours>", description: day === "sunday" ? "HH:MM-HH:MM, two windows separated by a comma for a break, or closed." : "" }])),
    operations: ["getBusiness", "updateBusiness"],
    async run({ output, values, positionals, connect }) {
      if (positionals.length) throw new CliError(`Usage: ${usage}`);
      const changed = new Map<string, ApiHoursWindow[]>();
      for (const day of weekdays) {
        const raw = stringValue(values, day);
        if (raw === undefined) continue;
        changed.set(day, raw.trim() === "closed" ? [] : raw.split(",").map((part) => {
          const match = windowPattern.exec(part.trim());
          if (!match) throw new CliError(`--${day} takes HH:MM-HH:MM, such as 09:00-17:00, two of them separated by a comma, or closed.`);
          return { day, open: match[1]!, close: match[2]! };
        }));
      }
      if (!changed.size) throw new CliError(`Name at least one day.\nUsage: ${usage}`);
      const { client } = await connect();
      // The API replaces the whole week, so the days left out are sent as they are.
      const current = (await client.call("getBusiness")).data.hours;
      const hours = weekdays.flatMap((day) => changed.get(day) ?? current.filter((window) => window.day === day));
      const business = (await client.call("updateBusiness", { body: { hours } })).data;
      print(output, business.hours, () => hoursTable(business.hours));
    },
  };
};

const knowledgeUpload = (path: string): Command => {
  const usage = `lobbystack ${path} <file> [--title <title>] [--tags <tag,tag>] [--wait]`;
  return {
    summary: "Upload a document the receptionist can answer from: PDF, Word, text, Markdown or an image, up to 10 MB.",
    usage,
    options: {
      title: { type: "string", placeholder: "<title>", description: "Defaults to the file's name." },
      tags: { type: "string", multiple: true, placeholder: "<tag>", description: "Repeat the flag or separate with commas." },
      wait: { type: "boolean", description: "Wait until it's read, checking every few seconds. A failure exits with 1." },
    },
    operations: ["createKnowledgeUpload", "completeKnowledgeUpload", "getKnowledgeSource"],
    async run(context) {
      const { io, output, values, positionals } = context;
      const [path, ...extra] = positionals;
      if (!path || extra.length) throw new CliError(`Usage: ${usage}`);
      const file = await readUploadFile(path);
      const { client, connection } = await context.connect();
      const tags = values.tags === undefined ? undefined : (Array.isArray(values.tags) ? values.tags : [String(values.tags)]).flatMap((tag) => tag.split(",")).map((tag) => tag.trim()).filter(Boolean);
      let source = await uploadKnowledgeFile(client, { baseUrl: connection.url, fetch: io.fetch ?? fetch, file, title: typeof values.title === "string" ? values.title : undefined, tags });
      if (values.wait === true) source = await waitUntilDone(client, sourceWait, source, io.sleep ?? defaultSleep);
      print(output, source, () => showRecord(source));
      const failure = values.wait === true ? sourceWait.failed(source) : undefined;
      if (failure) throw new CliError(failure, exitCodes.failed);
    },
  };
};

function generatedPinsText(path: string, given: readonly Row[], remaining: number): string {
  const pins = given.length ? `${formatTable(given, columns("id", "name", "phone", "new_passcode"))}\n\nThese PINs aren't shown again, so give each customer theirs.` : "No contact got a new PIN.";
  const rest = remaining === 0 ? "Every contact with a phone number has a PIN." : `${remaining === 1 ? "1 contact with a phone number still has" : `${remaining} contacts with a phone number still have`} no PIN. To give them one, run lobbystack ${path} --all.`;
  return `${pins}\n\n${rest}`;
}

const contactsGeneratePins = (path: string): Command => {
  const usage = `lobbystack ${path} [<contact_id>...] [--length <digits>] [--all]`;
  return {
    summary: "Give contacts a random keypad PIN, and show each PIN this once.",
    usage,
    arguments: [{ name: "contact_id...", description: `Contacts to give a new PIN, replacing any PIN they have. Leave them out for contacts that have a phone number and no PIN, ${CONTACT_PASSCODES_MAX_PER_REQUEST} at a time.` }],
    options: {
      length: { type: "string", placeholder: "<digits>", description: `Digits in each PIN, ${CONTACT_PASSCODE_MIN_LENGTH} to ${CONTACT_PASSCODE_MAX_LENGTH}. Defaults to ${CONTACT_PASSCODE_DEFAULT_LENGTH}.` },
      all: { type: "boolean", description: "Keep going until every contact with a phone number has a PIN." },
    },
    notes: "LobbyStack keeps only a hash of each PIN, so this is the only time the PINs are shown. Keep the output safe until every customer has theirs.",
    operations: ["generateContactPasscodes"],
    async run({ output, values, positionals, connect }) {
      const digits = stringValue(values, "length");
      const length = digits === undefined ? undefined : Number(digits);
      if (length !== undefined && (!/^\d+$/.test(digits!) || length < CONTACT_PASSCODE_MIN_LENGTH || length > CONTACT_PASSCODE_MAX_LENGTH)) throw new CliError(`--length takes ${CONTACT_PASSCODE_MIN_LENGTH} to ${CONTACT_PASSCODE_MAX_LENGTH}.`);
      if (values.all === true && positionals.length) throw new CliError(`--all gives a PIN to the contacts without one, so it takes no contact ids.\nUsage: ${usage}`);
      const body = { ...(positionals.length ? { contact_ids: positionals } : {}), ...(length !== undefined ? { length } : {}) };
      const { client } = await connect();
      const given: Row[] = [];
      let remaining = 0;
      const show = () => print(output, { contacts: given, remaining }, () => generatedPinsText(path, given, remaining));
      try {
        for (;;) {
          const batch = (await client.call("generateContactPasscodes", { body })).data;
          given.push(...batch.contacts);
          remaining = batch.remaining;
          // A request that gave no PIN stops the loop rather than repeating it.
          if (values.all !== true || remaining === 0 || !batch.contacts.length) break;
        }
      } catch (error) {
        // The PINs given so far exist nowhere else, so they're shown before the error.
        if (given.length) show();
        throw error;
      }
      show();
    },
  };
};

function teamTables(data: Row): string {
  const members = data.members as Row[];
  const invitations = data.invitations as Row[];
  return [`Members\n${formatTable(members, columns("id", "name", "email", "role", "joined_at"))}`, `Invitations\n${formatTable(invitations, columns("id", "email", "role", "status", "transfers_ownership", "expires_at"))}`].join("\n\n");
}

function onboardingTable(data: Row): string {
  const checklist = data.checklist as Row[];
  const missing = data.missing as string[];
  return `${formatTable(checklist.map((item) => ({ ...item, required: item.required ? "yes" : "" })), columns("id", "status", "required"))}\n\nStage: ${String(data.stage)}. ${data.complete ? "Onboarding is complete." : missing.length ? `Still needed to finish: ${missing.join(", ")}.` : "Ready to finish with lobbystack onboarding complete."}`;
}

export const groups: Record<string, Group> = Object.fromEntries([
  group("business", "Create, list and pick businesses, and change their details.", {
    list: { operation: "listBusinesses", columns: columns("id", "name", "timezone", "onboarding_stage", "created_at") },
    create: { operation: "createBusiness", args: ["name"] },
    get: { operation: "getBusiness" },
    update: { operation: "updateBusiness" },
    use: businessUse,
  }),
  group("users", "Invite owners who have no LobbyStack account yet to sign up, with a platform key.", {
    create: { operation: "createUser", args: ["email"] },
  }),
  group("hours", "See and change the opening hours.", { get: hoursGet, set: hoursSet }),
  group("receptionist", "See and change how the receptionist greets, answers and books.", {
    get: { operation: "getReceptionist" },
    set: { operation: "updateReceptionist", files: ["summary", "booking_policy", "voice_instructions", "sms_instructions", "chat_instructions"] },
  }),
  group("services", "The services customers can book.", {
    list: { operation: "listServices", columns: columns("id", "name", "duration_minutes", "active", "staff_ids") },
    add: { operation: "createService", args: ["name"] },
    update: { operation: "updateService" },
    remove: { operation: "deleteService" },
  }),
  group("staff", "The people who take appointments.", { list: { operation: "listStaff", columns: columns("id", "name", "active", "timezone", "service_ids") } }),
  group("rules", "The instructions the receptionist follows.", {
    list: { operation: "listRules", columns: columns("id", "title", "active", "updated_at") },
    add: { operation: "createRule", files: ["content"] },
    update: { operation: "updateRule", files: ["content"] },
    remove: { operation: "deleteRule" },
    reorder: { operation: "reorderRules", args: ["...rule_ids"], columns: columns("id", "title", "active") },
  }),
  group("knowledge", "What the receptionist answers from: text, FAQs, websites and documents.", {
    list: { operation: "listKnowledgeEntries", columns: columns("id", "type", "title", "active", "updated_at") },
    get: { operation: "getKnowledgeEntry" },
    "add-text": { operation: "createKnowledgeEntry", summary: "Add text the receptionist can answer from.", fixed: { type: "text" }, files: ["content"] },
    "add-faq": { operation: "createKnowledgeEntry", summary: "Add a question and its answer.", fixed: { type: "faq" }, files: ["answer"] },
    update: { operation: "updateKnowledgeEntry", files: ["content"] },
    remove: { operation: "deleteKnowledgeEntry" },
    "add-website": { operation: "createKnowledgeSource", args: ["url"], fixed: { type: "website" }, wait: sourceWait },
    upload: knowledgeUpload,
    sources: { operation: "listKnowledgeSources", columns: columns("id", "type", "title", "status", "active", "url") },
    source: { operation: "getKnowledgeSource" },
    "source-update": { operation: "updateKnowledgeSource" },
    "source-remove": { operation: "deleteKnowledgeSource" },
    expand: { operation: "expandKnowledgeSource", wait: sourceWait },
    retry: { operation: "retryKnowledgeSource", wait: sourceWait },
    cancel: { operation: "cancelKnowledgeSource" },
  }),
  group("billing", "The plan, its checkout and the spending cap.", {
    status: { operation: "getBilling" },
    cap: { operation: "updateBilling", args: ["spending_cap_cents"] },
    checkout: { operation: "createCheckout", wait: checkoutWait, show: (data) => data.checkout_url ? `Send this page to whoever pays: ${String(data.checkout_url)}` : `${showRecord(data)}\n\nThe page isn't ready yet. Wait for it with --wait, or check with lobbystack billing checkout-status ${String(data.id)}.` },
    "checkout-status": { operation: "getCheckout" },
    "managed-plan": { operation: "setManagedPlan", fixed: { plan: "enterprise" } },
    "end-managed-plan": { operation: "endManagedPlan" },
  }),
  group("numbers", "Find, claim, replace and release phone numbers.", {
    list: { operation: "listPhoneNumbers", columns: columns("id", "phone_number", "status", "release_scheduled_at") },
    search: { operation: "searchPhoneNumbers", columns: columns("phone_number", "locality", "region", "kind", "expires_at", "offer_token") },
    claim: { operation: "createPhoneNumberClaim", args: ["offer_token"], wait: claimWait },
    "claim-status": { operation: "getPhoneNumberClaim" },
    replace: { operation: "replacePhoneNumber", args: ["offer_token"], wait: claimWait },
    release: { operation: "releasePhoneNumber" },
  }),
  group("onboarding", "How far setup is, and finishing it.", {
    status: { operation: "getOnboarding", show: onboardingTable },
    skip: { operation: "updateOnboarding", args: ["...skip_steps"], show: onboardingTable },
    complete: { operation: "completeOnboarding", show: onboardingTable },
  }),
  group("team", "Who can sign in to the business, and handing it over.", {
    list: { operation: "getTeam", show: teamTables },
    invite: { operation: "createTeamInvitation", args: ["email"] },
    revoke: { operation: "revokeTeamInvitation" },
    role: { operation: "updateTeamMember", args: ["role"] },
    remove: { operation: "removeTeamMember" },
    "transfer-owner": { operation: "createClaimLink", args: ["email"], show: (data) => `Sent ${String((data.invitation as Row).email)} a link to claim the business. You can also send it yourself:\n${String(data.url)}` },
  }),
  group("widget", "The chat widget on the business's websites.", {
    list: { operation: "listWidgetKeys", columns: columns("id", "label", "status", "allowed_origins", "last_used_at") },
    create: { operation: "createWidgetKey", show: (data) => `Key: ${String(data.key)} (shown only now)\n\nPaste this into the website's HTML:\n${String(data.embed_snippet)}` },
    update: { operation: "updateWidgetKey" },
  }),
  group("calendar", "Google Calendar connections.", {
    connect: { operation: "createCalendarConnectLink", show: (data) => `Send this link to whoever owns the Google Calendar. It works until ${String(data.expires_at)}:\n${String(data.url)}` },
    list: { operation: "listCalendarConnections", columns: columns("id", "account_id", "calendar_id", "staff_id", "status", "last_synced_at") },
    calendars: { operation: "listAccountCalendars", columns: columns("id", "name", "primary", "writable", "selected") },
    set: { operation: "updateCalendarConnection" },
    disconnect: { operation: "deleteCalendarConnection" },
  }),
  group("alerts", "The alerts the key's account gets about the business.", {
    get: { operation: "getNotificationPreferences" },
    set: { operation: "updateNotificationPreferences" },
  }),
  group("webhooks", "Endpoints that receive events.", {
    list: { operation: "listWebhooks", columns: columns("id", "url", "status", "events") },
    add: { operation: "createWebhook", args: ["url"] },
    get: { operation: "getWebhook" },
    update: { operation: "updateWebhook" },
    remove: { operation: "deleteWebhook" },
    test: { operation: "testWebhook" },
  }),
  group("contacts", "The business's contacts.", {
    list: { operation: "listContacts", columns: columns("id", "name", "phone", "email", "created_at") },
    get: { operation: "getContact" },
    add: { operation: "createContact" },
    update: { operation: "updateContact" },
    "set-pins": { operation: "setContactPasscodes", columns: columns("id", "name", "phone", "passcode") },
    "generate-pins": contactsGeneratePins,
  }),
  group("appointments", "Appointments and open times.", {
    list: { operation: "listAppointments", columns: columns("id", "starts_at", "status", "service_name", "staff_name", "contact_name") },
    get: { operation: "getAppointment" },
    availability: { operation: "getAvailability", columns: columns("starts_at", "ends_at") },
    book: { operation: "createAppointment" },
    cancel: { operation: "cancelAppointment" },
    reschedule: { operation: "rescheduleAppointment" },
  }),
  group("calls", "Calls the receptionist took.", {
    list: { operation: "listCalls", columns: columns("id", "started_at", "caller_phone", "outcome", "duration_seconds") },
    get: { operation: "getCall" },
  }),
  group("messages", "Messages the receptionist took for the team.", {
    list: { operation: "listMessages", columns: columns("id", "created_at", "status", "urgency", "caller_name", "title") },
  }),
  // The partner itself, with a key a partner made in its console.
  group("partner", "The partner your key acts as, and handing over or deleting its businesses.", {
    get: { operation: "getPartner" },
    release: { operation: "releasePartnerBusiness" },
    "delete-business": { operation: "deletePartnerBusiness" },
    "business-billing": { operation: "getPartnerBusinessBilling" },
    "set-business-billing": { operation: "updatePartnerBusinessBilling" },
  }),
  group("demos", "Prospect demos under the partner's brand.", {
    list: { operation: "listPartnerDemos", columns: columns("id", "business_name", "status", "expires_at", "website_url") },
    get: { operation: "getPartnerDemo" },
    create: { operation: "createPartnerDemo", args: ["name", "website_url"], show: (data) => `${showRecord(data)}\n\nThe token and link aren't shown again. Publish the demo with lobbystack demos publish ${String(data.id)} --token <token> once lobbystack demos get ${String(data.id)} says it's ready.` },
    publish: { operation: "publishPartnerDemo" },
    rotate: { operation: "rotatePartnerDemoLink" },
    revoke: { operation: "revokePartnerDemo" },
    delete: { operation: "deletePartnerDemo" },
  }),
  group("packages", "What the partner sells its businesses through its Stripe account.", {
    list: { operation: "listPartnerPackages", columns: columns("id", "name", "currency", "monthly_price_minor", "setup_fee_minor") },
    create: { operation: "createPartnerPackage", args: ["name"] },
    rename: { operation: "updatePartnerPackage", args: ["name"] },
    archive: { operation: "archivePartnerPackage" },
  }),
  group("brand", "The partner's name, colors and links.", {
    get: { operation: "getPartnerBrand" },
    set: { operation: "updatePartnerBrand" },
  }),
  group("domain", "The partner's subdomain and its own domain.", {
    get: { operation: "getPartnerDomains" },
    add: { operation: "addPartnerDomain", args: ["hostname"] },
    remove: { operation: "removePartnerDomain" },
  }),
  group("templates", "Setups saved from the partner's businesses, which new businesses can start from.", {
    list: { operation: "listPartnerTemplates", columns: columns("id", "name", "created_at") },
    save: { operation: "createPartnerTemplate", args: ["business_id", "name"] },
    delete: { operation: "deletePartnerTemplate" },
  }),
  group("partner-team", "Who works in the partner's console.", {
    list: { operation: "getPartnerTeam", show: (data) => [`Members\n${formatTable(data.members as Row[], columns("id", "name", "email", "role", "joined_at"))}`, `Invitations\n${formatTable(data.invitations as Row[], columns("id", "email", "role", "expires_at"))}`].join("\n\n") },
    invite: { operation: "createPartnerTeamInvitation", args: ["email", "role"] },
    role: { operation: "updatePartnerTeamMember", args: ["role"] },
    remove: { operation: "removePartnerTeamMember" },
    revoke: { operation: "revokePartnerTeamInvitation" },
  }),
  group("payments", "The partner's Stripe account, its tier and the pool its businesses share.", {
    stripe: { operation: "getPartnerStripe" },
    "stripe-onboarding": { operation: "createPartnerStripeOnboardingLink", show: (data) => `Send whoever completes Stripe's onboarding to this page. It works once:\n${String(data.url)}` },
    billing: { operation: "getPartnerBilling" },
    overage: { operation: "updatePartnerPoolOverage", args: ["enabled"] },
    checkout: { operation: "createPartnerTierCheckout", args: ["tier", "interval"], show: (data) => data.checkout_url ? `Open this page to pay: ${String(data.checkout_url)}` : `${showRecord(data)}\n\nThe page isn't ready yet. Check with lobbystack payments checkout-status ${String(data.id)}.` },
    "checkout-status": { operation: "getPartnerTierCheckout" },
  }),
]);
