import { z } from "zod";

import { ONBOARDING_CRAWL_PAGE_LIMIT, weekdays } from "./publicApi/constants";
import {
  apiBusinessCreateSchema,
  apiPhoneNumberSearchSchema,
  apiReceptionistUpdateSchema,
  apiRuleCreateSchema,
  apiServiceCreateSchema,
  type ApiBusiness,
  type ApiBusinessUpdate,
  type ApiKnowledgeEntry,
  type ApiKnowledgeEntryCreate,
  type ApiKnowledgeSource,
  type ApiReceptionist,
  type ApiReceptionistUpdate,
  type ApiRule,
  type ApiRuleCreate,
  type ApiRuleUpdate,
  type ApiService,
  type ApiServiceCreate,
  type ApiServiceUpdate,
} from "./publicApi/schemas";

// A business's setup in the file lobbystack onboard reads, and the one
// compare-then-change implementation that makes a business match it. The CLI
// applies a manifest over the v1 API, and the admin applies a partner's
// template in-process; each passes its own BusinessSetupPort. Every step reads
// first and changes only what differs, so applying the same setup again
// changes nothing.

type Row = Record<string, unknown>;

const dayNames = new Map<string, (typeof weekdays)[number]>([...weekdays.map((day) => [day, day] as const), ...weekdays.map((day) => [day.slice(0, 3), day] as const)]);
const clock = z.string().regex(/^(?:(?:[01]\d|2[0-3]):[0-5]\d|24:00)$/, "Use 24-hour HH:MM in quotes, such as \"08:00\".");
const hoursWindow = z.strictObject({
  day: z.string().transform((value, context) => {
    const day = dayNames.get(value.trim().toLowerCase());
    if (!day) context.addIssue({ code: "custom", message: "Use a day such as mon or monday." });
    return day ?? "monday";
  }),
  open: clock,
  close: clock,
});
const fileEntry = z.union([z.string().trim().min(1), z.strictObject({ path: z.string().trim().min(1), title: z.string().trim().min(1).max(1_000).optional(), tags: z.array(z.string().trim().min(1)).optional() })]);

/** The address the API keeps for a website: https unless it says otherwise, without a trailing slash, query or fragment. */
export function websiteKey(value: string): string {
  const trimmed = value.trim();
  try {
    // As the API reads it, a colon before a digit starts a port, as in example.com:8080, not a scheme.
    const url = new URL(/^[a-z][a-z0-9+.-]*:(?!\d)/i.test(trimmed) ? trimmed : `https://${trimmed}`);
    return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
  } catch {
    return trimmed;
  }
}

/** The text a name is found by on a rerun. */
export const nameKey = (value: string) => value.trim().toLowerCase();

const receptionistSchema = apiReceptionistUpdateSchema.refine((receptionist) => receptionist.regenerate_summary === undefined, {
  path: ["regenerate_summary"],
  message: "It isn't a setting, so every run would write a new summary. Run lobbystack receptionist set --regenerate-summary once instead.",
});

const knowledgeSchema = z.strictObject({
  websites: z.array(z.string().trim().min(1)).optional(),
  read_full_site: z.boolean().optional(),
  files: z.array(fileEntry).optional(),
  faqs: z.array(z.strictObject({ question: z.string().trim().min(1).max(300), answer: z.string().trim().min(1).max(20_000) })).optional(),
  texts: z.array(z.strictObject({ title: z.string().trim().min(1).max(300), content: z.string().trim().min(1).max(20_000) })).optional(),
});

type UniqueSections = {
  services?: ReadonlyArray<{ name: string }> | undefined;
  rules?: ReadonlyArray<{ title: string }> | undefined;
  knowledge?: { websites?: readonly string[] | undefined; faqs?: ReadonlyArray<{ question: string }> | undefined; texts?: ReadonlyArray<{ title: string }> | undefined } | undefined;
};

// A rerun finds each entry again by its name, so two entries with one name would be one.
function uniqueEntries(setup: UniqueSections, context: z.RefinementCtx): void {
  const unique = <T>(items: readonly T[] | undefined, key: (item: T) => string, path: (index: number) => PropertyKey[]) => {
    const seen = new Map<string, number>();
    items?.forEach((item, index) => {
      const first = seen.get(key(item));
      if (first === undefined) seen.set(key(item), index);
      else context.addIssue({ code: "custom", path: path(index), message: `It repeats entry ${first}. Give each entry its own name, or remove one.` });
    });
  };
  unique(setup.services, (service) => nameKey(service.name), (index) => ["services", index, "name"]);
  unique(setup.rules, (rule) => nameKey(rule.title), (index) => ["rules", index, "title"]);
  unique(setup.knowledge?.websites, websiteKey, (index) => ["knowledge", "websites", index]);
  unique(setup.knowledge?.faqs, (faq) => nameKey(faq.question), (index) => ["knowledge", "faqs", index, "question"]);
  unique(setup.knowledge?.texts, (text) => nameKey(text.title), (index) => ["knowledge", "texts", index, "title"]);
}

/**
 * The file lobbystack onboard reads: a business and everything set up for it.
 * Its sections take the API's own request schemas, so the manifest takes what
 * the endpoints take, and a mistake shows before anything changes.
 */
export const onboardManifestSchema = z.strictObject({
  // The owner gets their own section, which a partner's key sends as owner_email.
  business: apiBusinessCreateSchema.omit({ owner_email: true }).extend({
    id: z.uuid().optional(),
    hours: z.array(hoursWindow).max(28).optional(),
  }),
  receptionist: receptionistSchema.optional(),
  services: z.array(apiServiceCreateSchema).optional(),
  rules: z.array(apiRuleCreateSchema).optional(),
  knowledge: knowledgeSchema.optional(),
  plan: z.union([
    z.strictObject({ managed: z.literal(true) }),
    z.strictObject({ checkout: z.strictObject({ plan: z.enum(["starter", "pro"]), interval: z.enum(["monthly", "annual"]) }) }),
  ]).optional(),
  phone_number: apiPhoneNumberSearchSchema.omit({ limit: true, replaces: true }).optional(),
  onboarding: z.strictObject({ complete: z.boolean().optional(), skip_number: z.boolean().optional(), source: z.string().trim().min(1).max(120).optional() }).optional(),
  owner: z.strictObject({ email: z.string().trim().min(3).max(320) }).optional(),
}).superRefine(uniqueEntries);

export type OnboardManifest = z.infer<typeof onboardManifestSchema>;

// The receptionist's settings a template keeps: everything but the transfer
// number, which is one business's phone, and the one-off summary rewrite.
const { transfer_number: _transferNumber, regenerate_summary: _regenerateSummary, ...templateReceptionistShape } = apiReceptionistUpdateSchema.shape;

/**
 * A business's setup to start other businesses from, in the onboard file
 * format. It leaves out everything that belongs to one business: its id and
 * slug, its plan, its phone numbers (its own and its transfer number), its
 * owner, its onboarding, the access level its partner gives its team, and
 * which staff take each service. So it's a manifest lobbystack onboard reads
 * as it is.
 */
export const businessTemplateSchema = z.strictObject({
  business: apiBusinessCreateSchema.omit({ slug: true, owner_email: true, access_level: true }).extend({ hours: z.array(hoursWindow).max(28).optional() }),
  receptionist: z.strictObject(templateReceptionistShape).optional(),
  services: z.array(apiServiceCreateSchema.omit({ staff_ids: true })).optional(),
  rules: z.array(apiRuleCreateSchema).optional(),
  knowledge: knowledgeSchema.optional(),
}).superRefine(uniqueEntries);

export type BusinessTemplate = z.infer<typeof businessTemplateSchema>;

/** A document a setup lists, as the manifest names it: its path from the manifest's folder, and what it's called and tagged. */
export type SetupFile = { path: string; title?: string | undefined; tags?: string[] | undefined };

/** Each knowledge.files entry in one shape. */
export function setupFiles(knowledge: { files?: ReadonlyArray<string | SetupFile> | undefined } | undefined): SetupFile[] {
  return (knowledge?.files ?? []).map((entry) => (typeof entry === "string" ? { path: entry } : entry));
}

/** The title a document shows with: its own, or the file's name when it has none. */
export function setupFileTitle(file: SetupFile): string {
  return file.title ?? file.path.split("/").at(-1)!;
}

/** What applying a setup reads and writes. The CLI's adapter calls the v1 API; the admin's calls the API's operations in-process. */
export type BusinessSetupPort = {
  getBusiness(): Promise<ApiBusiness>;
  updateBusiness(changes: ApiBusinessUpdate): Promise<unknown>;
  getReceptionist(): Promise<ApiReceptionist>;
  updateReceptionist(changes: ApiReceptionistUpdate): Promise<unknown>;
  /** Every service, inactive ones included. */
  listServices(): Promise<ApiService[]>;
  createService(service: ApiServiceCreate, idempotencyKey: string | undefined): Promise<unknown>;
  updateService(serviceId: string, changes: ApiServiceUpdate): Promise<unknown>;
  listRules(): Promise<ApiRule[]>;
  createRule(rule: ApiRuleCreate, idempotencyKey: string | undefined): Promise<unknown>;
  updateRule(ruleId: string, changes: ApiRuleUpdate): Promise<unknown>;
  /** Every entry of the type, across pages. */
  listKnowledgeEntries(type: "faq" | "text"): Promise<ApiKnowledgeEntry[]>;
  createKnowledgeEntry(entry: ApiKnowledgeEntryCreate, idempotencyKey: string | undefined): Promise<unknown>;
  updateKnowledgeEntry(entryId: string, changes: { content: string }): Promise<unknown>;
  /** Every source of the type, across pages. */
  listKnowledgeSources(type: "website" | "file"): Promise<ApiKnowledgeSource[]>;
  /** Starts reading a website with a sample of its pages. A site that's already a source returns that source. */
  addWebsite(url: string): Promise<ApiKnowledgeSource>;
  /** Uploads a document the setup lists. Only a port that applies templates has one; the CLI uploads a manifest's files itself. */
  uploadFile?(file: SetupFile): Promise<unknown>;
};

/** One line of what applying did, or would do with a plan. */
export type SetupChange = { step: string; action: string; detail: string };

/** One application of a setup to a business. */
export type SetupRun = {
  port: BusinessSetupPort;
  /** Shows what would change, and changes nothing. */
  plan: boolean;
  log(change: SetupChange): void;
  /**
   * Makes something once. The CLI saves an Idempotency-Key before it sends
   * the request, so a rerun after a lost answer gets the same thing back.
   * Without one, each request goes out once with no key.
   */
  create?<T>(step: string, make: (idempotencyKey: string | undefined) => Promise<T>): Promise<T>;
  /** What the step would make exists already, so a key saved for it isn't needed. */
  found?(step: string): void;
};

export const sameName = (left: unknown, right: string) => typeof left === "string" && nameKey(left) === nameKey(right);

/** Whether every field of left has the same value in right, nested objects and lists included. */
export function sameValue(left: unknown, right: unknown): boolean {
  if (Array.isArray(left) && Array.isArray(right)) return left.length === right.length && left.every((item, index) => sameValue(item, right[index]));
  if (left && right && typeof left === "object" && typeof right === "object") {
    const keys = Object.keys(left as Row);
    return keys.every((key) => sameValue((left as Row)[key], (right as Row)[key]));
  }
  return left === right;
}

function sortedHours(hours: ReadonlyArray<{ day: string; open: string; close: string }>) {
  return [...hours].sort((left, right) => weekdays.indexOf(left.day as never) - weekdays.indexOf(right.day as never) || left.open.localeCompare(right.open)).map(({ day, open, close }) => ({ day, open, close }));
}

/** Whether reading a source stopped before the receptionist could use it. */
export const isUnreadableSource = (source: { status?: unknown } | undefined) => source?.status === "error" || source?.status === "cancelled";

/** Why reading a source stopped. */
export const sourceFailureReason = (source: { status?: unknown; error?: unknown }) => (typeof source.error === "string" && source.error ? source.error : `reading it was ${String(source.status)}`);

/** Whether a website's crawl went past the sample a first read takes, which is how a run knows the whole site was read. */
export const isFullSiteRead = (source: { page_limit?: unknown }) => typeof source.page_limit === "number" && source.page_limit > ONBOARDING_CRAWL_PAGE_LIMIT;

async function createOnce<T>(run: SetupRun, step: string, make: (idempotencyKey: string | undefined) => Promise<T>): Promise<T> {
  return run.create ? await run.create(step, make) : await make(undefined);
}

/** Logs a step's changes, and makes them unless it's a plan. */
async function applyFields(run: SetupRun, step: string, fields: string[], change: () => Promise<void>): Promise<void> {
  if (!fields.length) return run.log({ step, action: "unchanged", detail: "" });
  if (run.plan) return run.log({ step, action: "would update", detail: fields.join(", ") });
  await change();
  run.log({ step, action: "updated", detail: fields.join(", ") });
}

/** The business's own details a setup can set. */
export type SetupBusinessDetails = { name?: string | undefined; timezone?: string | undefined; locale?: ApiBusinessUpdate["locale"] | undefined; business_type?: string | undefined; website_url?: string | undefined; hours?: Array<{ day: string; open: string; close: string }> | undefined };

export async function applyBusinessDetails(run: SetupRun, wanted: SetupBusinessDetails): Promise<void> {
  const current = await run.port.getBusiness();
  const changes: Row = {};
  for (const field of ["name", "timezone", "locale", "business_type"] as const) {
    if (wanted[field] !== undefined && wanted[field] !== current[field]) changes[field] = wanted[field];
  }
  if (wanted.website_url !== undefined && !(current.website_url && websiteKey(wanted.website_url) === websiteKey(current.website_url))) changes.website_url = wanted.website_url;
  if (wanted.hours && !sameValue(sortedHours(wanted.hours), sortedHours(current.hours))) changes.hours = sortedHours(wanted.hours);
  await applyFields(run, "details", Object.keys(changes), async () => { await run.port.updateBusiness(changes as ApiBusinessUpdate); });
}

export async function applyReceptionist(run: SetupRun, wanted: ApiReceptionistUpdate | undefined): Promise<void> {
  if (!wanted) return;
  const current = await run.port.getReceptionist() as Row;
  const changes = Object.fromEntries(Object.entries(wanted).filter(([field, value]) => value !== undefined && !sameValue(value, current[field])));
  await applyFields(run, "receptionist", Object.keys(changes), async () => { await run.port.updateReceptionist(changes as ApiReceptionistUpdate); });
}

export async function applyServices(run: SetupRun, wanted: readonly ApiServiceCreate[] | undefined): Promise<void> {
  if (!wanted?.length) return;
  const current = await run.port.listServices() as unknown as Row[];
  for (const service of wanted) {
    const step = `service:${nameKey(service.name)}`;
    const existing = current.find((row) => sameName(row.name, service.name));
    if (!existing) {
      if (run.plan) { run.log({ step: "services", action: "would add", detail: service.name }); continue; }
      await createOnce(run, step, async (key) => await run.port.createService(service, key));
      run.log({ step: "services", action: "added", detail: service.name });
      continue;
    }
    run.found?.(step);
    const changes = Object.fromEntries(Object.entries(service).filter(([field, value]) => {
      if (field === "staff_ids") return !sameValue([...(value as string[])].sort(), [...((existing.staff_ids as string[] | undefined) ?? [])].sort());
      return !sameValue(value, existing[field]);
    }));
    await applyFields(run, `service ${service.name}`, Object.keys(changes), async () => { await run.port.updateService(String(existing.id), changes as ApiServiceUpdate); });
  }
}

export async function applyRules(run: SetupRun, wanted: readonly ApiRuleCreate[] | undefined): Promise<void> {
  if (!wanted?.length) return;
  const current = await run.port.listRules() as unknown as Row[];
  for (const rule of wanted) {
    const step = `rule:${nameKey(rule.title)}`;
    const existing = current.find((row) => sameName(row.title, rule.title));
    if (!existing) {
      if (run.plan) { run.log({ step: "rules", action: "would add", detail: rule.title }); continue; }
      await createOnce(run, step, async (key) => await run.port.createRule(rule, key));
      run.log({ step: "rules", action: "added", detail: rule.title });
      continue;
    }
    run.found?.(step);
    const changes = Object.fromEntries(Object.entries(rule).filter(([field, value]) => !sameValue(value, existing[field])));
    await applyFields(run, `rule ${rule.title}`, Object.keys(changes), async () => { await run.port.updateRule(String(existing.id), changes as ApiRuleUpdate); });
  }
}

/** FAQs or texts, each as a title (an FAQ's question) and content (its answer). */
export async function applyKnowledgeEntries(run: SetupRun, type: "faq" | "text", wanted: ReadonlyArray<{ title: string; content: string }>): Promise<void> {
  if (!wanted.length) return;
  const current = await run.port.listKnowledgeEntries(type);
  const steps = type === "faq" ? "FAQs" : "texts";
  for (const entry of wanted) {
    const step = `${type}:${nameKey(entry.title)}`;
    const existing = current.find((row) => sameName(row.title, entry.title));
    if (!existing) {
      if (run.plan) { run.log({ step: steps, action: "would add", detail: entry.title }); continue; }
      await createOnce(run, step, async (key) => await run.port.createKnowledgeEntry(type === "faq" ? { type, question: entry.title, answer: entry.content } : { type, title: entry.title, content: entry.content }, key));
      run.log({ step: steps, action: "added", detail: entry.title });
      continue;
    }
    run.found?.(step);
    await applyFields(run, `${type === "faq" ? "FAQ" : "text"} ${entry.title}`, existing.content === entry.content ? [] : [type === "faq" ? "answer" : "content"], async () => { await run.port.updateKnowledgeEntry(String(existing.id), { content: entry.content }); });
  }
}

/**
 * Adds each website that isn't a source yet, and returns the sources of the
 * ones there are. A site whose reading stopped goes to unreadable, which logs
 * what it does and returns the source being read again, if any; without it
 * the site is reported as not read.
 */
export async function applyWebsites(
  run: SetupRun,
  urls: readonly string[] | undefined,
  options: { unreadable?(source: ApiKnowledgeSource, url: string): Promise<ApiKnowledgeSource | undefined> } = {},
): Promise<ApiKnowledgeSource[]> {
  if (!urls?.length) return [];
  const websites: ApiKnowledgeSource[] = [];
  const sources = await run.port.listKnowledgeSources("website");
  for (const url of urls) {
    const existing = sources.find((source) => typeof source.url === "string" && websiteKey(source.url) === websiteKey(url));
    if (existing && isUnreadableSource(existing)) {
      if (!options.unreadable) {
        run.log({ step: "websites", action: "not read", detail: `${url}: ${sourceFailureReason(existing)}` });
        continue;
      }
      const kept = await options.unreadable(existing, url);
      if (kept) websites.push(kept);
      continue;
    }
    if (existing) {
      websites.push(existing);
      run.log({ step: "websites", action: "unchanged", detail: url });
      continue;
    }
    if (run.plan) { run.log({ step: "websites", action: "would add", detail: url }); continue; }
    // Adding a site that's already a source returns that source, so this is safe to repeat.
    const source = await run.port.addWebsite(url);
    websites.push(source);
    run.log({ step: "websites", action: "added", detail: `${url} (reading a sample of its pages)` });
  }
  return websites;
}

/** Uploads each document a template lists that the business has no document of that title for. */
export async function applyTemplateFiles(run: SetupRun, files: readonly SetupFile[]): Promise<void> {
  if (!files.length) return;
  const uploadFile = run.port.uploadFile;
  if (!uploadFile) throw new Error("This setup can't upload the template's documents.");
  const current = await run.port.listKnowledgeSources("file");
  for (const file of files) {
    if (current.some((source) => source.title === setupFileTitle(file))) {
      run.log({ step: "files", action: "unchanged", detail: file.path });
      continue;
    }
    if (run.plan) { run.log({ step: "files", action: "would upload", detail: file.path }); continue; }
    await uploadFile(file);
    run.log({ step: "files", action: "uploaded", detail: file.path });
  }
}

/** What applying a template did, or would do with a plan. */
export type ApplyResult = { changes: SetupChange[] };

/**
 * Makes the business the port reaches match a template: its details,
 * receptionist, services, rules, websites, documents, FAQs and texts, in that
 * order, the same order lobbystack onboard applies a manifest in. A website
 * to read in full is left for the dashboard, since its sample has to finish
 * first.
 */
export async function applyBusinessTemplate(port: BusinessSetupPort, template: BusinessTemplate, options: { plan?: boolean } = {}): Promise<ApplyResult> {
  const changes: SetupChange[] = [];
  const run: SetupRun = { port, plan: options.plan === true, log: (change) => { changes.push(change); } };
  await applyBusinessDetails(run, template.business);
  await applyReceptionist(run, template.receptionist);
  await applyServices(run, template.services);
  await applyRules(run, template.rules);
  const websites = await applyWebsites(run, template.knowledge?.websites);
  await applyTemplateFiles(run, setupFiles(template.knowledge));
  await applyKnowledgeEntries(run, "faq", (template.knowledge?.faqs ?? []).map((faq) => ({ title: faq.question, content: faq.answer })));
  await applyKnowledgeEntries(run, "text", template.knowledge?.texts ?? []);
  if (template.knowledge?.read_full_site) {
    for (const website of websites) run.log({ step: "full site", action: isFullSiteRead(website) ? "unchanged" : "left", detail: isFullSiteRead(website) ? String(website.url) : `${String(website.url)}: read the whole site from the dashboard once the sample is read` });
  }
  return { changes };
}
