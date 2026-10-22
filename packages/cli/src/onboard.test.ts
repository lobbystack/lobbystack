import { mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { exitCodes } from "./errors";
import { main } from "./main";
import { readManifest } from "./manifest";
import { KEY, tempDir } from "./testing";

type Row = Record<string, unknown>;

const BUSINESS = "5d0bd9a4-7e1c-4a51-9a50-8e1b2c3d4e5f";
const ORIGIN = "https://app.example.com";
/** The account a platform key acts as, which owns the businesses it makes until it hands them over. */
const PARTNER = "partner@example.com";
const STORAGE_FULL = "Knowledge storage limit reached. 1 MB of text is included on this plan.";

// The plan's sample manifest, with its FAQ in block style: in a { ... } flow
// mapping, "Yes, 24/7 ..." would split at the comma into a second key.
const manifestYaml = `business:
  name: Acme Plumbing
  timezone: America/Toronto
  locale: en
  website_url: https://acmeplumbing.ca
  hours:
    - { day: mon, open: "08:00", close: "17:00" }
knowledge:
  websites: [https://acmeplumbing.ca]
  read_full_site: true
  files: [./docs/price-list.pdf, ./docs/service-area.md]
  faqs:
    - question: Do you do emergency calls?
      answer: Yes, 24/7 for existing customers.
receptionist:
  greeting: Thanks for calling Acme Plumbing, how can I help?
  transfer_mode: on_urgent
  transfer_number: "+14165550100"
  booking_mode: request
services:
  - { name: Drain cleaning, duration_minutes: 60 }
plan: { managed: true }
phone_number: { country: CA, area_code: "416" }
owner: { email: owner@acmeplumbing.ca }
`;
const checkoutYaml = manifestYaml.replace("plan: { managed: true }", "plan: { checkout: { plan: pro, interval: monthly } }");
const partnerYaml = manifestYaml.replace("plan: { managed: true }\n", "").replace('phone_number: { country: CA, area_code: "416" }\n', "");

type Mode = { key: "platform"; access: "partner" | "all" } | { key: "business" };

/**
 * A fake API that keeps what it's told, so a second run sees the first run's
 * work, and holds to the API's rules where onboarding depends on them:
 * replayed and reused Idempotency-Keys, a platform key's checkout going to an
 * owner other than its own account, a partner losing the business once its
 * owner claims it, managed plans for operators only, numbers for paid plans
 * only, the free plan's room for text, and offers that run out. writes lists
 * every request that could change something.
 */
function fakeWorld(mode: Mode = { key: "platform", access: "all" }) {
  let next = 1;
  const id = () => `00000000-0000-4000-8000-${String(next++).padStart(12, "0")}`;
  const world = {
    businesses: mode.key === "business" ? [BUSINESS] : [] as string[],
    /** Whether a partner's key still reaches the business. */
    partnerLinked: true,
    /** Whether the business's own key was revoked, as accepting its creator's claim link does. */
    keyRevoked: false,
    business: { id: BUSINESS, name: "Acme Plumbing", timezone: "America/Toronto", locale: "en", website_url: "https://acmeplumbing.ca", business_type: "service_company", hours: [] as Row[] },
    receptionist: { greeting: "Hi", tone: "warm", transfer_mode: "never", transfer_number: null, booking_mode: "instant" } as Row,
    services: [] as Row[],
    rules: [] as Row[],
    sources: [] as Row[],
    entries: [] as Row[],
    uploads: new Map<string, { name: string; length: number; arrived: boolean; source?: Row }>(),
    /** Bytes of document text the free plan has room for. A plan already full refuses a document; one that fills up fails it while it's read. */
    freeRoom: Number.POSITIVE_INFINITY,
    /** Whether a website's first read fails. */
    crawlFails: false,
    /** Whether the key lacks billing:manage, so it can't read the plan. */
    billingHidden: false,
    billing: { plan: "free_cloud", managed: false, billing_interval: null as string | null },
    checkouts: new Map<string, Row>(),
    numbers: [] as Row[],
    claims: new Map<string, Row>(),
    offers: new Map<string, number>(),
    onboarding: { complete: false },
    team: { members: [{ id: id(), email: PARTNER, role: "business_owner" }] as Row[], invitations: [] as Row[] },
    idempotency: new Map<string, { body: string; status: number; reply: unknown }>(),
    writes: [] as string[],
    /** Requests whose next answer is lost after the work is done, as when the connection drops. */
    lose: new Set<string>(),
    /** Requests that fail with a 500 next time. */
    fail: new Set<string>(),
    /** The owner accepts the claim link, which takes the business away from a partner and revokes its sender's keys. */
    acceptClaim() {
      const link = world.team.invitations.find((invitation) => invitation.transfers_ownership)!;
      world.team.invitations = world.team.invitations.filter((invitation) => invitation !== link);
      world.team.members = [...world.team.members.filter((member) => member.email !== PARTNER), { id: id(), email: link.email, role: "business_owner" }];
      world.partnerLinked = false;
      world.keyRevoked = mode.key === "business";
    },
    /** Whoever pays pays the latest checkout. */
    pay() {
      const checkout = [...world.checkouts.values()].at(-1)!;
      checkout.paid = true;
      world.billing = { plan: String(checkout.plan), managed: false, billing_interval: String(checkout.interval) };
    },
  };
  const paid = () => world.billing.managed || world.billing.plan !== "free_cloud";
  const used = () => [...world.uploads.values()].filter((upload) => upload.source && upload.source.status !== "error").reduce((total, upload) => total + upload.length, 0);
  const page = (data: unknown[]) => ({ status: 200, body: { data, next_cursor: null, has_more: false } });
  const ok = (data: unknown, status = 200) => ({ status, body: { data } });
  const error = (status: number, code: string, message: string, details: Row[] = []) => ({ status, body: { error: { code, message, details } } });
  // A pattern such as "POST /knowledge/uploads/*/complete" matches one request.
  const matches = (pattern: string, route: string) => new RegExp(`^${pattern.replace(/[.?+^$()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/ ]+")}$`).test(route);
  const take = (set: Set<string>, route: string) => {
    const pattern = [...set].find((entry) => matches(entry, route));
    if (pattern) set.delete(pattern);
    return pattern !== undefined;
  };

  function handle(method: string, path: string, url: URL, headers: Headers, body: Row | undefined): { status: number; body: unknown } {
    const route = `${method} ${path}`;
    const header = headers.get("lobbystack-business");
    const reachable = world.businesses.includes(BUSINESS) && (mode.key !== "platform" || mode.access === "all" || world.partnerLinked);
    if (mode.key === "business") {
      if (route === "POST /businesses" || route === "GET /businesses" || route === "POST /billing/managed-plan") return error(403, "forbidden", "Only platform keys can call this endpoint.");
      if (header && header !== BUSINESS) return error(403, "forbidden", "This key belongs to another business.");
    } else if (route !== "GET /me" && route !== "GET /businesses" && route !== "POST /businesses" && (header !== BUSINESS || !reachable)) {
      return error(404, "not_found", "Business not found.");
    }
    if (route === "GET /me") return ok(mode.key === "business" ? { api_key: { id: id(), name: "Setup", prefix: "lsk_1a2b3c4d", scopes: [], created_at: "2026-10-12T00:00:00.000Z" }, business: { id: BUSINESS, name: world.business.name } } : { api_key: { id: id(), name: "Partner", prefix: "lsp_1a2b3c4d", scopes: [], created_at: "2026-10-12T00:00:00.000Z" }, business: header ? { id: BUSINESS, name: world.business.name } : null, platform: { partner: "acme", access: mode.access } });
    if (route === "GET /businesses") return page(world.businesses.filter(() => reachable).map((business) => ({ id: business, name: world.business.name, timezone: world.business.timezone, locale: "en", website_url: null, onboarding_stage: "website", created_at: "2026-10-12T00:00:00.000Z" })));
    if (route === "POST /businesses") {
      if (world.businesses.length) {
        // A new key makes a second business.
        world.businesses.push(id());
        return ok({ ...world.business, id: world.businesses.at(-1) }, 201);
      }
      world.businesses.push(BUSINESS);
      Object.assign(world.business, body, { hours: [] });
      return ok(world.business, 201);
    }
    if (route === "GET /business") return ok(world.business);
    if (route === "PATCH /business") { Object.assign(world.business, body); return ok(world.business); }
    if (route === "GET /receptionist") return ok(world.receptionist);
    if (route === "PATCH /receptionist") { Object.assign(world.receptionist, body); return ok(world.receptionist); }
    if (route === "GET /services") return page(world.services);
    if (route === "POST /services") { const service = { id: id(), active: true, staff_ids: [], ...body }; world.services.push(service); return ok(service, 201); }
    if (matches("PATCH /services/*", route)) { const service = world.services.find((row) => path.endsWith(String(row.id)))!; Object.assign(service, body); return ok(service); }
    if (route === "GET /rules") return page(world.rules);
    if (route === "POST /rules") { const rule = { id: id(), active: true, ...body }; world.rules.push(rule); return ok(rule, 201); }
    if (route === "GET /knowledge/sources") return page(world.sources.filter((source) => !url.searchParams.get("type") || source.type === url.searchParams.get("type")));
    if (route === "POST /knowledge/sources") {
      const existing = world.sources.find((source) => source.url === body!.url);
      if (existing) return ok(existing);
      const source = { id: id(), type: "website", url: body!.url, status: "processing", error: null, page_limit: 10 };
      world.sources.push(source);
      return ok(source, 202);
    }
    if (matches("GET /knowledge/sources/*", route)) {
      // A read that failed stays failed until it's retried.
      const source = world.sources.find((row) => path.endsWith(String(row.id)))!;
      if (source.status !== "error") Object.assign(source, world.crawlFails ? { status: "error", error: "The site refused the crawler." } : { status: "indexed" });
      return ok(source);
    }
    if (matches("POST /knowledge/sources/*/expand", route)) { const source = world.sources.find((row) => path.includes(String(row.id)))!; Object.assign(source, { page_limit: 50, status: "processing" }); return ok(source, 202); }
    if (matches("POST /knowledge/sources/*/retry", route)) {
      const source = world.sources.find((row) => path.includes(String(row.id)))!;
      Object.assign(source, source.type === "website" ? { status: "processing", error: null } : paid() ? { status: "pending", error: null } : { status: "error", error: STORAGE_FULL });
      return ok(source, 202);
    }
    if (matches("DELETE /knowledge/sources/*", route)) {
      const source = world.sources.find((row) => path.endsWith(String(row.id)));
      if (!source) return error(404, "not_found", "Knowledge source not found.");
      world.sources = world.sources.filter((row) => row !== source);
      return ok({ id: source.id, deleted: true });
    }
    if (route === "POST /knowledge/uploads") {
      const upload = id();
      world.uploads.set(upload, { name: String(body!.file_name), length: Number(body!.length), arrived: false });
      return ok({ upload_id: upload, upload_url: `https://storage.example.net/put/${upload}/${String(body!.file_name)}`, upload_headers: { "content-type": String(body!.content_type) }, expires_at: null }, 201);
    }
    if (matches("POST /knowledge/uploads/*/complete", route)) {
      const upload = world.uploads.get(path.split("/")[3]!);
      if (!upload) return error(404, "not_found", "Upload not found.");
      if (upload.source) return ok(upload.source);
      if (!upload.arrived) return error(409, "conflict", "The file hasn't arrived yet.");
      if (!paid() && used() >= world.freeRoom) return error(409, "plan_limit_reached", STORAGE_FULL);
      const full = !paid() && used() + upload.length > world.freeRoom;
      upload.source = { id: id(), type: "file", title: body?.title ?? upload.name, url: null, status: full ? "error" : "pending", error: full ? STORAGE_FULL : null, page_limit: null };
      world.sources.push(upload.source);
      return ok(upload.source, 201);
    }
    if (route === "GET /knowledge") return page(world.entries.filter((entry) => entry.type === url.searchParams.get("type")));
    if (route === "POST /knowledge") { const entry = body!.type === "faq" ? { id: id(), type: "faq", title: body!.question, content: body!.answer } : { id: id(), ...body }; world.entries.push(entry); return ok(entry, 201); }
    if (route === "GET /billing") return world.billingHidden ? error(403, "insufficient_scope", "This API key needs the billing:manage scope.") : ok(world.billing);
    if (route === "POST /billing/managed-plan") {
      if (mode.key !== "platform" || mode.access !== "all") return error(403, "forbidden", "Only an operator's platform key, one with access to every business, can manage a plan outside Polar.");
      world.billing = { plan: "enterprise", managed: true, billing_interval: null };
      return ok(world.billing);
    }
    if (route === "POST /billing/checkout") {
      if (mode.key === "platform" && !world.team.members.some((member) => member.role === "business_owner" && member.email !== PARTNER)) return error(409, "conflict", "Only the business's own owner can pay for a plan, and this business hasn't been claimed yet. Send the claim link first, or give it a managed plan.");
      if (world.billing.plan !== "free_cloud" && !(world.billing.plan === "starter" && body!.plan === "pro")) return error(409, "conflict", "This business already pays for a plan. Change it in the billing portal.");
      const checkout = { id: id(), plan: body!.plan, interval: body!.interval, status: "pending", checkout_url: null, error: null, paid: false, created_at: new Date().toISOString() };
      world.checkouts.set(checkout.id, checkout);
      return ok(checkout, 201);
    }
    if (matches("GET /billing/checkout/*", route)) {
      const checkout = world.checkouts.get(path.split("/")[3]!)!;
      Object.assign(checkout, { status: "ready", checkout_url: `https://polar.example/checkout/${String(checkout.id)}` });
      return ok(checkout);
    }
    if (route === "GET /phone-numbers") return page(world.numbers);
    if (route === "POST /phone-numbers/search") {
      if (!paid()) return error(409, "conflict", "A business needs a paid plan for a number.");
      const token = `offer-${next++}`;
      world.offers.set(token, Date.now() + 5 * 60_000);
      return page([{ phone_number: "+14165550123", country: "CA", kind: "local", locality: "Toronto", region: "ON", capabilities: { voice: true, sms: true }, offer_token: token, expires_at: new Date(world.offers.get(token)!).toISOString() }]);
    }
    if (route === "POST /phone-numbers/claims") {
      if ((world.offers.get(String(body!.offer_token)) ?? 0) < Date.now()) return error(400, "invalid_request", "The offer is invalid or has expired. Search again.", [{ path: "offer_token", message: "Invalid or expired." }]);
      if (world.numbers.length || [...world.claims.values()].some((claim) => claim.status !== "failed")) return error(409, "conflict", "The business already has a number, or another claim is in progress.");
      const claim = { id: id(), status: "pending", phone_number: "+14165550123", error: null };
      world.claims.set(claim.id, claim);
      return ok(claim, 202);
    }
    if (matches("GET /phone-numbers/claims/*", route)) {
      const claim = world.claims.get(path.split("/")[3]!)!;
      if (claim.status !== "failed") {
        claim.status = "claimed";
        if (!world.numbers.length) world.numbers.push({ id: id(), phone_number: claim.phone_number, status: "active" });
      }
      return ok(claim);
    }
    if (route === "GET /onboarding") return ok({ ...world.onboarding, missing: world.onboarding.complete || !paid() || world.numbers.length ? [] : ["phone_number"] });
    if (route === "POST /onboarding/complete") {
      if (paid() && !world.numbers.length && body?.skip_number !== true) return error(409, "conflict", "Onboarding is missing phone_number.");
      world.onboarding = { complete: true };
      return ok({ ...world.onboarding, missing: [] });
    }
    if (route === "GET /team") return ok(world.team);
    if (route === "POST /team/claim-link") {
      if (mode.key === "platform" && !world.team.members.some((member) => member.email === PARTNER && member.role === "business_owner")) return error(409, "conflict", "The account this key acts as doesn't own the business.");
      world.team.invitations = world.team.invitations.filter((invitation) => !invitation.transfers_ownership);
      const invitation = { id: id(), email: body!.email, role: "business_owner", status: "pending", transfers_ownership: true };
      world.team.invitations.push(invitation);
      return ok({ invitation, url: "https://app.example.com/invite?token=claim" }, 201);
    }
    return error(404, "not_found", `No fake for ${route}.`);
  }

  const fetch = async (input: URL | RequestInfo, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const headers = new Headers(init?.headers);
    if (url.origin !== ORIGIN) {
      world.writes.push(`${method} ${url.href}`);
      const upload = world.uploads.get(url.pathname.split("/")[2]!);
      if (upload) upload.arrived = true;
      return new Response("", { status: 200 });
    }
    const path = url.pathname.replace(/^\/api\/v1/, "");
    const route = `${method} ${path}`;
    if (method !== "GET") world.writes.push(route);
    const reply = (value: { status: number; body: unknown }) => new Response(JSON.stringify(value.body), { status: value.status, headers: { "content-type": "application/json" } });
    if (take(world.fail, route)) return reply(error(500, "internal_error", "Something went wrong."));
    if (world.keyRevoked) return reply(error(401, "unauthorized", "The API key is missing, unknown or revoked."));
    const body = typeof init?.body === "string" ? JSON.parse(init.body) as Row : undefined;
    const key = headers.get("idempotency-key");
    let answer: { status: number; body: unknown };
    const stored = key ? world.idempotency.get(`${route} ${key}`) : undefined;
    if (stored) answer = stored.body === (init?.body ?? "") ? { status: stored.status, body: stored.reply } : error(422, "idempotency_key_reused", "This Idempotency-Key was used with a different request body.");
    else {
      answer = handle(method, path, url, headers, body);
      if (key && answer.status < 400) world.idempotency.set(`${route} ${key}`, { body: String(init?.body ?? ""), status: answer.status, reply: answer.body });
    }
    if (take(world.lose, route)) throw new TypeError("fetch failed");
    return reply(answer);
  };
  return { world, fetch };
}

let dir: { path: string; remove(): Promise<void> };
let manifest: string;
let statePath: string;

beforeEach(async () => {
  dir = await tempDir();
  await mkdir(join(dir.path, "docs"));
  await writeFile(join(dir.path, "docs", "price-list.pdf"), "%PDF-1.7 prices");
  await writeFile(join(dir.path, "docs", "service-area.md"), "# Toronto and the GTA");
  manifest = join(dir.path, "acme.yaml");
  statePath = join(dir.path, "acme.state.json");
  await writeFile(manifest, manifestYaml);
});
afterEach(async () => { await dir.remove(); });

async function onboard(args: string[], fetch: typeof globalThis.fetch, options: { confirm?: (question: string) => Promise<boolean>; env?: NodeJS.ProcessEnv } = {}) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await main({ argv: ["onboard", manifest, ...args], env: { XDG_CONFIG_HOME: dir.path, LOBBYSTACK_URL: ORIGIN, LOBBYSTACK_API_KEY: KEY, ...options.env }, out: (text) => out.push(text), err: (text) => err.push(text), fetch, sleep: async () => undefined, ...(options.confirm ? { confirm: options.confirm } : {}) });
  return { code, out: out.join("\n"), err: err.join("\n") };
}

const state = async () => JSON.parse(await readFile(statePath, "utf8")) as Row;
const count = (writes: string[], pattern: RegExp) => writes.filter((write) => pattern.test(write)).length;
const fileSources = (world: { sources: Row[] }) => world.sources.filter((source) => source.type === "file");

describe("the manifest", () => {
  it("reads the plan's sample, and says where a file needs changes", async () => {
    const parsed = await readManifest(manifest);
    expect(parsed.business.hours).toEqual([{ day: "monday", open: "08:00", close: "17:00" }]);
    expect(parsed.knowledge?.faqs).toEqual([{ question: "Do you do emergency calls?", answer: "Yes, 24/7 for existing customers." }]);
    await writeFile(manifest, "business: { name: Acme, timezone: UTC, website_url: acme.ca, hours: [{ day: someday, open: 8, close: \"17:00\" }] }\nservices: [{ name: Cut }]\nreceptionist: { regenerate_summary: true }\nphone_number: { area_code: 416 }\nextra: 1\n");
    const error = await readManifest(manifest).then(() => null, (value: Error) => value.message);
    expect(error).toContain("business.website_url:");
    expect(error).toContain("business.hours[0].day: Use a day such as mon or monday.");
    expect(error).toContain("business.hours[0].open:");
    expect(error).toContain("services[0].duration_minutes:");
    expect(error).toContain("receptionist.regenerate_summary: It isn't a setting");
    expect(error).toContain("phone_number.area_code: Invalid input: expected string, received number. Put the value in quotes");
    expect(error).toMatch(/\(the file\): .*extra/);
  });

  it("refuses two entries a rerun couldn't tell apart", async () => {
    await writeFile(manifest, `${manifestYaml}rules:\n  - { title: Gas leaks, content: Leave the building. }\n  - { title: gas leaks , content: Call the gas company. }\n`.replace("websites: [https://acmeplumbing.ca]", "websites: [https://acmeplumbing.ca, acmeplumbing.ca/]"));
    const error = await readManifest(manifest).then(() => null, (value: Error) => value.message);
    expect(error).toContain("rules[1].title: It repeats entry 0.");
    expect(error).toContain("knowledge.websites[1]: It repeats entry 0.");
  });
});

describe("lobbystack onboard", () => {
  it("sets up the whole business with an operator's key, then changes nothing on a rerun", async () => {
    const { world, fetch } = fakeWorld();
    const first = await onboard(["--yes"], fetch);
    expect(first.err).toBe("");
    expect(first.code).toBe(exitCodes.ok);
    expect(first.out).toContain(`business       created      Acme Plumbing (${BUSINESS})`);
    expect(first.out).toContain("owner          sent         a claim link to owner@acmeplumbing.ca");
    expect(first.out).not.toContain("token=claim");
    expect(first.out).toContain("The business matches the manifest.");
    expect(world.writes).toEqual([
      "POST /businesses",
      "PATCH /business",
      "POST /billing/managed-plan",
      "PATCH /receptionist",
      "POST /services",
      "POST /knowledge/sources",
      "POST /knowledge/uploads",
      expect.stringMatching(/^PUT https:\/\/storage\.example\.net\/put\/.+\/price-list\.pdf$/),
      expect.stringMatching(/^POST \/knowledge\/uploads\/.+\/complete$/),
      "POST /knowledge/uploads",
      expect.stringMatching(/^PUT https:\/\/storage\.example\.net\/put\/.+\/service-area\.md$/),
      expect.stringMatching(/^POST \/knowledge\/uploads\/.+\/complete$/),
      "POST /knowledge",
      expect.stringMatching(/^POST \/knowledge\/sources\/.+\/expand$/),
      "POST /phone-numbers/search",
      "POST /phone-numbers/claims",
      "POST /onboarding/complete",
      "POST /team/claim-link",
    ]);
    // The upload is named by the file's own name, which a document without a title shows as.
    expect(fileSources(world).map((source) => source.title)).toEqual(["price-list.pdf", "service-area.md"]);
    expect(world.business.hours).toEqual([{ day: "monday", open: "08:00", close: "17:00" }]);
    expect(world.receptionist).toMatchObject({ greeting: "Thanks for calling Acme Plumbing, how can I help?", transfer_mode: "on_urgent", transfer_number: "+14165550100", booking_mode: "request" });
    expect(await state()).toMatchObject({ version: 1, url: ORIGIN, business_id: BUSINESS, uploads: { "docs/price-list.pdf": { source_id: expect.any(String) }, "docs/service-area.md": { source_id: expect.any(String) } }, pending_uploads: {}, replaced: [], keys: {}, handed_over_to: "owner@acmeplumbing.ca" });

    world.writes.length = 0;
    const second = await onboard([], fetch);
    expect(second.code).toBe(exitCodes.ok);
    expect(world.writes).toEqual([]);
    expect(second.out).not.toMatch(/created|updated|added|uploaded|claimed|sent|reading/);
  });

  it("with an operator's key and a checkout, sends the claim link first and exits 4 until the plan is paid", async () => {
    const { world, fetch } = fakeWorld();
    // Room for the price list's text, but not the service area's as well.
    world.freeRoom = 20;
    await writeFile(manifest, checkoutYaml);

    const unclaimed = await onboard(["--yes", "--json"], fetch);
    expect(unclaimed.code).toBe(exitCodes.waiting);
    const report = JSON.parse(unclaimed.out) as { waiting: string[]; changes: Row[] };
    expect(report.waiting).toEqual(["owner@acmeplumbing.ca pays for the pro monthly plan once they own the business. When they've accepted the claim link, run this again to start the checkout."]);
    expect(report.changes).toContainEqual({ step: "full site", action: "waiting", detail: "https://acmeplumbing.ca: for the paid plan" });
    expect(world.writes).toContain("POST /team/claim-link");
    for (const write of ["POST /billing/checkout", "POST /phone-numbers/search", "POST /onboarding/complete"]) expect(world.writes).not.toContain(write);
    expect(count(world.writes, /expand$/)).toBe(0);

    world.acceptClaim();
    world.writes.length = 0;
    const unpaid = await onboard(["--yes"], fetch);
    expect(unpaid.code).toBe(exitCodes.waiting);
    expect(unpaid.out).toContain(`files          waiting      docs/service-area.md: ${STORAGE_FULL}`);
    expect(unpaid.out).toContain("Not finished yet:\n- The pro monthly plan isn't paid yet. Send https://polar.example/checkout/");
    expect(world.writes).toEqual(["POST /billing/checkout"]);

    // A rerun within the hour sends the same checkout page instead of making another.
    world.writes.length = 0;
    expect((await onboard(["--yes"], fetch)).code).toBe(exitCodes.waiting);
    expect(world.writes).toEqual([]);

    world.pay();
    world.writes.length = 0;
    const done = await onboard(["--yes"], fetch);
    expect(done.err).toBe("");
    expect(done.code).toBe(exitCodes.ok);
    // The document the free plan had no room for is read again, and the site in full.
    expect(world.writes).toEqual([expect.stringMatching(/^POST \/knowledge\/sources\/.+\/retry$/), expect.stringMatching(/expand$/), "POST /phone-numbers/search", "POST /phone-numbers/claims", "POST /onboarding/complete"]);
    expect(done.out).toContain(`files          retrying     docs/service-area.md: ${STORAGE_FULL}`);
    expect(done.out).toContain("The business matches the manifest.");
    expect(fileSources(world).every((source) => source.status !== "error")).toBe(true);
  });

  it("with a partner's key, refuses a plan or a number, and hands the business over last", async () => {
    const { world, fetch } = fakeWorld({ key: "platform", access: "partner" });
    const refused = await onboard(["--yes"], fetch);
    expect(refused.code).toBe(exitCodes.invalid);
    expect(refused.err).toContain("A partner's platform key can't buy a plan or a number");
    expect(world.writes).toEqual([]);

    await writeFile(manifest, partnerYaml);
    const done = await onboard(["--yes"], fetch);
    expect(done.code).toBe(exitCodes.ok);
    expect(done.out).toContain("onboarding     left open    for the owner to pick a plan and a number after claiming it");
    expect(world.writes.at(-1)).toBe("POST /team/claim-link");
    expect(world.writes).not.toContain("POST /onboarding/complete");

    // Once the owner accepts, the partner's key can't reach the business, and a rerun says why.
    world.acceptClaim();
    const after = await onboard([], fetch);
    expect(after.code).toBe(exitCodes.auth);
    expect(after.err).toContain("owner@acmeplumbing.ca has a claim link for this business, and this key can't reach it any more");
  });

  it("with a business's own key, sets up that business and hands it over last", async () => {
    const { world, fetch } = fakeWorld({ key: "business" });
    await writeFile(manifest, checkoutYaml);
    const unpaid = await onboard(["--yes"], fetch);
    expect(unpaid.code).toBe(exitCodes.waiting);
    expect(unpaid.out).toContain(`business       found        Acme Plumbing (${BUSINESS})`);
    expect(unpaid.out).toContain("owner          waiting      for the steps above");
    expect(world.writes).not.toContain("POST /businesses");
    expect(world.writes).not.toContain("POST /team/claim-link");
    expect(world.writes).toContain("POST /billing/checkout");

    world.pay();
    world.writes.length = 0;
    expect((await onboard(["--yes"], fetch)).code).toBe(exitCodes.ok);
    expect(world.writes).toEqual([expect.stringMatching(/expand$/), "POST /phone-numbers/search", "POST /phone-numbers/claims", "POST /onboarding/complete", "POST /team/claim-link"]);

    // Accepting the link revokes the key, and a rerun says why.
    world.acceptClaim();
    const after = await onboard([], fetch, { env: { LOBBYSTACK_API_KEY: "lsk_1a2b3c4d_abcdefghijklmnopqrstuvwxyzABCDEF" } });
    expect(after.code).toBe(exitCodes.auth);
    expect(after.err).toContain("owner@acmeplumbing.ca has a claim link for this business, and this key can't reach it any more (The API key is missing, unknown or revoked.)");
  });

  it("won't fill a business's own key's business with a manifest for another business", async () => {
    const { world, fetch } = fakeWorld({ key: "business" });
    world.business.name = "Maple Salon";
    const withoutPlan = manifestYaml.replace("plan: { managed: true }\n", "");
    await writeFile(manifest, withoutPlan);
    const refused = await onboard(["--yes"], fetch);
    expect(refused.code).toBe(exitCodes.invalid);
    expect(refused.err).toContain(`Business ${BUSINESS} is Maple Salon, not Acme Plumbing. To set it up with this manifest, put id: ${BUSINESS} under business in the manifest.`);
    expect(world.writes).toEqual([]);
    // Saying so in the manifest renames it.
    await writeFile(manifest, withoutPlan.replace("  name: Acme Plumbing\n", `  id: ${BUSINESS}\n  name: Acme Plumbing\n`));
    expect((await onboard(["--yes"], fetch)).code).toBe(exitCodes.waiting);
    expect(world.business.name).toBe("Acme Plumbing");
  });

  it("starts a checkout for a move to Pro, and reports other plan changes without holding up the rest", async () => {
    const { world, fetch } = fakeWorld({ key: "business" });
    await writeFile(manifest, checkoutYaml);
    world.billing = { plan: "starter", managed: false, billing_interval: "monthly" };
    world.numbers.push({ id: "number", phone_number: "+14165550199", status: "active" });
    expect((await onboard(["--yes"], fetch)).code).toBe(exitCodes.waiting);
    expect(world.writes).toContain("POST /billing/checkout");

    world.billing = { plan: "pro", managed: false, billing_interval: "annual" };
    const differs = await onboard(["--yes"], fetch);
    expect(differs.code).toBe(exitCodes.ok);
    expect(differs.out).toContain("plan           differs      pro annual is in force");
    expect(differs.out).toContain("The business matches the manifest, except:\n- The business pays for pro annual, and the manifest asks for pro monthly. Change it in Polar's billing portal");
    expect(world.writes.slice(-2)).toEqual(["POST /onboarding/complete", "POST /team/claim-link"]);
  });

  it("replaces an old checkout page only when a person says so, and one for another plan at once", async () => {
    const { world, fetch } = fakeWorld({ key: "business" });
    await writeFile(manifest, checkoutYaml);
    expect((await onboard(["--yes"], fetch)).code).toBe(exitCodes.waiting);
    const [first] = world.checkouts.values();
    first!.created_at = new Date(Date.now() - 2 * 60 * 60_000).toISOString();
    world.writes.length = 0;
    // --yes keeps an old page: it may still take a payment, and a second one could be paid too.
    const kept = await onboard(["--yes"], fetch);
    expect(kept.code).toBe(exitCodes.waiting);
    expect(kept.out).toContain("If that page has run out, run this in a terminal, without --yes, to start a new one.");
    expect(world.writes).toEqual([]);
    const questions: string[] = [];
    expect((await onboard([], fetch, { confirm: async (question) => { questions.push(question); return true; } })).code).toBe(exitCodes.waiting);
    expect(questions).toEqual([expect.stringMatching(/^The pro monthly checkout page from .+ may have run out\. Start a new one\?$/)]);
    expect(world.writes).toEqual(["POST /billing/checkout"]);
    await writeFile(manifest, checkoutYaml.replace("plan: pro, interval: monthly", "plan: starter, interval: monthly"));
    world.writes.length = 0;
    expect((await onboard(["--yes"], fetch)).code).toBe(exitCodes.waiting);
    expect(world.writes).toEqual(["POST /billing/checkout"]);
    expect([...world.checkouts.values()].map((checkout) => checkout.plan)).toEqual(["pro", "pro", "starter"]);
  });

  it("refuses a managed plan from a key that isn't an operator's, before anything changes", async () => {
    const { world, fetch } = fakeWorld({ key: "business" });
    const refused = await onboard(["--yes"], fetch);
    expect(refused.code).toBe(exitCodes.invalid);
    expect(refused.err).toContain("Only an operator's platform key, one with access to every business, can set a managed plan.");
    expect(world.writes).toEqual([]);
  });

  it("says who owns the business when a claim link can't go out", async () => {
    const { world, fetch } = fakeWorld();
    expect((await onboard(["--yes"], fetch)).code).toBe(exitCodes.ok);
    // Someone else claimed it in the dashboard.
    world.team = { members: [{ id: "member", email: "boss@example.org", role: "business_owner" }], invitations: [] };
    const refused = await onboard([], fetch);
    expect(refused.code).toBe(exitCodes.invalid);
    expect(refused.err).toContain("Couldn't send owner@acmeplumbing.ca a claim link: The account this key acts as doesn't own the business. The business's owners are boss@example.org. If one of them should own it, change owner in the manifest.");
  });

  it("explains a checkout an operator can't start for a business nobody has claimed", async () => {
    const { fetch } = fakeWorld();
    await writeFile(manifest, checkoutYaml.replace("owner: { email: owner@acmeplumbing.ca }\n", ""));
    const refused = await onboard(["--yes"], fetch);
    expect(refused.code).toBe(exitCodes.invalid);
    expect(refused.err).toContain("this business hasn't been claimed yet. Send the claim link first, or give it a managed plan. Add owner to the manifest, or use plan: { managed: true }.");
  });

  it("waits for a paid plan to claim a number, and still sends the claim link", async () => {
    const { world, fetch } = fakeWorld();
    await writeFile(manifest, manifestYaml.replace("plan: { managed: true }\n", ""));
    const waiting = await onboard(["--yes"], fetch);
    expect(waiting.code).toBe(exitCodes.waiting);
    expect(waiting.out).toContain("phone number   waiting      for a paid plan");
    expect(waiting.out).toContain("- A number needs a paid plan. Pay for one in the dashboard, or add plan to the manifest, then run this again.");
    expect(world.writes).not.toContain("POST /phone-numbers/search");
    expect(world.writes.at(-1)).toBe("POST /team/claim-link");
  });

  it("waits for a paid plan when its key can't read the plan, and still sends the claim link", async () => {
    const { world, fetch } = fakeWorld();
    world.billingHidden = true;
    await writeFile(manifest, manifestYaml.replace("plan: { managed: true }\n", ""));
    const waiting = await onboard(["--yes"], fetch);
    expect(waiting.code).toBe(exitCodes.waiting);
    expect(waiting.out).toContain("- A business needs a paid plan for a number. Pay for a plan in the dashboard, or add plan to the manifest, then run this again.");
    expect(world.writes.at(-1)).toBe("POST /team/claim-link");
  });

  it("shows the plan without changing anything or writing a state file", async () => {
    const { world, fetch } = fakeWorld();
    const plan = await onboard(["--plan", "--json"], fetch);
    expect(plan.code).toBe(exitCodes.ok);
    expect(world.writes).toEqual([]);
    expect(JSON.parse(plan.out)).toMatchObject({ business_id: null, plan: true, changes: [{ step: "business", action: "would create", detail: "Acme Plumbing" }, { step: "receptionist", action: "would set up" }, { step: "services", action: "would set up" }, { step: "knowledge", action: "would set up" }, { step: "plan", action: "would set up" }, { step: "phone number", action: "would set up" }, { step: "owner", action: "would set up" }] });
    await expect(readFile(statePath, "utf8")).rejects.toThrow();
  });

  it("asks before claiming a number, and stops with what's done saved when nobody says yes", async () => {
    const { world, fetch } = fakeWorld();
    const questions: string[] = [];
    const refused = await onboard([], fetch, { confirm: async (question) => { questions.push(question); return false; } });
    expect(refused.code).toBe(exitCodes.invalid);
    expect(questions).toEqual(["Claim +14165550123 (Toronto) for Acme Plumbing? A number costs money."]);
    expect(refused.err).toContain("Claiming a number costs money, so it needs a yes. Run again with --yes");
    expect(world.writes).not.toContain("POST /phone-numbers/claims");
    // The rerun picks up there: the business isn't made again.
    world.writes.length = 0;
    const accepted = await onboard([], fetch, { confirm: async () => true });
    expect(accepted.code).toBe(exitCodes.ok);
    expect(world.writes).toEqual(["POST /phone-numbers/search", "POST /phone-numbers/claims", "POST /onboarding/complete", "POST /team/claim-link"]);
    expect(await state()).toMatchObject({ business_id: BUSINESS });
  });

  it("gets the same business, upload, claim and claim link back when their answers are lost", async () => {
    const { world, fetch } = fakeWorld();
    // In the order a run reaches them, so each run gets one step further.
    for (const route of ["POST /businesses", "POST /knowledge/uploads/*/complete", "POST /knowledge/sources/*/expand", "POST /phone-numbers/claims", "POST /team/claim-link"]) {
      world.lose.add(route);
      const lost = await onboard(["--yes"], fetch);
      expect(lost.code).toBe(exitCodes.failed);
      if (route !== "POST /businesses") expect(lost.err).toContain("run the same command again to pick up from there");
    }
    const done = await onboard(["--yes"], fetch);
    expect(done.err).toBe("");
    expect(done.code).toBe(exitCodes.ok);
    expect(world.businesses).toEqual([BUSINESS]);
    expect(world.claims.size).toBe(1);
    expect(count(world.writes, /^POST \/phone-numbers\/search$/)).toBe(1);
    expect(fileSources(world)).toHaveLength(2);
    expect(count(world.writes, /^POST \/knowledge\/uploads$/)).toBe(2);
    expect(count(world.writes, /^POST \/team\/claim-link$/)).toBe(1);
    expect(count(world.writes, /expand$/)).toBe(1);
    expect(await state()).toMatchObject({ keys: {}, pending_uploads: {} });
  });

  it("deletes an upload a crash left behind when the file changed before the rerun", async () => {
    const { world, fetch } = fakeWorld();
    world.lose.add("POST /knowledge/uploads/*/complete");
    expect((await onboard(["--yes"], fetch)).code).toBe(exitCodes.failed);
    const [orphan] = fileSources(world);
    await writeFile(join(dir.path, "docs", "price-list.pdf"), "%PDF-1.7 new prices");
    expect((await onboard(["--yes"], fetch)).code).toBe(exitCodes.ok);
    expect(world.writes).toContain(`DELETE /knowledge/sources/${String(orphan!.id)}`);
    expect(fileSources(world)).toHaveLength(2);
  });

  it("makes a service again when someone deleted it, instead of replaying the first answer", async () => {
    const { world, fetch } = fakeWorld();
    expect((await onboard(["--yes"], fetch)).code).toBe(exitCodes.ok);
    world.services.length = 0;
    world.writes.length = 0;
    expect((await onboard([], fetch)).code).toBe(exitCodes.ok);
    expect(world.writes).toEqual(["POST /services"]);
    expect(world.services).toHaveLength(1);
  });

  it("replaces a changed file, and tries a failed delete of its old copy again", async () => {
    const { world, fetch } = fakeWorld();
    expect((await onboard(["--yes"], fetch)).code).toBe(exitCodes.ok);
    const old = (await state()).uploads as Record<string, { source_id: string }>;
    await writeFile(join(dir.path, "docs", "price-list.pdf"), "%PDF-1.7 new prices");
    world.fail.add("DELETE /knowledge/sources/*");
    world.writes.length = 0;
    const failed = await onboard([], fetch);
    expect(failed.code).toBe(exitCodes.failed);
    expect(failed.out).toContain("files          replaced     docs/price-list.pdf");
    expect(failed.out).toContain(`Some steps failed:\n- Couldn't delete the earlier copy of a changed document (${old["docs/price-list.pdf"]!.source_id})`);
    expect(await state()).toMatchObject({ replaced: [old["docs/price-list.pdf"]!.source_id] });
    world.writes.length = 0;
    expect((await onboard([], fetch)).code).toBe(exitCodes.ok);
    expect(world.writes).toEqual([`DELETE /knowledge/sources/${old["docs/price-list.pdf"]!.source_id}`]);
    expect(await state()).toMatchObject({ replaced: [] });
    expect(fileSources(world)).toHaveLength(2);
  });

  it("keeps a moved file's source, and uploads a file again when its title changes", async () => {
    const { world, fetch } = fakeWorld();
    expect((await onboard(["--yes"], fetch)).code).toBe(exitCodes.ok);
    await writeFile(join(dir.path, "docs", "area.md"), "# Toronto and the GTA");
    await writeFile(manifest, manifestYaml.replace("./docs/service-area.md", "./docs/area.md"));
    world.writes.length = 0;
    expect((await onboard(["--plan"], fetch)).out).toContain("files          would move   docs/service-area.md to docs/area.md");
    const moved = await onboard([], fetch);
    expect(moved.code).toBe(exitCodes.ok);
    expect(moved.out).toContain("files          moved        docs/service-area.md to docs/area.md");
    expect(world.writes).toEqual([]);
    await writeFile(manifest, manifestYaml.replace("./docs/service-area.md", "{ path: ./docs/area.md, title: Where we work }"));
    world.writes.length = 0;
    expect((await onboard([], fetch)).code).toBe(exitCodes.ok);
    expect(world.writes).toEqual(["POST /knowledge/uploads", expect.stringMatching(/area\.md$/), expect.stringMatching(/complete$/), expect.stringMatching(/^DELETE \/knowledge\/sources\//)]);
    expect(world.sources.find((source) => source.title === "Where we work")).toBeDefined();
  });

  it("carries on past a website it couldn't read, reads it once more, then reports it", async () => {
    const { world, fetch } = fakeWorld();
    world.crawlFails = true;
    const failed = await onboard(["--yes"], fetch);
    expect(failed.code).toBe(exitCodes.failed);
    expect(failed.out).toContain("Some steps failed:\n- https://acmeplumbing.ca: Reading it failed: The site refused the crawler. Once that's fixed, the next run reads it again.");
    expect(world.writes.slice(-2)).toEqual(["POST /onboarding/complete", "POST /team/claim-link"]);

    world.writes.length = 0;
    const [site] = world.sources;
    expect((await onboard([], fetch)).code).toBe(exitCodes.failed);
    expect(world.writes).toEqual([`POST /knowledge/sources/${String(site!.id)}/retry`]);

    // The same failure isn't read, and billed, again on every run.
    world.writes.length = 0;
    const reported = await onboard([], fetch);
    expect(reported.code).toBe(exitCodes.ok);
    expect(world.writes).toEqual([]);
    expect(reported.out).toContain(`The business matches the manifest, except:\n- https://acmeplumbing.ca couldn't be read: The site refused the crawler. lobbystack knowledge retry ${String(site!.id)} reads it again.`);
  });

  it("reads a website whose first read failed once it's fixed", async () => {
    const { world, fetch } = fakeWorld();
    world.crawlFails = true;
    expect((await onboard(["--yes"], fetch)).code).toBe(exitCodes.failed);
    world.crawlFails = false;
    world.writes.length = 0;
    expect((await onboard([], fetch)).code).toBe(exitCodes.ok);
    expect(world.writes).toEqual([expect.stringMatching(/retry$/), expect.stringMatching(/expand$/)]);
  });

  it("deletes an upload a crash left behind when the file changed back before the rerun", async () => {
    const { world, fetch } = fakeWorld();
    expect((await onboard(["--yes"], fetch)).code).toBe(exitCodes.ok);
    await writeFile(join(dir.path, "docs", "price-list.pdf"), "%PDF-1.7 new prices");
    world.lose.add("POST /knowledge/uploads/*/complete");
    expect((await onboard([], fetch)).code).toBe(exitCodes.failed);
    await writeFile(join(dir.path, "docs", "price-list.pdf"), "%PDF-1.7 prices");
    world.writes.length = 0;
    expect((await onboard([], fetch)).code).toBe(exitCodes.ok);
    expect(world.writes).toEqual([expect.stringMatching(/complete$/), expect.stringMatching(/^DELETE \/knowledge\/sources\//)]);
    expect(fileSources(world)).toHaveLength(2);
    expect(await state()).toMatchObject({ pending_uploads: {}, replaced: [] });
  });

  it("acts on --business, and stops when it, the manifest and the state disagree", async () => {
    const { world, fetch } = fakeWorld();
    world.businesses.push(BUSINESS);
    expect((await onboard(["--yes", "--business", BUSINESS], fetch)).code).toBe(exitCodes.ok);
    expect(world.writes).not.toContain("POST /businesses");
    const other = "6e1ce0b5-8f2d-4b62-8b61-9f2c3d4e5f60";
    const disagree = await onboard(["--business", other], fetch);
    expect(disagree.code).toBe(exitCodes.invalid);
    expect(disagree.err).toContain(`the state file names business ${BUSINESS}, and --business names ${other}`);
  });

  it("won't set up a business --business names under another name without the manifest saying so", async () => {
    const { world, fetch } = fakeWorld();
    world.businesses.push(BUSINESS);
    world.business.name = "Maple Salon";
    const refused = await onboard(["--yes", "--business", BUSINESS], fetch);
    expect(refused.code).toBe(exitCodes.invalid);
    expect(refused.err).toContain(`Business ${BUSINESS} is Maple Salon, not Acme Plumbing. To set it up with this manifest, put id: ${BUSINESS} under business in the manifest.`);
    expect(world.writes).toEqual([]);
  });

  it("ignores LOBBYSTACK_BUSINESS, which other commands use", async () => {
    const { world, fetch } = fakeWorld();
    expect((await onboard(["--yes"], fetch, { env: { LOBBYSTACK_BUSINESS: "6e1ce0b5-8f2d-4b62-8b61-9f2c3d4e5f60" } })).code).toBe(exitCodes.ok);
    expect(world.writes[0]).toBe("POST /businesses");
  });

  it("won't make a second business when the state file is gone", async () => {
    const { world, fetch } = fakeWorld();
    expect((await onboard(["--yes"], fetch)).code).toBe(exitCodes.ok);
    await rm(statePath);
    const again = await onboard(["--yes"], fetch);
    expect(again.code).toBe(exitCodes.invalid);
    expect(again.err).toContain(`You already onboarded Acme Plumbing (${BUSINESS}), and there's no state file to say it's this one. To set it up, put id: ${BUSINESS} under business`);
    expect(world.businesses).toEqual([BUSINESS]);
  });

  it("leaves onboarding open when it's missing something the manifest didn't ask for", async () => {
    const { world, fetch } = fakeWorld();
    await writeFile(manifest, manifestYaml.replace('phone_number: { country: CA, area_code: "416" }\n', ""));
    const open = await onboard(["--yes"], fetch);
    expect(open.code).toBe(exitCodes.ok);
    expect(open.out).toContain("onboarding     left open    missing phone_number");
    expect(world.writes).not.toContain("POST /onboarding/complete");
    await writeFile(manifest, manifestYaml.replace('phone_number: { country: CA, area_code: "416" }\n', "onboarding: { complete: true }\n"));
    const refused = await onboard(["--yes"], fetch);
    expect(refused.code).toBe(exitCodes.invalid);
    expect(refused.err).toContain("Onboarding can't finish while it's missing phone_number.");
  });

  it("keeps files inside the manifest's folder, and refuses another dashboard's state", async () => {
    const { world, fetch } = fakeWorld();
    for (const path of ["../secrets.txt", join(dir.path, "docs", "price-list.pdf")]) {
      await writeFile(manifest, manifestYaml.replace("./docs/price-list.pdf", path));
      expect(await onboard(["--yes"], fetch)).toMatchObject({ code: exitCodes.invalid, err: expect.stringContaining(`${path} has to be a file inside the manifest's folder`) });
    }
    expect(world.writes).toEqual([]);
    // A name that starts with two dots is still inside.
    await writeFile(join(dir.path, "docs", "..notes.md"), "notes");
    await writeFile(manifest, manifestYaml.replace("./docs/price-list.pdf", "docs/..notes.md"));
    expect((await onboard(["--plan"], fetch)).code).toBe(exitCodes.ok);
    await writeFile(statePath, JSON.stringify({ version: 1, url: "https://staging.example.com", run_id: "x" }));
    expect(await onboard([], fetch)).toMatchObject({ code: exitCodes.invalid, err: expect.stringContaining("belongs to https://staging.example.com") });
  });

  it("refuses a link that leads out of the manifest's folder", async (context) => {
    const { world, fetch } = fakeWorld();
    const outside = await tempDir();
    try {
      await writeFile(join(outside.path, "config.json"), "{\"key\":\"lsk_secret\"}");
      try {
        await symlink(join(outside.path, "config.json"), join(dir.path, "docs", "prices.txt"), "file");
      } catch (error) {
        // Windows makes links only with developer mode on.
        if ((error as NodeJS.ErrnoException).code === "EPERM") context.skip();
        throw error;
      }
      await writeFile(manifest, manifestYaml.replace("./docs/price-list.pdf", "./docs/prices.txt"));
      expect(await onboard(["--yes"], fetch)).toMatchObject({ code: exitCodes.invalid, err: expect.stringContaining("./docs/prices.txt has to be a file inside the manifest's folder") });
      expect(world.writes).toEqual([]);
    } finally {
      await outside.remove();
    }
  });

  it("explains its exit codes in its help", async () => {
    const { fetch } = fakeWorld();
    const help = await onboard(["--help"], fetch);
    expect(help.out).toContain("4 not finished: the rest waits on a payment or the owner's\nclaim, so run it again once that's done.");
  });
});
