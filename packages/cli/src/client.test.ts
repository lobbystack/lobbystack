import type { ApiRequestBody, ApiResponseBody } from "@lobbystack/shared";
import { describe, expect, expectTypeOf, it, vi } from "vitest";

import { createClient, type CallInput } from "./client";
import { ApiError, CliError, exitCodes } from "./errors";

const business = "5d0bd9a4-7e1c-4a51-9a50-8e1b2c3d4e5f";
const ruleId = "7b8c9d0e-1f2a-4b3c-8d4e-5f6a7b8c9d0e";

function fakeFetch(status: number, body: unknown, init: { raw?: string; headers?: Record<string, string> } = {}) {
  return vi.fn(async (_url: URL | RequestInfo, _init?: RequestInit) => new Response(init.raw ?? JSON.stringify(body), { status, headers: { "content-type": "application/json", ...init.headers } }));
}

function sent(fetch: ReturnType<typeof fakeFetch>) {
  const [url, init] = fetch.mock.calls[0]!;
  return { url: String(url), method: init?.method, redirect: init?.redirect, headers: init?.headers as Record<string, string>, body: init?.body ? JSON.parse(String(init.body)) as unknown : undefined };
}

describe("the API client", () => {
  it("calls an operation by id with the key, the business and the body, and never follows a redirect", async () => {
    const fetch = fakeFetch(200, { data: { id: ruleId } });
    const client = createClient({ url: "https://app.example.com", key: "lsp_1a2b3c4d_secret", business, fetch });
    await client.call("updateRule", { params: { rule_id: ruleId }, body: { title: "Hours" } });
    expect(sent(fetch)).toEqual({
      url: `https://app.example.com/api/v1/rules/${ruleId}`,
      method: "PATCH",
      redirect: "manual",
      headers: { authorization: "Bearer lsp_1a2b3c4d_secret", accept: "application/json", "user-agent": "lobbystack-cli", "LobbyStack-Business": business, "content-type": "application/json" },
      body: { title: "Hours" },
    });
  });

  it("leaves the business out where an operation acts on none, and skips unset query values", async () => {
    const fetch = fakeFetch(200, { data: [], next_cursor: null, has_more: false });
    await createClient({ url: "https://app.example.com", key: "lsp_1a2b3c4d_secret", business, fetch }).call("listBusinesses", { query: { limit: 10, cursor: undefined } });
    const request = sent(fetch);
    expect(request.url).toBe("https://app.example.com/api/v1/businesses?limit=10");
    expect(request.headers).not.toHaveProperty("LobbyStack-Business");
  });

  it("sends the Idempotency-Key, and refuses path values that aren't ids", async () => {
    const fetch = fakeFetch(201, { data: {} });
    await createClient({ url: "https://app.example.com", key: "k", fetch }).call("createBusiness", { body: { name: "Acme", timezone: "America/Toronto" }, idempotencyKey: "acme-1" });
    expect(sent(fetch).headers["idempotency-key"]).toBe("acme-1");
    const client = createClient({ url: "https://app.example.com", key: "k", fetch });
    for (const value of ["..", ".", "a/b", "rule"]) {
      await expect(client.call("updateRule", { params: { rule_id: value }, body: { title: "x" } })).rejects.toThrow("rule_id must be an id");
    }
    // The types already demand path values; the runtime check is for callers that cast.
    await expect((client.call as (id: string) => Promise<unknown>)("getContact")).rejects.toThrow("Missing contact_id.");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("stops at a redirect and says where it pointed", async () => {
    const fetch = fakeFetch(307, null, { raw: "", headers: { location: "https://login.example.net/sso?next=/api/v1/me" } });
    const error = await createClient({ url: "https://app.example.com", key: "k", fetch }).call("getMe").then(() => null, (value: unknown) => value);
    expect(error).toBeInstanceOf(CliError);
    expect(error).toMatchObject({ exitCode: exitCodes.invalid, message: "https://app.example.com redirected the request to https://login.example.net. Log in with the address the API is at." });
  });

  it("turns API errors into exit codes that separate input, auth and server failures", async () => {
    const cases: Array<[number, number]> = [[400, exitCodes.invalid], [404, exitCodes.invalid], [409, exitCodes.invalid], [422, exitCodes.invalid], [401, exitCodes.auth], [403, exitCodes.auth], [429, exitCodes.failed], [500, exitCodes.failed], [503, exitCodes.failed]];
    for (const [status, exitCode] of cases) {
      const fetch = fakeFetch(status, { error: { code: "conflict", message: `Refused with ${status}.`, details: [{ path: "name", message: "Required." }] } });
      const error = await createClient({ url: "https://app.example.com", key: "k", fetch }).call("getMe").then(() => null, (value: unknown) => value);
      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({ status, exitCode, code: "conflict", message: `Refused with ${status}.`, details: [{ path: "name", message: "Required." }] });
    }
  });

  it("explains a network failure and an answer that isn't the API", async () => {
    const offline = vi.fn(async () => { throw new TypeError("fetch failed"); });
    await expect(createClient({ url: "https://app.example.com", key: "k", fetch: offline }).call("getMe")).rejects.toMatchObject({ exitCode: exitCodes.failed, message: "Couldn't reach https://app.example.com: fetch failed" });
    const page = fakeFetch(200, null, { raw: "<html>Sign in</html>" });
    const error = await createClient({ url: "https://app.example.com", key: "k", fetch: page }).call("getMe").then(() => null, (value: unknown) => value);
    expect(error).toBeInstanceOf(CliError);
    expect(error).toMatchObject({ exitCode: exitCodes.failed });
    const notFound = fakeFetch(404, null, { raw: "Not Found" });
    await expect(createClient({ url: "https://app.example.com", key: "k", fetch: notFound }).call("getMe")).rejects.toMatchObject({ status: 404, code: "http_error", message: "The API answered 404." });
  });

  it("takes each operation's body, response, path values and Idempotency-Key from the registry", () => {
    expectTypeOf<ApiRequestBody<"createBusiness">>().toExtend<{ name: string; timezone: string }>();
    expectTypeOf<ApiRequestBody<"updateRule">>().toEqualTypeOf<{ title?: string | undefined; content?: string | undefined; active?: boolean | undefined }>();
    expectTypeOf<ApiRequestBody<"getMe">>().toBeNever();
    expectTypeOf<ApiResponseBody<"listRules">>().toExtend<{ data: Array<{ id: string; title: string }>; next_cursor: string | null; has_more: boolean }>();
    expectTypeOf<ApiResponseBody<"getMe">["data"]["api_key"]["prefix"]>().toEqualTypeOf<string>();
    expectTypeOf<CallInput<"updateRule">["params"]>().toEqualTypeOf<Record<"rule_id", string>>();
    // Never called: these only have to fail to compile.
    const misuse = (client: ReturnType<typeof createClient>) => {
      // @ts-expect-error updateRule needs its rule_id.
      void client.call("updateRule", { body: { title: "x" } });
      // @ts-expect-error a misspelt path value.
      void client.call("updateRule", { params: { ruleId }, body: { title: "x" } });
      // @ts-expect-error createBusiness requires an Idempotency-Key.
      void client.call("createBusiness", { body: { name: "Acme", timezone: "UTC" } });
      // @ts-expect-error getMe takes no body.
      void client.call("getMe", { body: {} });
      // @ts-expect-error a field the API doesn't know.
      void client.call("updateRule", { params: { rule_id: ruleId }, body: { name: "x" } });
    };
    expect(misuse).toBeTypeOf("function");
  });
});
