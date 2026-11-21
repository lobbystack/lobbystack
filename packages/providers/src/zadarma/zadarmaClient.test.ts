import { describe, expect, it, vi } from "vitest";

import { ZadarmaApiError, ZadarmaClient, zadarmaParamString, zadarmaSignature } from "./zadarmaClient";

const secret = "test-secret";

// Computed with the logic of Zadarma's own Python client (zadarma/api.py): base64 of the hex HMAC-SHA1 of
// method + sorted urlencoded params + md5 of those params, with format=json added.
const orderParams = { number_id: "1712p0D1643D0t42r198658", direction_id: "3766", documents_group_id: "5", purpose: "AI receptionist, Novi Sad", format: "json" };

function fakeFetch(answer: () => Response) {
  const fetch = vi.fn(async (_input: URL | RequestInfo, _init?: RequestInit) => answer());
  return { fetch, client: new ZadarmaClient({ key: "test-key", secret, fetch: fetch as typeof globalThis.fetch }) };
}

describe("Zadarma request signing", () => {
  it("signs the way Zadarma's own client does", () => {
    expect(zadarmaSignature({ method: "/v1/direct_numbers/order/", params: orderParams, secret })).toBe("NzJkMzM3YmRkM2M2MTk4Yjg1NDc1ZjQ3ZGI2NzkzZmI0Y2M1M2Y1Yw==");
    expect(zadarmaSignature({ method: "/v1/direct_numbers/", params: { format: "json" }, secret })).toBe("Zjg1MDFjMzdhNTA0Mjc4Mjg1OGExYmUxNzMwNWZlZDdiYmI0M2ViMQ==");
    expect(zadarmaSignature({ method: "/v1/direct_numbers/set_sip_id/", params: { number: "381211234567", sip_id: "381211234567@sip.example.com:5060", format: "json" }, secret })).toBe("NWY0OWM1N2JiNmU4ODVlNjZmNDBiMTkxMjU2Y2I3ZWZhMTJkMjRjMQ==");
  });

  it("sorts the parameters and escapes them like PHP's urlencode", () => {
    expect(zadarmaParamString(orderParams)).toBe("direction_id=3766&documents_group_id=5&format=json&number_id=1712p0D1643D0t42r198658&purpose=AI+receptionist%2C+Novi+Sad");
    // PHP escapes these too, where encodeURIComponent leaves them.
    expect(zadarmaParamString({ q: "a*b~c(d)!'e" })).toBe("q=a%2Ab%7Ec%28d%29%21%27e");
  });
});

describe("ZadarmaClient", () => {
  it("sends a GET with its parameters in the query and the signature in Authorization", async () => {
    const { fetch, client } = fakeFetch(() => new Response(JSON.stringify({ status: "success", info: [] })));
    expect(await client.get("/v1/direct_numbers/country/", { country: "RS", language: undefined })).toEqual({ status: "success", info: [] });
    const [url, init] = fetch.mock.calls[0]!;
    expect(String(url)).toBe("https://api.zadarma.com/v1/direct_numbers/country/?country=RS&format=json");
    expect(init?.method).toBe("GET");
    expect((init?.headers as Record<string, string>).authorization).toBe(`test-key:${zadarmaSignature({ method: "/v1/direct_numbers/country/", params: { country: "RS", format: "json" }, secret })}`);
    expect(init?.body).toBeUndefined();
  });

  it("sends a POST as a form, signed over the same parameters", async () => {
    const { fetch, client } = fakeFetch(() => new Response(JSON.stringify({ status: "success" })));
    await client.post("/v1/direct_numbers/order/", { number_id: orderParams.number_id, direction_id: 3766, documents_group_id: "5", purpose: orderParams.purpose });
    const [url, init] = fetch.mock.calls[0]!;
    expect(String(url)).toBe("https://api.zadarma.com/v1/direct_numbers/order/");
    expect((init?.headers as Record<string, string>)["content-type"]).toBe("application/x-www-form-urlencoded");
    expect(init?.body).toBe(zadarmaParamString(orderParams));
    expect((init?.headers as Record<string, string>).authorization).toBe("test-key:NzJkMzM3YmRkM2M2MTk4Yjg1NDc1ZjQ3ZGI2NzkzZmI0Y2M1M2Y1Yw==");
  });

  it("sends a PUT the same way", async () => {
    const { fetch, client } = fakeFetch(() => new Response(JSON.stringify({ status: "success" })));
    await client.put("/v1/direct_numbers/autoprolongation/", { number: "381211234567", value: "off" });
    expect(fetch.mock.calls[0]![1]?.method).toBe("PUT");
    expect(fetch.mock.calls[0]![1]?.body).toBe("format=json&number=381211234567&value=off");
  });

  it("keeps the status and message of an error answer", async () => {
    const { client } = fakeFetch(() => new Response(JSON.stringify({ status: "error", message: "Wrong signature" }), { status: 401 }));
    await expect(client.get("/v1/direct_numbers/")).rejects.toMatchObject({ name: "ZadarmaApiError", status: 401, message: "Zadarma /v1/direct_numbers/ answered 401: Wrong signature" });
  });

  it("treats status error in a 200 answer as an error", async () => {
    const { client } = fakeFetch(() => new Response(JSON.stringify({ status: "error", message: "Check phone's number" })));
    await expect(client.put("/v1/direct_numbers/set_sip_id/", { number: "1" })).rejects.toBeInstanceOf(ZadarmaApiError);
  });

  it("keeps the status of an error that isn't JSON, and refuses a success that isn't", async () => {
    await expect(fakeFetch(() => new Response("<html>Bad gateway</html>", { status: 502 })).client.get("/v1/direct_numbers/")).rejects.toMatchObject({ status: 502 });
    await expect(fakeFetch(() => new Response("<html>ok</html>", { status: 200 })).client.get("/v1/direct_numbers/")).rejects.toThrow("isn't JSON");
  });
});
