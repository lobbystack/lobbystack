import { afterEach, describe, expect, it, vi } from "vitest";

import { createTelephony } from "../telephony/registry";
import { createTelnyxAlertSms, createTelnyxCarrier, telnyxLineType } from "./telnyxCarrier";
import { TelnyxClient } from "./telnyxClient";

type Call = { method: string; url: URL; body: unknown };

/** A fake Telnyx API: each route answers with a function of the request. */
function fakeTelnyx(routes: Record<string, (call: Call) => unknown>) {
  const calls: Call[] = [];
  const fetch = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = new URL(String(input));
    const call = { method: init?.method ?? "GET", url, body: init?.body ? JSON.parse(String(init.body)) : undefined };
    calls.push(call);
    const route = routes[`${call.method} ${decodeURIComponent(url.pathname).replace(/^\/v2/, "")}`];
    if (!route) return new Response(JSON.stringify({ errors: [{ code: "10005", title: "Resource not found" }] }), { status: 404 });
    const answer = route(call);
    return answer instanceof Response ? answer : new Response(JSON.stringify(answer), { status: 200 });
  });
  return { client: new TelnyxClient({ apiKey: "KEY", fetch: fetch as typeof globalThis.fetch }), calls };
}

const env = { TELNYX_API_KEY: "KEY", APP_BASE_URL: "https://app.example.test", TELNYX_SIP_CONNECTION_ID: "conn_1", OPENAI_PROJECT_ID: "proj_abc", TELNYX_TEXML_APPLICATION_ID: "texml_1", TELNYX_MESSAGING_PROFILE_ID: "mp_1" };

afterEach(() => vi.unstubAllEnvs());

describe("Telnyx numbers", () => {
  it("searches for numbers that take calls and maps their region", async () => {
    const { client, calls } = fakeTelnyx({ "GET /available_phone_numbers": () => ({ data: [
      { phone_number: "+12125550100", region_information: [{ region_type: "rate_center", region_name: "NEW YORK" }, { region_type: "state", region_name: "NY" }], features: [{ name: "voice" }, { name: "sms" }] },
      { phone_number: "+12125550101", features: [{ name: "sms" }] },
    ] }) });
    const inventory = createTelnyxCarrier(env, { client })!.inventory!;
    expect(await inventory.listAvailablePhoneNumbers({ countryCode: "us", kind: "local", areaCode: "212", city: "New York", regionCode: "NY", limit: 50 })).toEqual([{ phoneE164: "+12125550100", locality: "NEW YORK", region: "NY", countryCode: "US", capabilities: { sms: true, voice: true } }]);
    const query = calls[0]!.url.searchParams;
    expect(query.get("filter[country_code]")).toBe("US");
    expect(query.get("filter[phone_number_type]")).toBe("local");
    expect(query.getAll("filter[features][]")).toEqual(["voice"]);
    expect(query.get("filter[national_destination_code]")).toBe("212");
    expect(query.get("filter[administrative_area]")).toBe("NY");
    expect(query.get("filter[limit]")).toBe("20");
    expect(calls[0]!.url.origin).toBe("https://api.telnyx.com");
  });

  it("leaves out numbers whose digits Telnyx masks for an account it hasn't verified", async () => {
    const { client } = fakeTelnyx({ "GET /available_phone_numbers": () => ({ data: [
      { phone_number: "+14353------", features: [{ name: "voice" }, { name: "sms" }] },
      { phone_number: "+12125550100", features: [{ name: "voice" }] },
    ] }) });
    expect((await createTelnyxCarrier(env, { client })!.inventory!.listAvailablePhoneNumbers({ countryCode: "US", kind: "local", limit: 5 })).map((number) => number.phoneE164)).toEqual(["+12125550100"]);
  });

  it("prices a kind of number from what Telnyx offers, in US cents", async () => {
    const { client } = fakeTelnyx({ "GET /available_phone_numbers": () => ({ data: [{ phone_number: "+12125550100", cost_information: { monthly_cost: "1.00", currency: "USD" } }] }) });
    expect(await createTelnyxCarrier(env, { client })!.inventory!.getPhoneNumberMonthlyPrice({ countryCode: "US", kind: "local" })).toEqual({ monthlyCents: 100 });
    const euro = fakeTelnyx({ "GET /available_phone_numbers": () => ({ data: [{ phone_number: "+447700900123", cost_information: { monthly_cost: "2.00", currency: "EUR" } }] }) });
    await expect(createTelnyxCarrier(env, { client: euro.client })!.inventory!.getPhoneNumberMonthlyPrice({ countryCode: "GB", kind: "mobile" })).rejects.toThrow("not US dollars");
  });

  it("orders a number onto the SIP connection and messaging profile, waits for the order, then finds the number's id", async () => {
    let checks = 0;
    const { client, calls } = fakeTelnyx({
      "POST /number_orders": () => ({ data: { id: "ord_1", status: "pending" } }),
      "GET /number_orders/ord_1": () => ({ data: { id: "ord_1", status: ++checks < 2 ? "pending" : "success" } }),
      "GET /phone_numbers": () => ({ data: [{ id: "pn_other", phone_number: "+122125550100" }, { id: "pn_1", phone_number: "+12125550100" }] }),
    });
    const carrier = createTelnyxCarrier({ ...env, TELNYX_GB_REQUIREMENT_GROUP_ID: "rg_gb" }, { client, sleep: async () => undefined, orderPoll: { intervalMs: 0, attempts: 5 } })!;
    expect(await carrier.inventory!.purchasePhoneNumber({ e164: "+12125550100", countryCode: "US", kind: "local", label: "LobbyStack b1" })).toEqual({ providerPhoneId: "pn_1", e164: "+12125550100" });
    expect(calls[0]!.body).toEqual({ phone_numbers: [{ phone_number: "+12125550100" }], connection_id: "conn_1", messaging_profile_id: "mp_1", customer_reference: "LobbyStack b1" });
    expect(calls.at(-1)!.url.searchParams.get("filter[phone_number]")).toBe("12125550100");
    await carrier.inventory!.purchasePhoneNumber({ e164: "+447700900123", countryCode: "GB", kind: "mobile", label: "x" }).catch(() => undefined);
    expect(calls.find((call) => call.method === "POST" && (call.body as { phone_numbers: Array<{ requirement_group_id?: string }> }).phone_numbers[0]!.requirement_group_id === "rg_gb")).toBeDefined();
  });

  it("refuses to order without the country's requirement group, and reports a failed order as unavailable", async () => {
    const { client, calls } = fakeTelnyx({ "POST /number_orders": () => ({ data: { id: "ord_2", status: "failure", requirements_met: true, phone_numbers: [{ phone_number: "+12125550100", status: "failure", requirements_met: true }] } }) });
    const inventory = createTelnyxCarrier(env, { client })!.inventory!;
    await expect(inventory.purchasePhoneNumber({ e164: "+61491570006", countryCode: "AU", kind: "mobile", label: "x" })).rejects.toThrow("TELNYX_AU_REQUIREMENT_GROUP_ID is required");
    expect(calls).toHaveLength(0);
    const failure = await inventory.purchasePhoneNumber({ e164: "+12125550100", countryCode: "US", kind: "local", label: "x" }).catch((error: unknown) => error);
    expect(inventory.isNumberUnavailableError(failure)).toBe(true);
  });

  it("gives up waiting on an order still pending, so the claim can be checked", async () => {
    const { client } = fakeTelnyx({ "POST /number_orders": () => ({ data: { id: "ord_3", status: "pending" } }), "GET /number_orders/ord_3": () => ({ data: { id: "ord_3", status: "pending" } }) });
    const inventory = createTelnyxCarrier(env, { client, sleep: async () => undefined, orderPoll: { intervalMs: 0, attempts: 2 } })!.inventory!;
    await expect(inventory.purchasePhoneNumber({ e164: "+12125550100", countryCode: "US", kind: "local", label: "x" })).rejects.toMatchObject({ name: "NumberOrderPendingError", orderId: "ord_3" });
  });

  it("checks a pending order again instead of placing another", async () => {
    const { client, calls } = fakeTelnyx({
      "GET /number_orders/ord_3": () => ({ data: { id: "ord_3", status: "success" } }),
      "GET /phone_numbers": () => ({ data: [{ id: "pn_3", phone_number: "+447700900123" }] }),
    });
    const inventory = createTelnyxCarrier(env, { client, sleep: async () => undefined })!.inventory!;
    expect(await inventory.purchasePhoneNumber({ e164: "+447700900123", countryCode: "GB", kind: "local", label: "x", pendingOrderId: "ord_3" })).toEqual({ providerPhoneId: "pn_3", e164: "+447700900123" });
    expect(calls.some((call) => call.method === "POST")).toBe(false);
  });

  it("keeps the status of an error whose body isn't JSON", async () => {
    const fetch = vi.fn(async () => new Response("<html>Bad Gateway</html>", { status: 502 }));
    const html = new TelnyxClient({ apiKey: "KEY", fetch: fetch as typeof globalThis.fetch });
    await expect(createTelnyxCarrier(env, { client: html })!.inventory!.releasePhoneNumber({ providerPhoneId: "pn_1" })).rejects.toMatchObject({ name: "TelnyxApiError", status: 502 });
    const notFound = new TelnyxClient({ apiKey: "KEY", fetch: (async () => new Response("Not Found", { status: 404 })) as typeof globalThis.fetch });
    await expect(createTelnyxCarrier(env, { client: notFound })!.inventory!.releasePhoneNumber({ providerPhoneId: "pn_gone" })).rejects.toMatchObject({ status: 404 });
  });

  it("answers a release of a number Telnyx no longer has with a 404", async () => {
    const { client } = fakeTelnyx({});
    await expect(createTelnyxCarrier(env, { client })!.inventory!.releasePhoneNumber({ providerPhoneId: "pn_gone" })).rejects.toMatchObject({ status: 404 });
  });
});

describe("Telnyx routing", () => {
  it("puts a number on the SIP connection with the project as its translated number and a forward for refused calls", async () => {
    const { client, calls } = fakeTelnyx({ "PATCH /phone_numbers/pn_1": () => ({ data: {} }), "PATCH /phone_numbers/pn_1/voice": () => ({ data: {} }) });
    const routing = createTelnyxCarrier(env, { client })!.routing!;
    expect(routing.forwardsRefusedCalls).toBe(true);
    expect(await routing.routeNumber({ providerPhoneId: "pn_1", mode: "receptionist", refusedCallsForwardTo: "+14165550134" })).toEqual({ target: "sip-connection:conn_1" });
    expect(calls.map((call) => [call.url.pathname, call.body])).toEqual([
      ["/v2/phone_numbers/pn_1", { connection_id: "conn_1" }],
      ["/v2/phone_numbers/pn_1/voice", { translated_number: "proj_abc", call_forwarding: { call_forwarding_enabled: true, forwards_to: "+14165550134", forwarding_type: "on-failure" } }],
    ]);
  });

  it("moves a number to the TeXML application for the fallback, with forwarding off first", async () => {
    const { client, calls } = fakeTelnyx({ "PATCH /phone_numbers/pn_1": () => ({ data: {} }), "PATCH /phone_numbers/pn_1/voice": () => ({ data: {} }) });
    expect(await createTelnyxCarrier(env, { client })!.routing!.routeNumber({ providerPhoneId: "pn_1", mode: "fallback" })).toEqual({ target: "https://app.example.test/api/webhooks/telnyx/voice" });
    expect(calls.map((call) => [call.url.pathname, call.body])).toEqual([
      ["/v2/phone_numbers/pn_1/voice", { translated_number: "", call_forwarding: { call_forwarding_enabled: false } }],
      ["/v2/phone_numbers/pn_1", { connection_id: "texml_1" }],
    ]);
  });

  it("says what's missing before a number can reach GPT-Live", () => {
    expect(createTelnyxCarrier({ TELNYX_API_KEY: "KEY" })!.routing!.missingSetup()).toMatch(/TELNYX_SIP_CONNECTION_ID/);
    expect(createTelnyxCarrier({ TELNYX_API_KEY: "KEY", TELNYX_SIP_CONNECTION_ID: "conn_1" })!.routing!.missingSetup()).toMatch(/OPENAI_PROJECT_ID/);
    expect(createTelnyxCarrier(env)!.routing!.missingSetup()).toBeUndefined();
  });
});

describe("Telnyx texts, Verify, Lookup and call cost", () => {
  it("sends a text with its status webhook and reads its price later", async () => {
    const { client, calls } = fakeTelnyx({
      "POST /messages": () => ({ data: { id: "msg_1" } }),
      "GET /messages/msg_1": () => ({ data: { id: "msg_1", parts: 1, cost: { amount: "0.004", currency: "USD" } } }),
    });
    const sms = createTelnyxCarrier(env, { client })!.sms!;
    const statusCallback = sms.statusCallbackUrl({ messageId: "m1" });
    expect(statusCallback).toBe("https://app.example.test/api/webhooks/telnyx/status?messageId=m1");
    expect(await sms.sendSms({ to: "+14165550134", from: "+12125550100", body: "Hi", ...(statusCallback ? { statusCallback } : {}) })).toEqual({ providerMessageId: "msg_1" });
    expect(calls[0]!.body).toEqual({ from: "+12125550100", to: "+14165550134", text: "Hi", webhook_url: statusCallback });
    expect(await sms.getMessagePricing({ providerMessageId: "msg_1" })).toEqual({ providerPrice: 0.004, providerPriceUnit: "usd", providerCostUsd: 0.004, providerNumSegments: 1 });
  });

  it("verifies a phone with the verify profile", async () => {
    const { client, calls } = fakeTelnyx({
      "POST /verifications/sms": () => ({ data: { id: "ver_1", status: "pending" } }),
      "POST /verifications/by_phone_number/+14165550134/actions/verify": (call) => ({ data: { phone_number: "+14165550134", response_code: (call.body as { code: string }).code === "12345" ? "accepted" : "rejected" } }),
    });
    expect(createTelnyxCarrier(env, { client })!.verifier).toBeUndefined();
    const verifier = createTelnyxCarrier({ ...env, TELNYX_VERIFY_PROFILE_ID: "vp_1" }, { client })!.verifier!;
    expect(await verifier.sendCode({ to: "+14165550134", locale: "fr" })).toEqual({ sid: "ver_1" });
    expect(calls[0]!.body).toEqual({ phone_number: "+14165550134", verify_profile_id: "vp_1" });
    expect(await verifier.checkCode({ to: "+14165550134", code: "12345" })).toBe("approved");
    expect(await verifier.checkCode({ to: "+14165550134", code: "00000" })).toBe("pending");
    expect(calls[1]!.url.pathname).toBe("/v2/verifications/by_phone_number/%2B14165550134/actions/verify");
  });

  it("maps Number Lookup's carrier type to the line types the phone step checks", async () => {
    const { client, calls } = fakeTelnyx({ "GET /number_lookup/+14165550134": () => ({ data: { carrier: { type: "voip" } } }) });
    expect(await createTelnyxCarrier(env, { client })!.lineTypes!.lookupLineType("+14165550134")).toBe("nonFixedVoip");
    expect(calls[0]!.url.searchParams.get("type")).toBe("carrier");
    expect(["mobile", "fixed line", "fixed line or mobile", "toll free", "personal number", "satellite"].map(telnyxLineType)).toEqual(["mobile", "landline", "unknown", "tollFree", "personal", null]);
  });

  it("pages back through a busy account's records until they start before the call", async () => {
    const near = new Date("2026-10-29T12:00:00Z");
    const later = (index: number) => ({ id: `cdr_later_${index}`, started_at: new Date(near.getTime() + 600_000 - index * 1_000).toISOString(), cost: "0.5", currency: "USD", cli: "15145550000", connection_id: "conn_1" });
    const { client, calls } = fakeTelnyx({ "GET /detail_records": (call) => {
      const page = Number(call.url.searchParams.get("page[number]"));
      if (page === 1) return { data: Array.from({ length: 50 }, (_, index) => later(index)) };
      if (page === 2) return { data: [{ id: "cdr_1", started_at: "2026-10-29T12:00:02Z", cost: "0.01", currency: "USD", cli: "14165550134", connection_id: "conn_1" }, { id: "cdr_old", started_at: "2026-10-29T11:00:00Z", cost: "0.5", currency: "USD", cli: "14165550134", connection_id: "conn_1" }] };
      throw new Error("read past the call's window");
    } });
    expect(await createTelnyxCarrier(env, { client })!.callCost!.findLiveCallCost!({ from: "+14165550134", near })).toMatchObject({ providerCallId: "cdr_1" });
    expect(calls).toHaveLength(2);
  });

  it("prices a GPT-Live call from the closest SIP trunking record for the caller on our connection", async () => {
    const near = new Date("2026-10-29T12:00:00Z");
    const { client } = fakeTelnyx({ "GET /detail_records": () => ({ data: [
      { id: "cdr_other_connection", started_at: "2026-10-29T12:00:01Z", cost: "0.5", currency: "USD", cli: "14165550134", connection_id: "conn_9" },
      { id: "cdr_far", started_at: "2026-10-29T11:50:00Z", cost: "0.5", currency: "USD", cli: "14165550134", connection_id: "conn_1" },
      { id: "cdr_1", started_at: "2026-10-29T12:00:02Z", cost: "0.0123", currency: "USD", cli: "14165550134", connection_id: "conn_1" },
    ] }) });
    expect(await createTelnyxCarrier(env, { client })!.callCost!.findLiveCallCost!({ from: "+14165550134", near })).toEqual({ providerCallId: "cdr_1", providerPrice: 0.0123, providerPriceUnit: "usd", providerCostUsd: 0.0123 });
  });

  it("sends the shared sender's texts only from the shared sender", async () => {
    const { client } = fakeTelnyx({ "POST /messages": () => ({ data: { id: "msg_2" } }) });
    const alert = createTelnyxAlertSms({ ...env, TELEPHONY_ALERT_SMS_FROM: "+18885550100" }, client)!;
    expect(await alert.sendSms({ to: "+14165550134", from: "+18885550100", body: "x" })).toEqual({ providerMessageId: "msg_2" });
    expect(() => alert.sendSms({ to: "+14165550134", from: "+12125550100", body: "x" })).toThrow("cannot use another number");
  });

  it("routes a mixed deployment: Telnyx for US numbers and Verify, Twilio for the rest", () => {
    const telephony = createTelephony({ ...env, TWILIO_ACCOUNT_SID: "AC1", TWILIO_AUTH_TOKEN: "t", TELNYX_VERIFY_PROFILE_ID: "vp_1", TELEPHONY_NUMBERS: "US:telnyx,*:twilio", TELEPHONY_VERIFY: "telnyx" });
    expect(telephony.numbersCarrier("US")).toBe("telnyx");
    expect(telephony.numbersCarrier("CA")).toBe("twilio");
    expect(telephony.verifier?.carrier).toBe("telnyx");
    expect(telephony.lineTypes?.carrier).toBe("twilio");
    expect(telephony.forNumber("telnyx")?.sms?.carrier).toBe("telnyx");
  });
});
