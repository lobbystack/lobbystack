import { describe, expect, it, vi } from "vitest";

import { createTelephony } from "../telephony/registry";
import { NumberCarrierUnavailableError, NumberOrderPendingError } from "../telephony/types";
import { zadarmaRegistration } from "./registration";
import { createZadarmaCarrier, ZADARMA_ORDER_MAX_WAIT_MS, ZadarmaNumberOrderError } from "./zadarmaCarrier";
import { ZadarmaApiError, ZadarmaClient } from "./zadarmaClient";

type Call = { method: string; path: string; params: URLSearchParams };

/** A fake Zadarma API: each route answers with a function of the request, keyed like `GET /v1/direct_numbers/`. */
function fakeZadarma(routes: Record<string, (call: Call) => unknown>) {
  const calls: Call[] = [];
  const fetch = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const call = { method, path: url.pathname, params: method === "GET" ? url.searchParams : new URLSearchParams(String(init?.body ?? "")) };
    calls.push(call);
    const route = routes[`${method} ${url.pathname}`];
    if (!route) return new Response(JSON.stringify({ status: "error", message: "Unknown method" }), { status: 404 });
    return new Response(JSON.stringify(route(call)), { status: 200 });
  });
  return { client: new ZadarmaClient({ key: "KEY", secret: "SECRET", fetch: fetch as typeof globalThis.fetch }), calls };
}

const env = { ZADARMA_API_KEY: "KEY", ZADARMA_API_SECRET: "SECRET", ZADARMA_DOCUMENTS_GROUP_ID: "5", ZADARMA_SIP_HOST: "sip.example.com:5060" };

// As Zadarma answers for Serbia: ids are numbers, and is_toll is "true" for every destination, landline ones included.
const directions = { status: "success", info: [
  { id: 100, countryCode: "381", areaCode: "11", name: "Belgrade", monthly_fee: 8, currency: "USD", receive_sms: "false", is_toll: "true" },
  { id: 101, countryCode: "381", areaCode: "21", name: "Novi Sad", monthly_fee: 8, currency: "USD", receive_sms: "false", is_toll: "true" },
  { id: 102, countryCode: "381", areaCode: "800", name: "Toll-free", monthly_fee: 26, currency: "USD", receive_sms: "true", is_toll: "true" },
] };
const belgrade = { numbers: [{ id: "n1", direction_id: "100", number: "381111234567" }, { id: "n2", direction_id: "100", number: "381111234568" }] };
const noviSad = { numbers: [{ id: "n3", direction_id: "101", number: "381211234567" }] };
const catalog = {
  "GET /v1/direct_numbers/country/": () => directions,
  "GET /v1/direct_numbers/": () => ({ status: "success", info: [] }),
  "GET /v1/direct_numbers/available/100/": () => belgrade,
  "GET /v1/direct_numbers/available/101/": () => noviSad,
  "GET /v1/direct_numbers/available/102/": () => ({ numbers: [{ id: "n4", direction_id: "102", number: "0800123456" }] }),
};
const owning = (status: string, extra: Record<string, unknown> = {}) => ({ "GET /v1/direct_numbers/": () => ({ status: "success", info: [{ number: "381211234567", status, ...extra }] }) });
/** An account that lists the number only once the order is placed, as Zadarma does. */
function afterOrder(status: () => string, reply: Record<string, unknown> = { status: "success" }) {
  let ordered = false;
  return {
    "POST /v1/direct_numbers/order/": () => { ordered = true; return reply; },
    "GET /v1/direct_numbers/": () => ({ status: "success", info: ordered ? [{ number: "381211234567", status: status() }] : [] }),
  };
}

describe("Zadarma numbers", () => {
  it("is built only with credentials, and offers no texts, Verify or Lookup", () => {
    expect(createZadarmaCarrier({})).toBeUndefined();
    const carrier = createZadarmaCarrier(env)!;
    expect(carrier.inventory?.carrier).toBe("zadarma");
    expect(carrier.sms).toBeUndefined();
    expect(carrier.verifier).toBeUndefined();
    expect(carrier.lineTypes).toBeUndefined();
    expect(carrier.callCost).toBeUndefined();
  });

  it("searches a country's landline destinations, in order, until the limit", async () => {
    const { client, calls } = fakeZadarma(catalog);
    const inventory = createZadarmaCarrier(env, { client })!.inventory!;
    expect(await inventory.listAvailablePhoneNumbers({ countryCode: "rs", kind: "local", limit: 3 })).toEqual([
      { phoneE164: "+381111234567", locality: "Belgrade", countryCode: "RS", capabilities: { sms: false, voice: true } },
      { phoneE164: "+381111234568", locality: "Belgrade", countryCode: "RS", capabilities: { sms: false, voice: true } },
      { phoneE164: "+381211234567", locality: "Novi Sad", countryCode: "RS", capabilities: { sms: false, voice: true } },
    ]);
    expect(calls[0]!.params.get("country")).toBe("RS");
    // It stopped at the limit, and never asked about the toll-free destination.
    expect(calls.map((call) => call.path)).not.toContain("/v1/direct_numbers/available/102/");
  });

  it("tells toll-free destinations from landline ones by name, though Zadarma marks both as toll", async () => {
    const { client } = fakeZadarma(catalog);
    const inventory = createZadarmaCarrier(env, { client })!.inventory!;
    expect((await inventory.listAvailablePhoneNumbers({ countryCode: "RS", kind: "local", limit: 10 })).map((number) => number.locality)).toEqual(["Belgrade", "Belgrade", "Novi Sad"]);
    // A toll-free number is listed in national form, 0800123456, and comes out as +381800123456.
    expect((await inventory.listAvailablePhoneNumbers({ countryCode: "RS", kind: "toll_free", limit: 10 })).map((number) => number.phoneE164)).toEqual(["+381800123456"]);
  });

  it("narrows a search by kind, city and area code, and by texting", async () => {
    const { client, calls } = fakeZadarma(catalog);
    const inventory = createZadarmaCarrier(env, { client })!.inventory!;
    expect((await inventory.listAvailablePhoneNumbers({ countryCode: "RS", kind: "toll_free", limit: 5 })).map((number) => number.phoneE164)).toEqual(["+381800123456"]);
    expect((await inventory.listAvailablePhoneNumbers({ countryCode: "RS", kind: "local", city: "novi", limit: 5 })).map((number) => number.locality)).toEqual(["Novi Sad"]);
    expect((await inventory.listAvailablePhoneNumbers({ countryCode: "RS", kind: "local", areaCode: "021", limit: 5 })).map((number) => number.locality)).toEqual(["Novi Sad"]);
    // Only the toll-free destination takes texts here.
    expect(await inventory.listAvailablePhoneNumbers({ countryCode: "RS", kind: "local", sms: true, limit: 5 })).toEqual([]);
    const before = calls.length;
    expect(await inventory.listAvailablePhoneNumbers({ countryCode: "RS", kind: "mobile", limit: 5 })).toEqual([]);
    expect(calls).toHaveLength(before);
  });

  it("prices a number from its destination, in US dollars only", async () => {
    const { client } = fakeZadarma(catalog);
    const inventory = createZadarmaCarrier(env, { client })!.inventory!;
    expect(await inventory.getPhoneNumberMonthlyPrice({ countryCode: "RS", kind: "local" })).toEqual({ monthlyCents: 800 });
    expect(await inventory.getPhoneNumberMonthlyPrice({ countryCode: "RS", kind: "toll_free" })).toEqual({ monthlyCents: 2600 });
    const euros = fakeZadarma({ "GET /v1/direct_numbers/country/": () => ({ info: [{ id: "100", name: "Belgrade", monthly_fee: 7, currency: "EUR", is_toll: false }] }) });
    await expect(createZadarmaCarrier(env, { client: euros.client })!.inventory!.getPhoneNumberMonthlyPrice({ countryCode: "RS", kind: "local" })).rejects.toThrow("in EUR, not US dollars");
  });

  it("finds a number the account owns", async () => {
    const { client } = fakeZadarma(owning("on"));
    const inventory = createZadarmaCarrier(env, { client })!.inventory!;
    expect(await inventory.findOwnedPhoneNumber({ e164: "+381211234567" })).toEqual({ providerPhoneId: "381211234567", e164: "+381211234567" });
    expect(await inventory.findOwnedPhoneNumber({ e164: "+381211234500" })).toBeNull();
  });

  it("doesn't count a number still in Zadarma's review as one the account has for use, unless asked", async () => {
    const inventory = createZadarmaCarrier(env, { client: fakeZadarma(owning("checking")).client })!.inventory!;
    expect(await inventory.findOwnedPhoneNumber({ e164: "+381211234567" })).toBeNull();
    expect(await inventory.findOwnedPhoneNumber({ e164: "+381211234567", includePending: true })).toEqual({ providerPhoneId: "381211234567", e164: "+381211234567" });
  });
});

describe("ordering a Zadarma number", () => {
  it("orders by Zadarma's own number and destination ids, under the documents group, and returns an active number", async () => {
    const { client, calls } = fakeZadarma({ ...catalog, ...afterOrder(() => "on", { status: "success", is_activated: "true" }) });
    const inventory = createZadarmaCarrier(env, { client })!.inventory!;
    expect(await inventory.purchasePhoneNumber({ e164: "+381211234567", countryCode: "RS", kind: "local", label: "LobbyStack business" })).toEqual({ providerPhoneId: "381211234567", e164: "+381211234567" });
    const order = calls.find((call) => call.path === "/v1/direct_numbers/order/")!;
    expect(Object.fromEntries(order.params)).toEqual({ number_id: "n3", direction_id: "101", documents_group_id: "5", purpose: "Answering incoming business calls with an AI voice receptionist.", format: "json" });
  });

  it("states its own purpose when the deployment sets one", async () => {
    const { client, calls } = fakeZadarma({ ...catalog, ...afterOrder(() => "on") });
    await createZadarmaCarrier({ ...env, ZADARMA_NUMBER_PURPOSE: "Clinic reception" }, { client })!.inventory!.purchasePhoneNumber({ e164: "+381211234567", countryCode: "RS", kind: "local", label: "x" });
    expect(calls.find((call) => call.path === "/v1/direct_numbers/order/")!.params.get("purpose")).toBe("Clinic reception");
  });

  it("stays pending while Zadarma checks the documents, then checks the same number again", async () => {
    let status = "checking";
    const { client, calls } = fakeZadarma({ ...catalog, ...afterOrder(() => status, { status: "success", is_activated: "false" }) });
    const inventory = createZadarmaCarrier(env, { client })!.inventory!;
    const pending = await inventory.purchasePhoneNumber({ e164: "+381211234567", countryCode: "RS", kind: "local", label: "x" }).catch((error: unknown) => error);
    expect(pending).toBeInstanceOf(NumberOrderPendingError);
    expect((pending as NumberOrderPendingError).orderId).toBe("381211234567");

    // The next attempt asks about the number, and never orders again.
    const orders = calls.filter((call) => call.path === "/v1/direct_numbers/order/").length;
    await expect(inventory.purchasePhoneNumber({ e164: "+381211234567", countryCode: "RS", kind: "local", label: "x", pendingOrderId: "381211234567" })).rejects.toBeInstanceOf(NumberOrderPendingError);
    status = "on";
    expect(await inventory.purchasePhoneNumber({ e164: "+381211234567", countryCode: "RS", kind: "local", label: "x", pendingOrderId: "381211234567" })).toEqual({ providerPhoneId: "381211234567", e164: "+381211234567" });
    expect(calls.filter((call) => call.path === "/v1/direct_numbers/order/")).toHaveLength(orders);
  });

  it("waits on an order for payment or documents too, and fails one disabled for non-payment or gone", async () => {
    const attempt = (statuses: Record<string, (call: Call) => unknown>) => createZadarmaCarrier(env, { client: fakeZadarma(statuses).client })!.inventory!.purchasePhoneNumber({ e164: "+381211234567", countryCode: "RS", kind: "local", label: "x", pendingOrderId: "381211234567" });
    for (const status of ["checking_upload", "reserved_on", "reserved_checking", "reserved_checking_upload"]) await expect(attempt(owning(status))).rejects.toBeInstanceOf(NumberOrderPendingError);
    await expect(attempt(owning("parking"))).rejects.toMatchObject({ name: "ZadarmaNumberOrderError", unavailable: false, message: expect.stringContaining("non-payment") });
    await expect(attempt({ "GET /v1/direct_numbers/": () => ({ info: [] }) })).rejects.toMatchObject({ name: "ZadarmaNumberOrderError", unavailable: false });
  });

  it("waits when the number isn't listed right after the order", async () => {
    const { client } = fakeZadarma({ ...catalog, "POST /v1/direct_numbers/order/": () => ({ status: "success" }), "GET /v1/direct_numbers/": () => ({ info: [] }) });
    await expect(createZadarmaCarrier(env, { client })!.inventory!.purchasePhoneNumber({ e164: "+381211234567", countryCode: "RS", kind: "local", label: "x" })).rejects.toBeInstanceOf(NumberOrderPendingError);
  });

  it("refuses a number Zadarma no longer sells without ordering anything, and says it is unavailable", async () => {
    const { client, calls } = fakeZadarma(catalog);
    const inventory = createZadarmaCarrier(env, { client })!.inventory!;
    const error = await inventory.purchasePhoneNumber({ e164: "+381219999999", countryCode: "RS", kind: "local", label: "x" }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ZadarmaNumberOrderError);
    expect(inventory.isNumberUnavailableError(error)).toBe(true);
    expect(inventory.isNumberUnavailableError(new Error("boom"))).toBe(false);
    expect(calls.some((call) => call.method === "POST")).toBe(false);
  });

  it("refuses to order without the documents group or the SIP server, naming what is missing", async () => {
    const order = (settings: Record<string, string>) => createZadarmaCarrier(settings, { client: fakeZadarma(catalog).client })!.inventory!.purchasePhoneNumber({ e164: "+381211234567", countryCode: "RS", kind: "local", label: "x" });
    await expect(order({ ...env, ZADARMA_DOCUMENTS_GROUP_ID: "" })).rejects.toThrow("ZADARMA_DOCUMENTS_GROUP_ID is required");
    await expect(order({ ...env, ZADARMA_SIP_HOST: "" })).rejects.toThrow("ZADARMA_SIP_HOST is required");
  });

  it("waits a month for an order, longer than the worker's default", () => {
    expect(createZadarmaCarrier(env)!.inventory!.orderMaxWaitMs).toBe(ZADARMA_ORDER_MAX_WAIT_MS);
    expect(ZADARMA_ORDER_MAX_WAIT_MS).toBe(30 * 86_400_000);
  });

  it("asks for the documents group in every country", () => {
    expect(zadarmaRegistration("RS", {})).toEqual({ missing: ["ZADARMA_DOCUMENTS_GROUP_ID"] });
    expect(zadarmaRegistration("RS", { ZADARMA_DOCUMENTS_GROUP_ID: " 5 " })).toEqual({ missing: [] });
  });
});

describe("ordering a Zadarma number by city", () => {
  const orderReply = { status: "success", number: "381211234567", is_reserved: "false", is_activated: "false" };

  it("orders in the matching destination without choosing a number, and returns the number Zadarma assigned", async () => {
    const { client, calls } = fakeZadarma({ ...catalog, "POST /v1/direct_numbers/order/": () => orderReply });
    const inventory = createZadarmaCarrier(env, { client })!.inventory!;
    expect(await inventory.orderAssignedPhoneNumber!({ countryCode: "RS", kind: "local", city: "Novi Sad", label: "x" })).toEqual({ providerPhoneId: "381211234567", e164: "+381211234567" });
    const order = calls.find((call) => call.path === "/v1/direct_numbers/order/")!;
    expect(Object.fromEntries(order.params)).toEqual({ direction_id: "101", documents_group_id: "5", purpose: "Answering incoming business calls with an AI voice receptionist.", format: "json" });
    expect(calls.filter((call) => call.method === "POST")).toHaveLength(1);
  });

  it("lists the cities that take an order, by Zadarma's names, apart from toll-free", async () => {
    const inventory = createZadarmaCarrier(env, { client: fakeZadarma(catalog).client })!.inventory!;
    expect(await inventory.listOrderCities!({ countryCode: "RS", kind: "local" })).toEqual(["Belgrade", "Novi Sad"]);
    expect(await inventory.listOrderCities!({ countryCode: "RS", kind: "toll_free" })).toEqual(["Toll-free"]);
  });

  it("lists live numbers the account holds in the city's area code, apart from ones in review or in other cities", async () => {
    const held = { "GET /v1/direct_numbers/": () => ({ status: "success", info: [
      { number: "381213860081", status: "on" },
      { number: "381213860082", status: "checking" },
      { number: "381111234567", status: "on" },
    ] }) };
    const inventory = createZadarmaCarrier(env, { client: fakeZadarma({ ...catalog, ...held }).client })!.inventory!;
    expect(await inventory.listReusablePhoneNumbers!({ countryCode: "RS", kind: "local", city: "Novi Sad" })).toEqual([{ providerPhoneId: "381213860081", e164: "+381213860081" }]);
    expect(await inventory.listReusablePhoneNumbers!({ countryCode: "RS", kind: "local", city: "Belgrade" })).toEqual([{ providerPhoneId: "381111234567", e164: "+381111234567" }]);
    expect(await inventory.listReusablePhoneNumbers!({ countryCode: "RS", kind: "local", city: "Subotica" })).toEqual([]);
  });

  it("turns a reused number's renewal back on, since a release turned it off", async () => {
    const { client, calls } = fakeZadarma({ "PUT /v1/direct_numbers/autoprolongation/": () => ({ status: "success" }) });
    await createZadarmaCarrier(env, { client })!.inventory!.takeReusablePhoneNumber!({ providerPhoneId: "381213860081" });
    expect(Object.fromEntries(calls[0]!.params)).toMatchObject({ number: "381213860081", value: "on" });
  });

  it("reads a number Zadarma writes in national form", async () => {
    const { client } = fakeZadarma({ ...catalog, "POST /v1/direct_numbers/order/": () => ({ ...orderReply, number: "0211234567" }) });
    expect((await createZadarmaCarrier(env, { client })!.inventory!.orderAssignedPhoneNumber!({ countryCode: "RS", kind: "local", city: "Novi Sad", label: "x" })).e164).toBe("+381211234567");
  });

  it("orders nothing for a city Zadarma doesn't sell in, and says it is unavailable", async () => {
    const { client, calls } = fakeZadarma(catalog);
    const inventory = createZadarmaCarrier(env, { client })!.inventory!;
    const error = await inventory.orderAssignedPhoneNumber!({ countryCode: "RS", kind: "local", city: "Subotica", label: "x" }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ZadarmaNumberOrderError);
    expect(inventory.isNumberUnavailableError(error)).toBe(true);
    expect(calls.some((call) => call.method === "POST")).toBe(false);
  });

  it("fails loudly when Zadarma takes the order but names no number", async () => {
    const { client } = fakeZadarma({ ...catalog, "POST /v1/direct_numbers/order/": () => ({ status: "success" }) });
    await expect(createZadarmaCarrier(env, { client })!.inventory!.orderAssignedPhoneNumber!({ countryCode: "RS", kind: "local", city: "Belgrade", label: "x" })).rejects.toMatchObject({ name: "ZadarmaNumberOrderError", unavailable: false, message: expect.stringContaining("named no number") });
  });

  it("refuses to order without the documents group or the SIP server", async () => {
    const order = (settings: Record<string, string>) => createZadarmaCarrier(settings, { client: fakeZadarma(catalog).client })!.inventory!.orderAssignedPhoneNumber!({ countryCode: "RS", kind: "local", city: "Belgrade", label: "x" });
    await expect(order({ ...env, ZADARMA_DOCUMENTS_GROUP_ID: "" })).rejects.toThrow("ZADARMA_DOCUMENTS_GROUP_ID is required");
    await expect(order({ ...env, ZADARMA_SIP_HOST: "" })).rejects.toThrow("ZADARMA_SIP_HOST is required");
  });

  it("checks a number it already ordered instead of ordering it again when the claim buys it", async () => {
    const { client, calls } = fakeZadarma({ ...catalog, ...owning("checking") });
    await expect(createZadarmaCarrier(env, { client })!.inventory!.purchasePhoneNumber({ e164: "+381211234567", countryCode: "RS", kind: "local", label: "x" })).rejects.toBeInstanceOf(NumberOrderPendingError);
    expect(calls.some((call) => call.method === "POST")).toBe(false);
  });
});

describe("what a failed request shows an owner", () => {
  const rejectedWith = async (work: Promise<unknown>) => await work.then(() => { throw new Error("expected a rejection"); }, (error: unknown) => error);

  it("turns Zadarma's refusal of an order into an error that names no carrier and says nothing about why", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    // The fake answers 200 with an error body, so make the order itself fail as Zadarma does, with a 400.
    const fetch = vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input));
      if (url.pathname === "/v1/direct_numbers/country/") return new Response(JSON.stringify(directions), { status: 200 });
      return new Response(JSON.stringify({ status: "error", message: "You do not have sufficient funds on your account." }), { status: 400 });
    });
    const inventory = createZadarmaCarrier(env, { client: new ZadarmaClient({ key: "KEY", secret: "SECRET", fetch: fetch as typeof globalThis.fetch }) })!.inventory!;
    const error = await rejectedWith(inventory.orderAssignedPhoneNumber!({ countryCode: "RS", kind: "local", city: "Novi Sad", label: "x" })) as Error & { status: number; code: string };
    expect(error).toBeInstanceOf(NumberCarrierUnavailableError);
    expect(error).toMatchObject({ status: 503, code: "number_carrier_unavailable", message: "We can't set up a number right now. Please try again later." });
    expect(error.message).not.toMatch(/zadarma|funds|direct_numbers|400/i);
    // The reason is kept for whoever runs the deployment.
    expect(error.cause).toBeInstanceOf(ZadarmaApiError);
    expect(logged).toHaveBeenCalledWith(expect.stringContaining("sufficient funds"));
    expect(JSON.parse(String(logged.mock.calls[0]![0]))).toMatchObject({ event: "ops.numbers.carrier_refused", carrier: "zadarma", operation: "orderAssignedPhoneNumber", status: 400 });
    logged.mockRestore();
  });

  it("does the same for the calls that list cities, numbers to reuse and what a search finds", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const failing = new ZadarmaClient({ key: "KEY", secret: "SECRET", fetch: (async () => new Response(JSON.stringify({ status: "error", message: "Wrong signature" }), { status: 401 })) as typeof globalThis.fetch });
    const inventory = createZadarmaCarrier(env, { client: failing })!.inventory!;
    for (const call of [
      () => inventory.listOrderCities!({ countryCode: "RS", kind: "local" }),
      () => inventory.listReusablePhoneNumbers!({ countryCode: "RS", kind: "local", city: "Novi Sad" }),
      () => inventory.takeReusablePhoneNumber!({ providerPhoneId: "381213860081" }),
      () => inventory.listAvailablePhoneNumbers({ countryCode: "RS", kind: "local", limit: 3 }),
    ]) expect(await rejectedWith(call())).toBeInstanceOf(NumberCarrierUnavailableError);
    logged.mockRestore();
  });

  it("keeps the real error for the worker's own calls, which no owner sees", async () => {
    const failing = new ZadarmaClient({ key: "KEY", secret: "SECRET", fetch: (async () => new Response(JSON.stringify({ status: "error", message: "boom" }), { status: 400 })) as typeof globalThis.fetch });
    const inventory = createZadarmaCarrier(env, { client: failing })!.inventory!;
    expect(await rejectedWith(inventory.releasePhoneNumber({ providerPhoneId: "381213860081" }))).toBeInstanceOf(ZadarmaApiError);
  });
});

describe("releasing and routing a Zadarma number", () => {
  it("turns off a number's auto-renewal, since Zadarma has no cancel", async () => {
    const { client, calls } = fakeZadarma({ ...owning("on"), "PUT /v1/direct_numbers/autoprolongation/": () => ({ status: "success", autoprolongation: "off" }) });
    await createZadarmaCarrier(env, { client })!.inventory!.releasePhoneNumber({ providerPhoneId: "381211234567" });
    const put = calls.find((call) => call.method === "PUT")!;
    expect(Object.fromEntries(put.params)).toEqual({ number: "381211234567", value: "off", format: "json" });
  });

  it("does nothing for a number that isn't on the account", async () => {
    const { client, calls } = fakeZadarma({ "GET /v1/direct_numbers/": () => ({ info: [] }) });
    await createZadarmaCarrier(env, { client })!.inventory!.releasePhoneNumber({ providerPhoneId: "381211234567" });
    expect(calls.some((call) => call.method === "PUT")).toBe(false);
  });

  it("points a number at the SIP server with the digits as the user part", async () => {
    const { client, calls } = fakeZadarma({ "PUT /v1/direct_numbers/set_sip_id/": () => ({ status: "success", number: "381211234567", sip_id: "x" }) });
    const routing = createZadarmaCarrier(env, { client })!.routing!;
    expect(await routing.routeNumber({ providerPhoneId: "381211234567", mode: "receptionist" })).toEqual({ target: "sip:381211234567@sip.example.com:5060" });
    expect(Object.fromEntries(calls[0]!.params)).toEqual({ number: "381211234567", sip_id: "381211234567@sip.example.com:5060", format: "json" });
    // Zadarma has no webhook to ask, so the fallback keeps the destination and the admin refuses the call itself.
    expect(await routing.routeNumber({ providerPhoneId: "381211234567", mode: "fallback" })).toEqual({ target: "sip:381211234567@sip.example.com:5060" });
    expect(routing.forwardsRefusedCalls).toBe(false);
  });

  it("can't route without the SIP server, or for staff answers first", async () => {
    const routing = createZadarmaCarrier({ ...env, ZADARMA_SIP_HOST: "" }, { client: fakeZadarma({}).client })!.routing!;
    expect(routing.missingSetup()).toContain("ZADARMA_SIP_HOST");
    await expect(routing.routeNumber({ providerPhoneId: "381211234567", mode: "receptionist" })).rejects.toThrow("ZADARMA_SIP_HOST is required");
    await expect(createZadarmaCarrier(env, { client: fakeZadarma({}).client })!.routing!.routeNumber({ providerPhoneId: "381211234567", mode: "staff_first" })).rejects.toThrow("staff answers first");
  });
});

describe("Zadarma in the telephony registry", () => {
  it("builds with credentials, is last in the default order, and sells where the others don't", async () => {
    const { client } = fakeZadarma(catalog);
    const telephony = createTelephony(env, { zadarma: () => createZadarmaCarrier(env, { client }) });
    expect(telephony.numbersCarriers("RS")).toEqual(["twilio", "telnyx", "zadarma"]);
    expect(telephony.forNumber("zadarma")?.carrier).toBe("zadarma");
    expect(await telephony.numbers.listAvailablePhoneNumbers({ countryCode: "RS", kind: "local", limit: 1 })).toEqual([expect.objectContaining({ phoneE164: "+381111234567", carrier: "zadarma" })]);
    // No shared sender through Zadarma.
    expect(createTelephony({ ...env, TELEPHONY_ALERT_SMS: "zadarma", TELEPHONY_ALERT_SMS_FROM: "+18885550100" }).alertSms).toBeUndefined();
  });

  it("isn't searched without its documents group", async () => {
    const { client, calls } = fakeZadarma(catalog);
    const without = { ...env, ZADARMA_DOCUMENTS_GROUP_ID: "" };
    const telephony = createTelephony(without, { zadarma: () => createZadarmaCarrier(without, { client }) });
    await expect(telephony.numbers.listAvailablePhoneNumbers({ countryCode: "RS", kind: "local", limit: 1 })).rejects.toMatchObject({ code: "phone_numbers_unavailable" });
    expect(calls).toHaveLength(0);
  });
});
