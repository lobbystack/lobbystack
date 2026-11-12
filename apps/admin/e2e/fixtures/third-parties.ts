import { createHash, randomBytes, randomInt, randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { THIRD_PARTY_ORIGIN, THIRD_PARTY_PORT } from "./full-stack-environment";

// Local stand-ins for the carriers, Calendly, Firecrawl and the embedding
// provider. carrier-redirect.mjs points the carrier SDKs here, and the
// CALENDLY_, FIRECRAWL_ and AI_EMBEDDING_ settings point the others here, so the
// real adapters run in the admin server and the worker. Each answers only what
// those adapters ask, and records what they sent for the specs to check.

export type CarrierCall = { method: string; host: string; path: string; form: Record<string, string> };
type Number = { sid: string; phone_number: string; friendly_name: string | null; sms_url: string | null; voice_url: string | null; trunk_sid: string | null };
type Booking = { uri: string; status: "active"; start_time: string; end_time: string; event_type: string; email: string };

const CALENDLY_API = `${THIRD_PARTY_ORIGIN}/calendly-api`;
const CALENDLY_USER = `${CALENDLY_API}/users/e2e-user`;
const CALENDLY_ORGANIZATION = `${CALENDLY_API}/organizations/e2e-organization`;
export const CALENDLY_EVENT_TYPE = { id: "e2e-consultation", name: "Consultation" };
const EVENT_TYPE_MINUTES = 60;
const eventType = {
  uri: `${CALENDLY_API}/event_types/${CALENDLY_EVENT_TYPE.id}`,
  name: CALENDLY_EVENT_TYPE.name,
  duration: EVENT_TYPE_MINUTES,
  active: true,
  custom_questions: [{ name: "Anything we should know?", type: "text", enabled: true, required: false, position: 0 }],
  locations: [{ kind: "physical", location: "12 Harbour Street" }],
  pooling_type: null,
};

function send(response: ServerResponse, status: number, body?: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(body === undefined ? undefined : JSON.stringify(body));
}

async function readBody(request: IncomingMessage): Promise<string> {
  let raw = "";
  for await (const chunk of request) raw += chunk;
  return raw;
}

function randomTorontoNumber(): string {
  return `+1416${String(randomInt(10_000_000)).padStart(7, "0")}`;
}

export type ThirdParties = {
  carrier: { calls: CarrierCall[]; offered: string[]; messagesTo(to: string): CarrierCall[]; addNumber(input: { sid: string; e164: string; trunkSid?: string }): void };
  calendly: {
    /** What the next account to connect pays for. Calendly's Free plan is `basic` at the `free` stage. */
    plan: "paid" | "free";
    /** The message a booking is refused with, or null to take bookings. */
    bookingRefusal: string | null;
    authorizations: Array<{ scope: string; clientId: string }>;
    tokenExchanges: Array<{ pkceMatched: boolean }>;
    webhooks: Array<{ url: string; events: string[] }>;
    bookings: Booking[];
  };
  /** What the worker and admin asked Polar: checkouts it made, usage it reported, subscriptions it changed. */
  polar: { checkouts: Array<Record<string, unknown>>; events: Array<Record<string, unknown>>; subscriptionChanges: Array<{ id: string; body: Record<string, unknown> }> };
  firecrawl: {
    /** How many of the next crawl starts to refuse with a 429, as a rate limit does. */
    rateLimitedStarts: number;
    /** Every crawl start, refused or not. */
    starts: Array<{ url: string; status: number }>;
  };
  close(): Promise<void>;
};

export async function startThirdParties(): Promise<ThirdParties> {
  const numbers = new Map<string, Number>();
  const codes = new Map<string, { challenge: string }>();
  const tokens = new Set<string>();
  const calendly: ThirdParties["calendly"] = { plan: "paid", bookingRefusal: null, authorizations: [], tokenExchanges: [], webhooks: [], bookings: [] };
  const calls: CarrierCall[] = [];
  const offered: string[] = [];
  const firecrawl: ThirdParties["firecrawl"] = { rateLimitedStarts: 0, starts: [] };
  const crawls = new Map<string, string>();
  const polar: ThirdParties["polar"] = { checkouts: [], events: [], subscriptionChanges: [] };

  const numberResource = (sid: string, e164 = randomTorontoNumber()): Number => {
    const existing = numbers.get(sid);
    if (existing) return existing;
    const created: Number = { sid, phone_number: e164, friendly_name: null, sms_url: null, voice_url: null, trunk_sid: null };
    numbers.set(sid, created);
    return created;
  };

  function twilioApi(request: IncomingMessage, response: ServerResponse, path: string, form: Record<string, string>): void {
    const url = new URL(path, "http://twilio.invalid");
    const route = url.pathname.replace(/^\/2010-04-01\/Accounts\/[^/]+/, "");
    if (/^\/AvailablePhoneNumbers\/[A-Z]{2}\/Local\.json$/.test(route)) {
      const available = Array.from({ length: 3 }, randomTorontoNumber);
      offered.push(...available);
      return send(response, 200, { available_phone_numbers: available.map((phone_number) => ({ phone_number, friendly_name: phone_number, locality: "Toronto", region: "ON", iso_country: "CA", capabilities: { voice: true, SMS: true, MMS: false } })), uri: route });
    }
    if (route === "/IncomingPhoneNumbers.json" && request.method === "GET") {
      const wanted = url.searchParams.get("PhoneNumber");
      return send(response, 200, { incoming_phone_numbers: [...numbers.values()].filter((number) => number.phone_number === wanted), uri: route });
    }
    if (route === "/IncomingPhoneNumbers.json" && request.method === "POST") {
      const number = numberResource(`PN${randomBytes(16).toString("hex")}`, form.PhoneNumber);
      return send(response, 201, { ...number, friendly_name: form.FriendlyName ?? null, sms_url: form.SmsUrl ?? null });
    }
    const owned = /^\/IncomingPhoneNumbers\/(PN\w+)\.json$/.exec(route)?.[1];
    if (owned && request.method === "DELETE") { numbers.delete(owned); return send(response, 204); }
    if (owned) {
      const number = numberResource(owned);
      if (request.method === "POST" && form.VoiceUrl !== undefined) number.voice_url = form.VoiceUrl;
      return send(response, 200, number);
    }
    if (route === "/Messages.json" && request.method === "POST") return send(response, 201, { sid: `SM${randomBytes(16).toString("hex")}`, status: "queued", to: form.To, from: form.From, body: form.Body });
    send(response, 404, { code: 20404, message: `The fake has no ${request.method} ${route}.`, status: 404 });
  }

  function twilioTrunking(request: IncomingMessage, response: ServerResponse, path: string, form: Record<string, string>): void {
    const [, trunkSid, , phoneSid] = /^\/v1\/Trunks\/([^/]+)\/PhoneNumbers(\/(.+))?$/.exec(path) ?? [];
    if (!trunkSid) return send(response, 404, { code: 20404, message: "Unknown trunk route.", status: 404 });
    if (request.method === "POST") {
      const number = numberResource(form.PhoneNumberSid ?? "");
      number.trunk_sid = trunkSid;
      return send(response, 201, { sid: number.sid, trunk_sid: trunkSid, phone_number: number.phone_number });
    }
    if (phoneSid) numberResource(phoneSid).trunk_sid = null;
    send(response, 204);
  }

  function carrier(request: IncomingMessage, response: ServerResponse, host: string, path: string, raw: string): void {
    const form = Object.fromEntries(new URLSearchParams(raw));
    calls.push({ method: request.method ?? "GET", host, path, form });
    if (host === "api.twilio.com") return twilioApi(request, response, path, form);
    if (host === "trunking.twilio.com") return twilioTrunking(request, response, path, form);
    if (host === "pricing.twilio.com") return send(response, 200, { country: "Canada", iso_country: "CA", price_unit: "USD", phone_number_prices: [{ number_type: "local", base_price: "1.15", current_price: "1.15" }] });
    send(response, 404, { code: 20404, message: `The fake has no carrier ${host}.`, status: 404 });
  }

  function calendlyAuth(request: IncomingMessage, response: ServerResponse, url: URL, raw: string): void {
    if (url.pathname === "/calendly-auth/oauth/authorize") {
      const code = randomUUID();
      codes.set(code, { challenge: url.searchParams.get("code_challenge") ?? "" });
      calendly.authorizations.push({ scope: url.searchParams.get("scope") ?? "", clientId: url.searchParams.get("client_id") ?? "" });
      const back = new URL(url.searchParams.get("redirect_uri") ?? "");
      back.searchParams.set("code", code);
      back.searchParams.set("state", url.searchParams.get("state") ?? "");
      response.writeHead(302, { location: back.toString() });
      response.end();
      return;
    }
    if (url.pathname !== "/calendly-auth/oauth/token" || request.method !== "POST") return send(response, 404, { message: "Unknown auth route." });
    const form = new URLSearchParams(raw);
    const issue = () => { const access_token = randomUUID(); tokens.add(access_token); send(response, 200, { access_token, refresh_token: randomUUID(), expires_in: 7200, token_type: "Bearer" }); };
    if (form.get("grant_type") === "refresh_token") return issue();
    const grant = codes.get(form.get("code") ?? "");
    codes.delete(form.get("code") ?? "");
    const pkceMatched = Boolean(grant) && createHash("sha256").update(form.get("code_verifier") ?? "").digest("base64url") === grant?.challenge;
    calendly.tokenExchanges.push({ pkceMatched });
    if (!pkceMatched) return send(response, 400, { error: "invalid_grant" });
    issue();
  }

  function calendlyApi(request: IncomingMessage, response: ServerResponse, url: URL, raw: string): void {
    if (!tokens.has((request.headers.authorization ?? "").replace(/^Bearer /, ""))) return send(response, 401, { message: "Invalid token." });
    const path = url.pathname.replace(/^\/calendly-api/, "");
    if (path === "/users/me") return send(response, 200, { resource: { uri: CALENDLY_USER, current_organization: CALENDLY_ORGANIZATION, email: "owner@example.invalid", timezone: "UTC" } });
    if (path.startsWith("/organizations/")) return send(response, 200, { resource: calendly.plan === "free" ? { plan: "basic", stage: "free" } : { plan: "standard", stage: "paid" } });
    if (path === "/event_types") return send(response, 200, { collection: [eventType], pagination: {} });
    if (path === `/event_types/${CALENDLY_EVENT_TYPE.id}`) return send(response, 200, { resource: eventType });
    if (path === "/user_busy_times") return send(response, 200, { collection: [] });
    if (path === "/scheduled_events") {
      const email = url.searchParams.get("invitee_email");
      const rows = url.searchParams.get("status") === "canceled" ? [] : calendly.bookings.filter((booking) => booking.email === email);
      return send(response, 200, { collection: rows, pagination: {} });
    }
    const scheduled = /^\/scheduled_events\/([^/]+)$/.exec(path)?.[1];
    if (scheduled) {
      const booking = calendly.bookings.find((row) => row.uri.endsWith(`/${scheduled}`));
      return booking ? send(response, 200, { resource: booking }) : send(response, 404, { message: "No such event." });
    }
    if (path === "/invitees" && request.method === "POST") {
      if (calendly.bookingRefusal) return send(response, 400, { message: calendly.bookingRefusal });
      const body = JSON.parse(raw) as { start_time: string; event_type: string; invitee: { email: string } };
      const uri = `${CALENDLY_API}/scheduled_events/${randomUUID()}`;
      calendly.bookings.push({ uri, status: "active", start_time: body.start_time, end_time: new Date(Date.parse(body.start_time) + EVENT_TYPE_MINUTES * 60_000).toISOString(), event_type: body.event_type, email: body.invitee.email });
      return send(response, 201, { resource: { event: uri } });
    }
    if (path === "/webhook_subscriptions" && request.method === "GET") return send(response, 200, { collection: [], pagination: {} });
    if (path === "/webhook_subscriptions" && request.method === "POST") {
      const body = JSON.parse(raw) as { url: string; events: string[] };
      calendly.webhooks.push({ url: body.url, events: body.events });
      return send(response, 201, { resource: { uri: `${CALENDLY_API}/webhook_subscriptions/${randomUUID()}` } });
    }
    send(response, 404, { message: `The fake has no ${request.method} ${path}.` });
  }

  function firecrawlApi(request: IncomingMessage, response: ServerResponse, url: URL, raw: string): void {
    if (url.pathname === "/firecrawl/v1/crawl" && request.method === "POST") {
      const { url: site } = JSON.parse(raw) as { url: string };
      const status = firecrawl.rateLimitedStarts > 0 ? 429 : 200;
      firecrawl.starts.push({ url: site, status });
      if (status === 429) { firecrawl.rateLimitedStarts -= 1; return send(response, 429, { success: false, error: "Rate limit exceeded." }); }
      const id = randomUUID();
      crawls.set(id, site);
      return send(response, 200, { success: true, id });
    }
    const site = crawls.get(/^\/firecrawl\/v1\/crawl\/([^/]+)$/.exec(url.pathname)?.[1] ?? "");
    if (site && request.method === "GET") return send(response, 200, { status: "completed", data: [{ metadata: { sourceURL: site, title: "Harbour Plumbing", language: "en" }, markdown: "Harbour Plumbing fixes leaks and installs water heaters. We are open Monday to Friday, 8 to 6." }] });
    send(response, 404, { success: false, error: `The fake has no ${request.method} ${url.pathname}.` });
  }

  function embeddingsApi(response: ServerResponse, raw: string): void {
    const { input } = JSON.parse(raw) as { input: string | string[] };
    const inputs = Array.isArray(input) ? input : [input];
    send(response, 200, { object: "list", data: inputs.map((_, index) => ({ object: "embedding", index, embedding: Array.from({ length: 1536 }, (_, dimension) => dimension === index % 1536 ? 1 : 0.001) })), model: "text-embedding-3-small", usage: { prompt_tokens: inputs.length, total_tokens: inputs.length } });
  }

  // Polar's API as PolarBillingProvider calls it. A checkout's page is its success_url, as if the payer paid at once.
  function polarApi(request: IncomingMessage, response: ServerResponse, url: URL, raw: string): void {
    const path = url.pathname.replace(/^\/polar/, "");
    const body = raw ? JSON.parse(raw) as Record<string, unknown> : {};
    if (path === "/v1/checkouts/" && request.method === "POST") {
      polar.checkouts.push(body);
      return send(response, 201, { id: `checkout_${randomUUID()}`, url: body.success_url });
    }
    if (path === "/v1/events/ingest" && request.method === "POST") {
      polar.events.push(...((body.events as Array<Record<string, unknown>> | undefined) ?? []));
      return send(response, 200, { inserted: (body.events as unknown[] | undefined)?.length ?? 0 });
    }
    const subscription = /^\/v1\/subscriptions\/([^/]+)$/.exec(path);
    if (subscription && request.method === "PATCH") {
      polar.subscriptionChanges.push({ id: decodeURIComponent(subscription[1]!), body });
      return send(response, 200, { id: subscription[1], ...body });
    }
    send(response, 404, { error: "ResourceNotFound", detail: `The fake has no ${request.method} ${path}.` });
  }

  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", THIRD_PARTY_ORIGIN);
    const raw = await readBody(request);
    const routed = /^\/carrier\/([^/]+)(\/.*)$/.exec(request.url ?? "");
    if (routed) return carrier(request, response, routed[1]!, routed[2]!, raw);
    if (url.pathname.startsWith("/calendly-auth/")) return calendlyAuth(request, response, url, raw);
    if (url.pathname.startsWith("/calendly-api/")) return calendlyApi(request, response, url, raw);
    if (url.pathname.startsWith("/firecrawl/")) return firecrawlApi(request, response, url, raw);
    if (url.pathname.startsWith("/polar/")) return polarApi(request, response, url, raw);
    if (url.pathname === "/openai/v1/embeddings" && request.method === "POST") return embeddingsApi(response, raw);
    send(response, 404, { message: "Unknown third party." });
  });
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(THIRD_PARTY_PORT, "127.0.0.1", resolve); });

  return {
    carrier: {
      calls,
      offered,
      messagesTo: (to) => calls.filter((call) => call.path.endsWith("/Messages.json") && call.method === "POST" && call.form.To === to),
      addNumber: ({ sid, e164, trunkSid }) => { numberResource(sid, e164).trunk_sid = trunkSid ?? null; },
    },
    calendly,
    firecrawl,
    polar,
    close: async () => { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); },
  };
}
