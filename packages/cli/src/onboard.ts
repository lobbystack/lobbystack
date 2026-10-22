import { randomUUID } from "node:crypto";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, resolve } from "node:path";

import { isUuid, ONBOARDING_CRAWL_PAGE_LIMIT, weekdays } from "@lobbystack/shared";

import { createClient, type Client } from "./client";
import { stringValue, type Command, type CommandContext, type Values } from "./command";
import { ApiError, CliError, exitCodes, type ExitCode } from "./errors";
import { nameKey, readManifest, readManifestFiles, websiteKey, type Manifest, type ManifestFile } from "./manifest";
import { defaultSleep, listAll, waitUntilDone, type Row } from "./operations";
import { completeUpload, uploadKnowledgeFile } from "./upload";
import { userAgent } from "./version";
import { checkoutWait, claimWait, sourceWait } from "./waits";

// lobbystack onboard acme.yaml: one file describes a business, and each run
// makes the business match it. Every step reads first and changes only what
// differs. What a run makes, and the key of each request whose answer it
// hasn't saved yet, go to a state file next to the manifest before the next
// step, so a rerun after a failure picks up where it stopped and a rerun
// after success changes nothing.

/** What a run made, and the requests it sent but hasn't seen land. */
export type OnboardState = {
  version: 1;
  /** The dashboard the ids belong to, so staging's state is never used against production. */
  url: string;
  /** Seeds the business's Idempotency-Key, which the API makes the business's id from, so every rerun gets the same business. */
  run_id: string;
  business_id?: string;
  /** Uploaded documents, by their path from the manifest's folder. */
  uploads: Record<string, { sha256: string; source_id: string; title?: string; tags?: string[] }>;
  /** Uploads reserved and maybe sent, which a rerun completes before it sends the file again. */
  pending_uploads: Record<string, { sha256: string; upload_id: string }>;
  /** Earlier copies of documents that changed, still to delete. */
  replaced: string[];
  /** Sources read again after they failed, with the plan and the reason, so the same failure isn't retried every run. */
  retried: Record<string, string>;
  /** The Idempotency-Key of each request sent whose answer isn't saved yet. */
  keys: Record<string, string>;
  /** The number someone said yes to, until its claim is made. */
  offer?: { phone_number: string; offer_token: string; expires_at: string };
  claim_id?: string;
  checkout_id?: string;
  /** Who has a claim link, so a run after they accept it can say why the key no longer reaches the business. */
  handed_over_to?: string;
};

/** The state file's contents, and whether it was there before this run. */
async function readState(path: string, url: string): Promise<{ state: OnboardState; fresh: boolean }> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { state: { version: 1, url, run_id: randomUUID(), uploads: {}, pending_uploads: {}, replaced: [], retried: {}, keys: {} }, fresh: true };
    throw error;
  }
  let state: OnboardState;
  try {
    state = JSON.parse(raw) as OnboardState;
  } catch {
    throw new CliError(`${path} isn't valid JSON. Fix it, or move it away to start over, which may make a second business.`);
  }
  if (state?.version !== 1 || typeof state.run_id !== "string") throw new CliError(`${path} isn't a lobbystack onboard state file.`);
  if (state.url !== url) throw new CliError(`${path} belongs to ${state.url}, and you're connected to ${url}. Pass --state with another file for this dashboard.`);
  return { state: { ...state, uploads: state.uploads ?? {}, pending_uploads: state.pending_uploads ?? {}, replaced: state.replaced ?? [], retried: state.retried ?? {}, keys: state.keys ?? {} }, fresh: false };
}

async function writeState(path: string, state: OnboardState): Promise<void> {
  const temporary = `${path}.${process.pid}.${randomUUID().slice(0, 8)}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { flag: "wx" });
    await rename(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

/** One line of what a run did, or would do with --plan. */
export type Change = { step: string; action: string; detail: string };

type Billing = { plan: string; managed: boolean; billing_interval: string | null };

type Run = {
  manifest: Manifest;
  files: ManifestFile[];
  plan: boolean;
  yes: boolean;
  /** Acts on the business once there is one. */
  client: Client;
  /**
   * The key's reach. An operator's platform key ("all") keeps reaching a
   * business after its owner claims it; a partner's ("partner") and the
   * business's own key don't.
   */
  access: "all" | "partner" | "business";
  state: OnboardState;
  statePath: string;
  /** The business's plan, when the key may read it. */
  billing?: Billing | undefined;
  baseUrl: string;
  fetch: typeof fetch;
  sleep(milliseconds: number): Promise<void>;
  confirm?(question: string): Promise<boolean>;
  log(change: Change): void;
  save(): Promise<void>;
  /** Whether the manifest asks for a paid plan the business doesn't have yet. */
  planPending: boolean;
  /** What someone else has to do before a rerun can finish. */
  waiting: string[];
  /** Steps that failed without stopping the run, which the next run tries again. */
  failed: string[];
  /** Differences the run leaves as they are, which someone may want to know about. */
  notes: string[];
  handedOver: boolean;
};

const sameName = (left: unknown, right: string) => typeof left === "string" && nameKey(left) === nameKey(right);

function sameValue(left: unknown, right: unknown): boolean {
  if (Array.isArray(left) && Array.isArray(right)) return left.length === right.length && left.every((item, index) => sameValue(item, right[index]));
  if (left && right && typeof left === "object" && typeof right === "object") {
    const keys = Object.keys(left as Row);
    return keys.every((key) => sameValue((left as Row)[key], (right as Row)[key]));
  }
  return left === right;
}

const sameTags = (left: readonly string[] | undefined, right: readonly string[] | undefined) => sameValue([...(left ?? [])].sort(), [...(right ?? [])].sort());

function sortedHours(hours: ReadonlyArray<{ day: string; open: string; close: string }>) {
  return [...hours].sort((left, right) => weekdays.indexOf(left.day as never) - weekdays.indexOf(right.day as never) || left.open.localeCompare(right.open)).map(({ day, open, close }) => ({ day, open, close }));
}

function fail(run: Run, reason: string): void {
  if (!run.failed.includes(reason)) run.failed.push(reason);
}

async function needsYes(run: Run, question: string, refusal: string): Promise<void> {
  if (run.yes) return;
  if (run.confirm && await run.confirm(question)) return;
  throw new CliError(`${refusal} Run again with --yes, or in a terminal to answer.`);
}

/**
 * Sends a request that makes something, with an Idempotency-Key saved before
 * it goes, so a rerun after a lost answer sends the same key and gets the same
 * thing back instead of a second one. The key is dropped once the answer is
 * in, so a later run that has to make it again, say after someone deleted it,
 * makes a new one. Callers save the state with what they made.
 */
async function sendOnce<T>(run: Run, step: string, send: (key: string) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    let key = run.state.keys[step];
    if (!key) {
      key = `onboard-${randomUUID()}`;
      run.state.keys[step] = key;
      await run.save();
    }
    try {
      const result = await send(key);
      delete run.state.keys[step];
      return result;
    } catch (error) {
      // The manifest changed since a run sent this key, so this is a new request.
      if (attempt === 0 && error instanceof ApiError && error.code === "idempotency_key_reused") {
        delete run.state.keys[step];
        continue;
      }
      throw error;
    }
  }
}

/** Logs a step's changes, and makes them unless --plan. */
async function apply(run: Run, step: string, fields: string[], change: () => Promise<void>): Promise<void> {
  if (!fields.length) return run.log({ step, action: "unchanged", detail: "" });
  if (run.plan) return run.log({ step, action: "would update", detail: fields.join(", ") });
  await change();
  run.log({ step, action: "updated", detail: fields.join(", ") });
}

/**
 * --business, the one place besides the manifest and the state file that
 * names a business. LOBBYSTACK_BUSINESS and the profile's business are left
 * out: they're set for other commands, and would point a new manifest at a
 * business that already exists.
 */
function namedBusiness(values: Values): string | undefined {
  const flag = stringValue(values, "business")?.trim();
  if (flag !== undefined && !isUuid(flag)) throw new CliError("--business must be a business id, a UUID such as 5d0bd9a4-7e1c-4a51-9a50-8e1b2c3d4e5f.");
  return flag?.toLowerCase();
}

/** Refuses, before anything changes, what the manifest asks for that this key can never do. */
function checkKey(run: Run): void {
  const { plan, phone_number: phoneNumber } = run.manifest;
  if (run.access === "partner" && (plan || phoneNumber)) {
    throw new CliError("A partner's platform key can't buy a plan or a number: the business's owner pays for them, and once they claim the business your key can't reach it. Leave plan and phone_number out of the manifest, and the owner picks both in the dashboard after claiming it.");
  }
  if (plan && "managed" in plan && run.access !== "all") throw new CliError("Only an operator's platform key, one with access to every business, can set a managed plan. Use plan.checkout, or leave plan out.");
}

/**
 * Finds or makes the business, and returns its id; with --plan, a business
 * that doesn't exist yet has none. A state file that was already there may
 * hold the key of a business made by a run that lost the answer, which
 * sending that key again gets back.
 */
async function ensureBusiness(run: Run, make: (business?: string) => Client, named: string | undefined, fresh: boolean, businessKey: boolean): Promise<string | undefined> {
  const root = make();
  const wanted = run.manifest.business;
  const sources: ReadonlyArray<readonly [string, string | undefined]> = [["the state file", run.state.business_id], ["business.id in the manifest", wanted.id], ["--business", named]];
  const given = sources.flatMap(([source, id]) => (id ? [[source, id.toLowerCase()] as const] : []));
  const disagreeing = given.find(([, id]) => id !== given[0]![1]);
  if (disagreeing) throw new CliError(`${given[0]![0]} names business ${given[0]![1]}, and ${disagreeing[0]} names ${disagreeing[1]}. Make them the same, or pass --state with another file.`);
  // Accepting a claim link revokes the keys of the account that sent it, and takes the business away from a partner's platform key.
  const handedOver = (error: ApiError) => new CliError(`${run.state.handed_over_to} has a claim link for this business, and this key can't reach it any more (${error.message}), most likely because they accepted it. Its owner manages it in the dashboard now.`, exitCodes.auth);
  let me;
  try {
    me = (await root.call("getMe")).data;
  } catch (error) {
    if (run.state.handed_over_to && businessKey && error instanceof ApiError && error.status === 401) throw handedOver(error);
    throw error;
  }
  run.access = me.platform ? me.platform.access : "business";
  checkKey(run);
  // A per-business key sets up its own business; only a platform key makes one.
  const id = given[0]?.[1] ?? (me.platform ? undefined : me.business?.id);
  if (id) {
    let business;
    try {
      business = (await make(id).call("getBusiness")).data;
    } catch (error) {
      if (run.state.handed_over_to && run.access === "partner" && error instanceof ApiError && error.status === 404) throw handedOver(error);
      throw error;
    }
    // With nothing but --business or the key itself to say which business this is, the wrong profile or a typo would rename another business and fill it with this manifest.
    if (fresh && !wanted.id && !sameName(business.name, wanted.name)) {
      throw new CliError(`Business ${id} is ${business.name}, not ${wanted.name}. To set it up with this manifest, put id: ${id} under business in the manifest.`);
    }
    if (run.state.business_id !== id && !run.plan) {
      run.state.business_id = id;
      await run.save();
    }
    run.log({ step: "business", action: "found", detail: `${business.name} (${id})` });
    return id;
  }
  if (fresh) {
    // With no state file to say which business is this one, a business the partner already onboarded under this name most likely is.
    const onboarded = await listAll(async (cursor) => await root.call("listBusinesses", { query: cursor ? { cursor } : {} }));
    const same = onboarded.find((business) => sameName(business.name, wanted.name));
    if (same) throw new CliError(`You already onboarded ${String(same.name)} (${String(same.id)}), and there's no state file to say it's this one. To set it up, put id: ${String(same.id)} under business in the manifest. To make another business, give it another name.`);
  }
  if (run.plan) {
    run.log({ step: "business", action: "would create", detail: wanted.name });
    return undefined;
  }
  // The run id is on disk before the business exists, so a rerun after a crash sends the same key and gets the same business.
  await run.save();
  const created = (await root.call("createBusiness", {
    body: { name: wanted.name, timezone: wanted.timezone, ...(wanted.locale ? { locale: wanted.locale } : {}), ...(wanted.website_url ? { website_url: wanted.website_url } : {}), ...(wanted.business_type ? { business_type: wanted.business_type } : {}), ...(wanted.slug ? { slug: wanted.slug } : {}) },
    idempotencyKey: `onboard-${run.state.run_id}-business`,
  })).data;
  run.state.business_id = created.id;
  await run.save();
  // Once the owner claims it, a partner can't see the business to find it again.
  run.log({ step: "business", action: "created", detail: `${created.name} (${created.id}). Keep ${basename(run.statePath)} with the manifest, or put id: ${created.id} under business in it.` });
  return created.id;
}

async function syncBusinessDetails(run: Run): Promise<void> {
  const wanted = run.manifest.business;
  const current = (await run.client.call("getBusiness")).data;
  const changes: Row = {};
  for (const field of ["name", "timezone", "locale", "business_type"] as const) {
    if (wanted[field] !== undefined && wanted[field] !== current[field]) changes[field] = wanted[field];
  }
  if (wanted.website_url !== undefined && !(current.website_url && websiteKey(wanted.website_url) === websiteKey(current.website_url))) changes.website_url = wanted.website_url;
  if (wanted.hours && !sameValue(sortedHours(wanted.hours), sortedHours(current.hours))) changes.hours = sortedHours(wanted.hours);
  await apply(run, "details", Object.keys(changes), async () => { await run.client.call("updateBusiness", { body: changes }); });
}

const paidPlans = new Set(["starter", "pro", "enterprise", "self_host"]);
const hasPaidPlan = (billing: Billing) => billing.managed || paidPlans.has(billing.plan);

/** Whether the manifest's checkout plan is one a checkout can still get: any plan for a free business, and Pro for a Starter one. */
function checkoutNeeded(manifest: Manifest, billing: Billing): boolean {
  const wanted = manifest.plan && "checkout" in manifest.plan ? manifest.plan.checkout : undefined;
  if (!wanted || billing.managed) return false;
  return billing.plan === "free_cloud" || (billing.plan === "starter" && wanted.plan === "pro");
}

/** A managed plan takes effect at once, so it goes first: the rest of the run then has what a paid plan unlocks. */
async function syncManagedPlan(run: Run, billing: Billing): Promise<Billing> {
  if (!run.manifest.plan || !("managed" in run.manifest.plan)) return billing;
  if (billing.managed) {
    run.log({ step: "plan", action: "unchanged", detail: "managed" });
    return billing;
  }
  if (run.plan) {
    run.log({ step: "plan", action: "would set", detail: "the managed enterprise plan" });
    return { ...billing, plan: "enterprise", managed: true };
  }
  const updated = (await run.client.call("setManagedPlan", { body: { plan: "enterprise" } })).data;
  run.log({ step: "plan", action: "set", detail: "the managed enterprise plan" });
  return updated;
}

async function syncReceptionist(run: Run): Promise<void> {
  const wanted = run.manifest.receptionist;
  if (!wanted) return;
  const current = (await run.client.call("getReceptionist")).data as Row;
  const changes = Object.fromEntries(Object.entries(wanted).filter(([field, value]) => value !== undefined && !sameValue(value, current[field])));
  await apply(run, "receptionist", Object.keys(changes), async () => { await run.client.call("updateReceptionist", { body: changes }); });
}

async function syncServices(run: Run): Promise<void> {
  const wanted = run.manifest.services;
  if (!wanted?.length) return;
  const current = (await run.client.call("listServices", { query: { include_inactive: true } })).data as Row[];
  for (const service of wanted) {
    const step = `service:${nameKey(service.name)}`;
    const existing = current.find((row) => sameName(row.name, service.name));
    if (!existing) {
      if (run.plan) { run.log({ step: "services", action: "would add", detail: service.name }); continue; }
      await sendOnce(run, step, async (key) => await run.client.call("createService", { body: service, idempotencyKey: key }));
      await run.save();
      run.log({ step: "services", action: "added", detail: service.name });
      continue;
    }
    delete run.state.keys[step];
    const changes = Object.fromEntries(Object.entries(service).filter(([field, value]) => {
      if (field === "staff_ids") return !sameValue([...(value as string[])].sort(), [...((existing.staff_ids as string[] | undefined) ?? [])].sort());
      return !sameValue(value, existing[field]);
    }));
    await apply(run, `service ${service.name}`, Object.keys(changes), async () => { await run.client.call("updateService", { params: { service_id: String(existing.id) }, body: changes }); });
  }
}

async function syncRules(run: Run): Promise<void> {
  const wanted = run.manifest.rules;
  if (!wanted?.length) return;
  const current = (await run.client.call("listRules")).data as Row[];
  for (const rule of wanted) {
    const step = `rule:${nameKey(rule.title)}`;
    const existing = current.find((row) => sameName(row.title, rule.title));
    if (!existing) {
      if (run.plan) { run.log({ step: "rules", action: "would add", detail: rule.title }); continue; }
      await sendOnce(run, step, async (key) => await run.client.call("createRule", { body: rule, idempotencyKey: key }));
      await run.save();
      run.log({ step: "rules", action: "added", detail: rule.title });
      continue;
    }
    delete run.state.keys[step];
    const changes = Object.fromEntries(Object.entries(rule).filter(([field, value]) => !sameValue(value, existing[field])));
    await apply(run, `rule ${rule.title}`, Object.keys(changes), async () => { await run.client.call("updateRule", { params: { rule_id: String(existing.id) }, body: changes }); });
  }
}

async function syncEntries(run: Run, type: "faq" | "text", wanted: ReadonlyArray<{ title: string; content: string }>): Promise<void> {
  if (!wanted.length) return;
  const current = await listAll(async (cursor) => await run.client.call("listKnowledgeEntries", { query: { type, ...(cursor ? { cursor } : {}) } }));
  const steps = type === "faq" ? "FAQs" : "texts";
  for (const entry of wanted) {
    const step = `${type}:${nameKey(entry.title)}`;
    const existing = current.find((row) => sameName(row.title, entry.title));
    if (!existing) {
      if (run.plan) { run.log({ step: steps, action: "would add", detail: entry.title }); continue; }
      await sendOnce(run, step, async (key) => await run.client.call("createKnowledgeEntry", { body: type === "faq" ? { type, question: entry.title, answer: entry.content } : { type, title: entry.title, content: entry.content }, idempotencyKey: key }));
      await run.save();
      run.log({ step: steps, action: "added", detail: entry.title });
      continue;
    }
    delete run.state.keys[step];
    await apply(run, `${type === "faq" ? "FAQ" : "text"} ${entry.title}`, existing.content === entry.content ? [] : [type === "faq" ? "answer" : "content"], async () => { await run.client.call("updateKnowledgeEntry", { params: { entry_id: String(existing.id) }, body: { content: entry.content } }); });
  }
}

/** Deletes the earlier copies of changed documents; one that fails stays in the state file for the next run. */
async function deleteReplaced(run: Run): Promise<void> {
  if (run.plan) return;
  for (const id of [...run.state.replaced]) {
    try {
      await run.client.call("deleteKnowledgeSource", { params: { source_id: id } });
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 404)) {
        fail(run, `Couldn't delete the earlier copy of a changed document (${id}): ${(error as Error).message} The next run tries again.`);
        continue;
      }
    }
    run.state.replaced = run.state.replaced.filter((replaced) => replaced !== id);
    await run.save();
  }
}

const unreadable = (source: Row | undefined) => source?.status === "error" || source?.status === "cancelled";
const failureReason = (source: Row) => (typeof source.error === "string" && source.error ? source.error : `reading it was ${String(source.status)}`);

/**
 * Reads a source that failed again, once for each failure: the same reason
 * on the same plan is reported instead, so a document that can't be read
 * isn't read, and billed, on every run. Returns the source being read
 * again, or undefined when it's left as it is.
 */
async function retryOnce(run: Run, source: Row, label: string): Promise<Row | undefined> {
  const id = String(source.id);
  const reason = failureReason(source);
  const attempt = `${run.billing?.plan ?? ""}: ${reason}`;
  if (source.status === "cancelled" || run.state.retried[id] === attempt) {
    run.notes.push(`${label} couldn't be read: ${reason.replace(/\.$/, "")}. lobbystack knowledge retry ${id} reads it again.`);
    return undefined;
  }
  if (run.plan) return { ...source, status: "would retry" };
  const retried = (await run.client.call("retryKnowledgeSource", { params: { source_id: id } })).data as Row;
  run.state.retried[id] = attempt;
  await run.save();
  return retried;
}

/**
 * Completes the uploads an earlier run reserved for a file this run won't
 * send: one whose answer was lost before the file moved, or changed back. A
 * copy that did arrive goes, like any replaced one.
 */
async function settlePendingUploads(run: Run): Promise<void> {
  if (run.plan) return;
  for (const [path, pending] of Object.entries(run.state.pending_uploads)) {
    const file = run.files.find((candidate) => candidate.path === path);
    const known = run.state.uploads[path];
    // The loop in syncFiles completes the upload of a file it's about to send.
    if (file && !(known && known.sha256 === file.sha256 && known.title === file.title && sameTags(known.tags, file.tags))) continue;
    try {
      const source = await completeUpload(run.client, pending.upload_id, {});
      if (String(source.id) !== known?.source_id) run.state.replaced.push(String(source.id));
    } catch (error) {
      if (!(error instanceof ApiError && (error.status === 404 || error.status === 409))) throw error;
    }
    delete run.state.pending_uploads[path];
    await run.save();
  }
}

async function syncFiles(run: Run): Promise<void> {
  if (!run.files.length && !run.state.replaced.length && !Object.keys(run.state.pending_uploads).length) return;
  await settlePendingUploads(run);
  await deleteReplaced(run);
  // What became of each document: one deleted in the dashboard is uploaded again, and one that couldn't be read is read again.
  const sources = new Map(Object.keys(run.state.uploads).length ? (await listAll(async (cursor) => await run.client.call("listKnowledgeSources", { query: { type: "file", ...(cursor ? { cursor } : {}) } }))).map((source) => [String(source.id), source] as const) : []);
  for (const file of run.files) {
    let known = run.state.uploads[file.path];
    if (known && !sources.has(known.source_id)) {
      delete run.state.uploads[file.path];
      known = undefined;
    }
    if (!known) {
      // A document moved within the folder keeps its source.
      const moved = Object.entries(run.state.uploads).find(([path, upload]) => upload.sha256 === file.sha256 && sources.has(upload.source_id) && !run.files.some((other) => other.path === path));
      if (moved) {
        if (!run.plan) {
          delete run.state.uploads[moved[0]];
          run.state.uploads[file.path] = moved[1];
        }
        known = moved[1];
        run.log({ step: "files", action: run.plan ? "would move" : "moved", detail: `${moved[0]} to ${file.path}` });
      }
    }
    if (known && known.sha256 === file.sha256 && known.title === file.title && sameTags(known.tags, file.tags)) {
      const source = sources.get(known.source_id);
      if (!unreadable(source)) {
        run.log({ step: "files", action: "unchanged", detail: file.path });
        continue;
      }
      const reason = failureReason(source!);
      // The free plan's room for text runs out while a document is read, so it's read again once the plan is paid.
      if (run.planPending) { run.log({ step: "files", action: "waiting", detail: `${file.path}: ${reason}` }); continue; }
      const retried = await retryOnce(run, source!, file.path);
      run.log({ step: "files", action: retried ? (run.plan ? "would retry" : "retrying") : "not read", detail: `${file.path}: ${reason}` });
      continue;
    }
    if (run.plan) { run.log({ step: "files", action: known ? "would replace" : "would upload", detail: file.path }); continue; }
    let source: Row | undefined;
    const pending = run.state.pending_uploads[file.path];
    if (pending) {
      // An earlier run may have sent it already: completing it again returns its source. One for an older version of the file goes, like any replaced copy.
      try {
        const earlier = await completeUpload(run.client, pending.upload_id, file);
        if (pending.sha256 === file.sha256) source = earlier;
        else run.state.replaced.push(String(earlier.id));
      } catch (error) {
        if (run.planPending && error instanceof ApiError && error.code === "plan_limit_reached") {
          run.log({ step: "files", action: "waiting", detail: `${file.path}: the current plan has no room for it` });
          continue;
        }
        // An upload that never arrived, or expired, is sent again.
        if (!(error instanceof ApiError && (error.status === 404 || (error.status === 409 && error.code !== "plan_limit_reached")))) throw error;
      }
      delete run.state.pending_uploads[file.path];
    }
    try {
      source ??= await uploadKnowledgeFile(run.client, {
        baseUrl: run.baseUrl,
        fetch: run.fetch,
        file,
        title: file.title,
        tags: file.tags,
        async onReserved(uploadId) {
          run.state.pending_uploads[file.path] = { sha256: file.sha256, upload_id: uploadId };
          await run.save();
        },
      });
    } catch (error) {
      // A plan that's already full refuses the file outright.
      if (!(run.planPending && error instanceof ApiError && error.code === "plan_limit_reached")) throw error;
      run.log({ step: "files", action: "waiting", detail: `${file.path}: the current plan has no room for it` });
      continue;
    }
    delete run.state.pending_uploads[file.path];
    run.state.uploads[file.path] = { sha256: file.sha256, source_id: String(source.id), ...(file.title ? { title: file.title } : {}), ...(file.tags?.length ? { tags: file.tags } : {}) };
    if (known) run.state.replaced.push(known.source_id);
    await run.save();
    run.log({ step: "files", action: known ? "replaced" : "uploaded", detail: file.path });
  }
  await deleteReplaced(run);
}

async function syncKnowledge(run: Run): Promise<void> {
  const knowledge = run.manifest.knowledge;
  if (!knowledge && !run.state.replaced.length) return;
  const websites: Row[] = [];
  if (knowledge?.websites?.length) {
    const sources = await listAll(async (cursor) => await run.client.call("listKnowledgeSources", { query: { type: "website", ...(cursor ? { cursor } : {}) } }));
    for (const url of knowledge.websites) {
      const existing = sources.find((source) => typeof source.url === "string" && websiteKey(source.url) === websiteKey(url));
      if (existing && unreadable(existing)) {
        const reason = failureReason(existing);
        // A site's first read can fail on the free plan's room too, so it's read again once the plan is paid.
        if (run.planPending) { run.log({ step: "websites", action: "waiting", detail: `${url}: ${reason}` }); continue; }
        const retried = await retryOnce(run, existing, url);
        run.log({ step: "websites", action: retried ? (run.plan ? "would retry" : "retrying") : "not read", detail: `${url}: ${reason}` });
        if (retried) websites.push(retried);
        continue;
      }
      if (existing) {
        websites.push(existing);
        run.log({ step: "websites", action: "unchanged", detail: url });
        continue;
      }
      if (run.plan) { run.log({ step: "websites", action: "would add", detail: url }); continue; }
      // Adding a site that's already a source returns that source, so this is safe to repeat.
      const source = (await run.client.call("createKnowledgeSource", { body: { type: "website", url } })).data as Row;
      websites.push(source);
      run.log({ step: "websites", action: "added", detail: `${url} (reading a sample of its pages)` });
    }
  }
  await syncFiles(run);
  await syncEntries(run, "faq", (knowledge?.faqs ?? []).map((faq) => ({ title: faq.question, content: faq.answer })));
  await syncEntries(run, "text", knowledge?.texts ?? []);
  if (!knowledge?.read_full_site) return;
  for (const website of websites) {
    // The full read raises the site's page limit past the sample's, which is how a rerun, or a business read in full from the dashboard, knows it's done.
    if (typeof website.page_limit === "number" && website.page_limit > ONBOARDING_CRAWL_PAGE_LIMIT) {
      run.log({ step: "full site", action: "unchanged", detail: String(website.url) });
      continue;
    }
    // Every page read is billed, and a free plan has little room for them, so the full read waits for the paid plan.
    if (run.planPending) { run.log({ step: "full site", action: "waiting", detail: `${String(website.url)}: for the paid plan` }); continue; }
    // A partner's business stays on the free plan until its owner picks one, after which only the owner can read the rest.
    if (run.access === "partner") { run.log({ step: "full site", action: "skipped", detail: `${String(website.url)}: the owner reads the whole site from the dashboard once they pick a plan` }); continue; }
    if (run.plan) { run.log({ step: "full site", action: "would read", detail: String(website.url) }); continue; }
    // The whole site is read after the sample, so wait for the sample first.
    run.log({ step: "full site", action: "waiting", detail: `for the first read of ${String(website.url)}` });
    try {
      const sample = await waitUntilDone(run.client, sourceWait, website, run.sleep);
      const failure = sourceWait.failed(sample);
      if (failure) {
        const again = run.state.retried[String(website.id)] ? `lobbystack knowledge retry ${String(website.id)} reads it again` : "the next run reads it again";
        fail(run, `${String(website.url)}: ${failure} Once that's fixed, ${again}.`);
        continue;
      }
    } catch (error) {
      if (!(error instanceof CliError) || error instanceof ApiError) throw error;
      fail(run, `${String(website.url)}: ${error.message}`);
      continue;
    }
    await run.client.call("expandKnowledgeSource", { params: { source_id: String(website.id) } });
    run.log({ step: "full site", action: "reading", detail: String(website.url) });
  }
}

async function ownsBusiness(run: Run, email: string): Promise<boolean> {
  const team = (await run.client.call("getTeam")).data;
  return team.members.some((member) => member.role === "business_owner" && sameName(member.email, email));
}

/** Sends the owner a claim link, unless they own the business or have one already. */
async function handOver(run: Run): Promise<void> {
  const owner = run.manifest.owner;
  if (!owner || run.handedOver) return;
  run.handedOver = true;
  const team = (await run.client.call("getTeam")).data;
  const step = `owner:${nameKey(owner.email)}`;
  if (team.members.some((member) => member.role === "business_owner" && sameName(member.email, owner.email))) {
    delete run.state.keys[step];
    return run.log({ step: "owner", action: "unchanged", detail: `${owner.email} owns it` });
  }
  if (team.invitations.some((invitation) => invitation.transfers_ownership && invitation.status === "pending" && sameName(invitation.email, owner.email))) {
    delete run.state.keys[step];
    if (!run.plan && run.state.handed_over_to !== owner.email) {
      run.state.handed_over_to = owner.email;
      await run.save();
    }
    return run.log({ step: "owner", action: "unchanged", detail: `${owner.email} has a claim link` });
  }
  if (run.plan) return run.log({ step: "owner", action: "would send", detail: `a claim link to ${owner.email}` });
  try {
    // The API keeps no Idempotency-Key record of a claim link, whose answer holds the link. A run
    // that lost the answer finds the pending link on GET /team above instead of sending another.
    await run.client.call("createClaimLink", { body: { email: owner.email } });
  } catch (error) {
    // Only an owner can hand the business over, and someone else may have claimed it.
    if (!(error instanceof ApiError && error.status === 409)) throw error;
    const owners = team.members.filter((member) => member.role === "business_owner").map((member) => member.email);
    throw new CliError(`Couldn't send ${owner.email} a claim link: ${error.message} The business's owners are ${owners.join(", ")}. If one of them should own it, change owner in the manifest.`);
  }
  run.state.handed_over_to = owner.email;
  await run.save();
  // The link went to their email; it isn't printed, so it stays out of CI logs.
  run.log({ step: "owner", action: "sent", detail: `a claim link to ${owner.email}` });
}

/** Starts a checkout, keeping its id for the next run. */
async function startCheckout(run: Run, plan: "starter" | "pro", interval: "monthly" | "annual"): Promise<Row> {
  let checkout: Row;
  try {
    checkout = (await sendOnce(run, "checkout", async (key) => await run.client.call("createCheckout", { body: { plan, interval }, idempotencyKey: key }))).data as Row;
  } catch (error) {
    // An operator's checkout is made out to an owner other than the key's own account.
    if (run.access === "all" && !run.manifest.owner && error instanceof ApiError && error.status === 409 && /claimed/i.test(error.message)) throw new CliError(`${error.message} Add owner to the manifest, or use plan: { managed: true }.`);
    throw error;
  }
  run.state.checkout_id = String(checkout.id);
  await run.save();
  return checkout;
}

async function syncCheckout(run: Run, billing: Billing): Promise<void> {
  const wanted = run.manifest.plan;
  if (!wanted || !("checkout" in wanted)) return;
  const { plan, interval } = wanted.checkout;
  const label = `${plan} ${interval}`;
  if (billing.managed || billing.plan === "enterprise" || billing.plan === "self_host") return run.log({ step: "plan", action: "unchanged", detail: billing.managed ? "managed" : billing.plan });
  if (billing.plan === plan && billing.billing_interval === interval) return run.log({ step: "plan", action: "unchanged", detail: label });
  const current = `${billing.plan}${billing.billing_interval ? ` ${billing.billing_interval}` : ""}`;
  if (!checkoutNeeded(run.manifest, billing)) {
    // Only the billing portal changes a paid plan, and no rerun can, so this doesn't hold up the rest.
    run.log({ step: "plan", action: "differs", detail: `${current} is in force` });
    run.notes.push(`The business pays for ${current}, and the manifest asks for ${label}. Change it in Polar's billing portal, or change plan in the manifest.`);
    return;
  }
  if (run.plan) return run.log({ step: "plan", action: "would start", detail: `a ${label} checkout` });
  // A platform key's checkout is made out to the business's owner, so it waits until they've claimed the business.
  const owner = run.manifest.owner?.email;
  if (run.access === "all" && owner && !(await ownsBusiness(run, owner))) {
    run.log({ step: "plan", action: "waiting", detail: `for ${owner} to claim the business` });
    run.waiting.push(`${owner} pays for the ${label} plan once they own the business. When they've accepted the claim link, run this again to start the checkout.`);
    return;
  }
  let checkout = run.state.checkout_id ? (await run.client.call("getCheckout", { params: { checkout_id: run.state.checkout_id } })).data as Row : undefined;
  let stale = false;
  if (!checkout || checkout.status === "error" || checkout.plan !== plan || checkout.interval !== interval) {
    await needsYes(run, `Start a ${label} checkout for ${run.manifest.business.name}?`, "A checkout asks someone to pay, so it needs a yes.");
    checkout = await startCheckout(run, plan, interval);
  } else if (Date.now() - Date.parse(String(checkout.created_at)) >= 60 * 60_000) {
    // A page this old may have run out, or may not have, in which case someone could pay both, so only a person replaces it, never --yes.
    const created = new Date(String(checkout.created_at)).toLocaleString();
    if (!run.yes && run.confirm && await run.confirm(`The ${label} checkout page from ${created} may have run out. Start a new one?`)) checkout = await startCheckout(run, plan, interval);
    else stale = true;
  }
  checkout = await waitUntilDone(run.client, checkoutWait, checkout, run.sleep);
  const failure = checkoutWait.failed(checkout);
  if (failure) throw new CliError(failure, exitCodes.failed);
  run.log({ step: "plan", action: "waiting", detail: `for payment at ${String(checkout.checkout_url)}` });
  run.waiting.push(`The ${label} plan isn't paid yet. Send ${String(checkout.checkout_url)} to whoever pays, then run this again.${stale ? " If that page has run out, run this in a terminal, without --yes, to start a new one." : ""}`);
}

async function syncPhoneNumber(run: Run, billing: Billing | undefined): Promise<void> {
  const wanted = run.manifest.phone_number;
  if (!wanted) return;
  const numbers = (await run.client.call("listPhoneNumbers")).data;
  const active = numbers.find((number) => number.status === "active");
  if (active) {
    delete run.state.claim_id;
    delete run.state.offer;
    return run.log({ step: "phone number", action: "unchanged", detail: active.phone_number });
  }
  // A number needs a paid plan: the one the manifest asks for, or one someone pays for in the dashboard.
  if (billing && !hasPaidPlan(billing)) {
    run.log({ step: "phone number", action: "waiting", detail: "for a paid plan" });
    if (!run.manifest.plan) run.waiting.push("A number needs a paid plan. Pay for one in the dashboard, or add plan to the manifest, then run this again.");
    return;
  }
  if (run.plan) return run.log({ step: "phone number", action: "would claim", detail: Object.entries(wanted).map(([field, value]) => `${field} ${String(value)}`).join(", ") || "a local number" });
  let claim: Row | undefined = run.state.claim_id ? (await run.client.call("getPhoneNumberClaim", { params: { claim_id: run.state.claim_id } })).data as Row : undefined;
  if (claim?.status === "failed") claim = undefined;
  if (!claim) {
    // An offer someone said yes to is claimed again as it was, while it lasts, so a lost answer doesn't lead to a second number.
    let offer = run.state.offer && Date.parse(run.state.offer.expires_at) > Date.now() + 30_000 ? run.state.offer : undefined;
    if (!offer) {
      delete run.state.offer;
      delete run.state.keys.phone;
      let offers;
      try {
        offers = (await run.client.call("searchPhoneNumbers", { body: { ...wanted, limit: 5 } })).data;
      } catch (error) {
        // A key that can't read the plan learns here that the business has no paid one, which only someone paying changes.
        if (!(!billing && error instanceof ApiError && error.status === 409)) throw error;
        run.log({ step: "phone number", action: "waiting", detail: "for a paid plan" });
        run.waiting.push(`${error.message} Pay for a plan in the dashboard, or add plan to the manifest, then run this again.`);
        return;
      }
      const first = offers[0];
      if (!first) throw new CliError(`No numbers match ${JSON.stringify(wanted)}. Change phone_number in the manifest.`);
      await needsYes(run, `Claim ${first.phone_number}${first.locality ? ` (${first.locality})` : ""} for ${run.manifest.business.name}? A number costs money.`, "Claiming a number costs money, so it needs a yes.");
      offer = { phone_number: first.phone_number, offer_token: first.offer_token, expires_at: first.expires_at };
      run.state.offer = offer;
      await run.save();
    }
    try {
      claim = (await sendOnce(run, "phone", async (key) => await run.client.call("createPhoneNumberClaim", { body: { offer_token: offer.offer_token }, idempotencyKey: key }))).data as Row;
    } catch (error) {
      if (error instanceof ApiError && error.status === 400 && error.details.some((detail) => detail.path === "offer_token")) {
        delete run.state.offer;
        delete run.state.keys.phone;
        await run.save();
        throw new CliError(`The offer for ${offer.phone_number} ran out before it was claimed. Run this again to search again.`, exitCodes.failed);
      }
      throw error;
    }
    run.state.claim_id = String(claim.id);
    delete run.state.offer;
    await run.save();
  }
  claim = await waitUntilDone(run.client, claimWait, claim, run.sleep);
  if (claim.status === "failed") {
    delete run.state.claim_id;
    await run.save();
    throw new CliError(`The claim for ${String(claim.phone_number)} failed: ${typeof claim.error === "string" && claim.error ? claim.error : "no reason was given."}`, exitCodes.failed);
  }
  run.log({ step: "phone number", action: "claimed", detail: String(claim.phone_number) });
}

async function completeOnboarding(run: Run): Promise<void> {
  const wanted = run.manifest.onboarding;
  if (wanted?.complete === false) return;
  if (run.waiting.length) return run.log({ step: "onboarding", action: "waiting", detail: "for the steps above" });
  // A partner's key can't pick a plan or a number, so the owner finds those steps open in the dashboard.
  if (run.access === "partner" && wanted?.complete !== true) return run.log({ step: "onboarding", action: "left open", detail: "for the owner to pick a plan and a number after claiming it" });
  const current = (await run.client.call("getOnboarding")).data;
  if (current.complete) return run.log({ step: "onboarding", action: "unchanged", detail: "complete" });
  const missing = current.missing.filter((item) => !(item === "phone_number" && wanted?.skip_number));
  if (missing.length) {
    if (wanted?.complete) throw new CliError(`Onboarding can't finish while it's missing ${missing.join(", ")}. Add phone_number to the manifest, or set onboarding.skip_number to true.`);
    return run.log({ step: "onboarding", action: "left open", detail: `missing ${missing.join(", ")}` });
  }
  if (run.plan) return run.log({ step: "onboarding", action: "would finish", detail: "" });
  await run.client.call("completeOnboarding", { body: { ...(wanted?.skip_number !== undefined ? { skip_number: wanted.skip_number } : {}), ...(wanted?.source ? { source: wanted.source } : {}) } });
  run.log({ step: "onboarding", action: "finished", detail: "" });
}

export const onboard: Command = {
  summary: "Set up a business from a manifest file, and on reruns change only what differs.",
  usage: "lobbystack onboard <manifest.yaml> [--plan] [--yes] [--state <path>] [--business <id>]",
  arguments: [{ name: "manifest.yaml", description: "The business, its knowledge, receptionist, services, plan, number and owner. https://docs.lobbystack.com/api/cli lists every field." }],
  options: {
    plan: { type: "boolean", description: "Show what it would change, and change nothing." },
    yes: { type: "boolean", description: "Claim a number and start a checkout without asking first." },
    state: { type: "string", placeholder: "<path>", description: "Where to keep the ids it makes. Defaults to the manifest's name with .state.json, next to it." },
  },
  notes: [
    "The business is the one in the state file, business.id in the manifest or --business, which have to agree.",
    "LOBBYSTACK_BUSINESS and a profile's business are never used. With none of them, a platform key makes the",
    "business and a per-business key sets up its own.",
    "",
    "Exit codes: 0 the business matches the manifest. 4 not finished: the rest waits on a payment or the owner's",
    "claim, so run it again once that's done. 1, 2 and 3 as for every command.",
  ].join("\n"),
  operations: ["getMe", "listBusinesses", "createBusiness", "getBusiness", "updateBusiness", "getReceptionist", "updateReceptionist", "listServices", "createService", "updateService", "listRules", "createRule", "updateRule", "listKnowledgeSources", "createKnowledgeSource", "expandKnowledgeSource", "retryKnowledgeSource", "deleteKnowledgeSource", "getKnowledgeSource", "createKnowledgeUpload", "completeKnowledgeUpload", "listKnowledgeEntries", "createKnowledgeEntry", "updateKnowledgeEntry", "getBilling", "setManagedPlan", "createCheckout", "getCheckout", "listPhoneNumbers", "searchPhoneNumbers", "createPhoneNumberClaim", "getPhoneNumberClaim", "getOnboarding", "completeOnboarding", "getTeam", "createClaimLink"],
  async run(context: CommandContext): Promise<ExitCode> {
    const { io, output, values, positionals } = context;
    const [manifestPath, ...extra] = positionals;
    if (!manifestPath || extra.length) throw new CliError(`Usage: ${onboard.usage}`);
    const manifest = await readManifest(manifestPath);
    const baseDir = resolve(dirname(manifestPath));
    // Every document is read and checked before anything changes.
    const files = await readManifestFiles(manifest, baseDir);
    const named = namedBusiness(values);
    const { connection } = await context.connect();
    const statePath = stringValue(values, "state") ?? join(dirname(manifestPath), `${basename(manifestPath, extname(manifestPath))}.state.json`);
    const { state, fresh } = await readState(statePath, connection.url);
    const changes: Change[] = [];
    const fetchImpl = io.fetch ?? fetch;
    const make = (business?: string) => createClient({ url: connection.url, key: connection.key, business, userAgent, fetch: fetchImpl });
    const run: Run = {
      manifest,
      files,
      plan: values.plan === true,
      yes: values.yes === true,
      client: make(),
      access: "business",
      state,
      statePath,
      baseUrl: connection.url,
      fetch: fetchImpl,
      sleep: io.sleep ?? defaultSleep,
      ...(io.confirm ? { confirm: io.confirm } : {}),
      log(change) {
        changes.push(change);
        if (!output.json) io.out(`${change.step.padEnd(14)} ${change.action.padEnd(12)} ${change.detail}`.trimEnd());
      },
      save: async () => { if (!run.plan) await writeState(statePath, state); },
      planPending: false,
      waiting: [],
      failed: [],
      notes: [],
      handedOver: false,
    };
    try {
      const businessId = await ensureBusiness(run, make, named, fresh, connection.key.startsWith("lsk_"));
      if (!businessId) {
        // With --plan and no business yet there's nothing to compare against, so every section would be set up.
        for (const section of ["receptionist", "services", "rules", "knowledge", "plan", "phone_number", "owner"] as const) {
          if (manifest[section] !== undefined) run.log({ step: section.replace("_", " "), action: "would set up", detail: "" });
        }
      } else {
        run.client = make(businessId);
        await syncBusinessDetails(run);
        // The plan decides what can happen now. Only a manifest with a plan needs a key that may read it.
        run.billing = manifest.plan
          ? (await run.client.call("getBilling")).data as Billing
          : await run.client.call("getBilling").then((reply) => reply.data as Billing, (error: unknown) => { if (error instanceof ApiError && error.status === 403) return undefined; throw error; });
        if (run.billing && manifest.plan) {
          run.billing = await syncManagedPlan(run, run.billing);
          run.planPending = checkoutNeeded(manifest, run.billing);
        }
        await syncReceptionist(run);
        await syncServices(run);
        await syncRules(run);
        await syncKnowledge(run);
        // An operator's checkout goes to the business's owner, so the claim link goes out first; the operator's key keeps reaching the business.
        if (run.access === "all" && run.planPending) await handOver(run);
        if (run.billing && manifest.plan) await syncCheckout(run, run.billing);
        await syncPhoneNumber(run, run.billing);
        await completeOnboarding(run);
        // Once the owner accepts, the business's own key, and a partner's, can't reach it, so nothing could finish or retry what's left: the hand-over waits for it.
        if (run.access !== "all" && manifest.owner && (run.waiting.length || run.failed.length)) run.log({ step: "owner", action: "waiting", detail: "for the steps above" });
        else await handOver(run);
        await run.save();
      }
    } catch (error) {
      if (error instanceof CliError && error.exitCode === exitCodes.failed && state.business_id) error.message = `${error.message}\nWhat's done so far is in ${statePath}; run the same command again to pick up from there.`;
      throw error;
    }
    const code = run.plan ? exitCodes.ok : run.failed.length ? exitCodes.failed : run.waiting.length ? exitCodes.waiting : exitCodes.ok;
    if (output.json) {
      io.out(JSON.stringify({ business_id: state.business_id ?? null, state_file: statePath, plan: run.plan, changes, waiting: run.waiting, failed: run.failed, notes: run.notes }, null, 2));
      return code;
    }
    const list = (title: string, items: string[]) => (items.length ? [title, ...items.map((item) => `- ${item}`)] : []);
    const summary = run.plan
      ? ["Nothing was changed: that's what a run would do."]
      : [
        ...list("Some steps failed:", run.failed),
        ...list("Not finished yet:", run.waiting),
        ...(run.failed.length || run.waiting.length ? list("Also:", run.notes) : list("The business matches the manifest, except:", run.notes)),
        ...(run.failed.length || run.waiting.length || run.notes.length ? [] : ["The business matches the manifest."]),
      ];
    io.out(`\n${summary.join("\n")}`);
    return code;
  },
};
