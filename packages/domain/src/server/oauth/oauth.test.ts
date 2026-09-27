import { EventEmitter } from "node:events";
import type https from "node:https";

import { describe, expect, it, vi } from "vitest";

import { createGuardedLookup } from "../publicApi/webhookNetwork";
import { CIMD_MAX_RESPONSE_BYTES, createCimdFetch, isCimdUrlAllowed } from "./cimdFetch";
import { hashOAuthToken, isOAuthAccessToken, oauthTokenPepper } from "./tokens";

describe("OAuth token hashing", () => {
  it("hashes by type with a pepper, so the same value hashes differently per type and deployment", () => {
    const pepper = oauthTokenPepper({ ENCRYPTION_KEY: "one" });
    expect(hashOAuthToken("abc", "access_token", pepper)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashOAuthToken("abc", "access_token", pepper)).toBe(hashOAuthToken("abc", "access_token", pepper));
    expect(hashOAuthToken("abc", "access_token", pepper)).not.toBe(hashOAuthToken("abc", "refresh_token", pepper));
    expect(hashOAuthToken("abc", "access_token", pepper)).not.toBe(hashOAuthToken("abc", "access_token", oauthTokenPepper({ ENCRYPTION_KEY: "two" })));
  });

  it("requires ENCRYPTION_KEY in production", () => {
    expect(() => oauthTokenPepper({ NODE_ENV: "production" })).toThrow(/ENCRYPTION_KEY/);
  });

  it("recognizes access tokens by prefix", () => {
    expect(isOAuthAccessToken("lsa_abc")).toBe(true);
    expect(isOAuthAccessToken("lsa_")).toBe(false);
    expect(isOAuthAccessToken("lsr_abc")).toBe(false);
    expect(isOAuthAccessToken("lsk_12345678_abc")).toBe(false);
    expect(isOAuthAccessToken(`lsa_${"a".repeat(600)}`)).toBe(false);
  });
});

describe("CIMD client_id URLs", () => {
  it.each([
    ["https://claude.ai/oauth/mcp-oauth-client-metadata", true],
    ["https://chatgpt.com/.well-known/client.json", true],
    ["http://claude.ai/oauth/metadata", false],
    ["https://claude.ai/", false],
    ["https://user:pass@claude.ai/oauth/metadata", false],
    ["https://localhost/client.json", false],
    ["https://metadata.google.internal/client.json", false],
    ["https://127.0.0.1/client.json", false],
    ["https://169.254.169.254/latest/meta-data", false],
    ["https://[::1]/client.json", false],
    ["https://10.0.0.5/client.json", false],
    ["not a url", false],
  ])("%s allowed: %s", (url, allowed) => {
    expect(isCimdUrlAllowed(url)).toBe(allowed);
  });
});

type FakeResponse = { status: number; headers?: Record<string, string>; chunks?: Buffer[] };

/** A stand-in for https.request that answers with a fixed response and records the options it got. */
function fakeRequest(reply: FakeResponse | "hang") {
  const calls: Array<{ url: URL; options: https.RequestOptions }> = [];
  const request = ((url: URL, options: https.RequestOptions, callback: (response: EventEmitter & { statusCode?: number; headers: Record<string, string>; destroy: () => void }) => void) => {
    calls.push({ url, options });
    const outgoing = new EventEmitter() as EventEmitter & { end: () => void; destroy: () => void };
    outgoing.destroy = () => undefined;
    outgoing.end = () => {
      if (reply === "hang") return;
      const response = Object.assign(new EventEmitter(), { statusCode: reply.status, headers: reply.headers ?? {}, destroy: () => undefined });
      callback(response);
      queueMicrotask(() => {
        for (const chunk of reply.chunks ?? []) response.emit("data", chunk);
        response.emit("end");
      });
    };
    return outgoing;
  }) as unknown as typeof https.request;
  return { request, calls };
}

describe("CIMD metadata fetch", () => {
  const url = "https://client.example.com/oauth/metadata.json";
  const document = Buffer.from(JSON.stringify({ client_id: url, client_name: "Example", redirect_uris: ["https://client.example.com/cb"] }));

  it("fetches with the guarded lookup and returns the body and caching headers", async () => {
    const lookup = createGuardedLookup();
    const fake = fakeRequest({ status: 200, headers: { "content-type": "application/json", "cache-control": "max-age=600" }, chunks: [document] });
    const response = await createCimdFetch({ lookup, request: fake.request })(url, { headers: { accept: "application/json" } });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("max-age=600");
    expect(await response.json()).toMatchObject({ client_name: "Example" });
    expect(fake.calls[0]!.options.lookup).toBe(lookup);
    expect(fake.calls[0]!.options.agent).toBe(false);
  });

  it("returns redirects without following them", async () => {
    const fake = fakeRequest({ status: 302, headers: { location: "http://169.254.169.254/" } });
    const response = await createCimdFetch({ request: fake.request })(url);
    expect(response.status).toBe(302);
    expect(fake.calls).toHaveLength(1);
  });

  it("stops reading a document over the size limit", async () => {
    const fake = fakeRequest({ status: 200, headers: { "content-type": "application/json" }, chunks: [Buffer.alloc(CIMD_MAX_RESPONSE_BYTES), Buffer.alloc(10)] });
    await expect(createCimdFetch({ request: fake.request })(url)).rejects.toThrow(/larger than/);
  });

  it("gives up after the timeout", async () => {
    const fake = fakeRequest("hang");
    await expect(createCimdFetch({ request: fake.request, timeoutMs: 20 })(url)).rejects.toThrow(/timed out/);
  });

  it("refuses non-HTTPS and private hosts before any network call", async () => {
    const fake = fakeRequest({ status: 200 });
    const fetch = createCimdFetch({ request: fake.request });
    await expect(fetch("http://client.example.com/metadata.json")).rejects.toThrow(/HTTPS/);
    await expect(fetch("https://127.0.0.1/metadata.json")).rejects.toThrow(/public host/);
    await expect(fetch(url, { method: "POST", body: "{}" })).rejects.toThrow(/GET or HEAD/);
    expect(fake.calls).toHaveLength(0);
  });

  it("refuses a host whose DNS answers include a private address", async () => {
    const resolve = vi.fn((_host: string, _options: unknown, callback: (error: null, addresses: Array<{ address: string; family: number }>) => void) => callback(null, [{ address: "93.184.216.34", family: 4 }, { address: "10.0.0.8", family: 4 }]));
    const lookup = createGuardedLookup(resolve as never);
    const result = await new Promise<Error | null>((resolveResult) => lookup("client.example.com", { all: false }, (error) => resolveResult(error)));
    expect(result?.name).toBe("BlockedAddressError");
  });
});
