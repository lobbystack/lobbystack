import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { exitCodes } from "./errors";
import { main } from "./main";

const business = "5d0bd9a4-7e1c-4a51-9a50-8e1b2c3d4e5f";
const platformMe = { api_key: { id: "0b7c1d2e-3f40-4a51-8b62-7c83d94ea5b6", name: "AlloPlace CLI", prefix: "lsp_1a2b3c4d", scopes: ["business:read", "businesses:create"], created_at: "2026-10-11T12:00:00.000Z" }, business: null, platform: { partner: "alloplace", access: "partner" } };
const key = "lsp_1a2b3c4d_abcdefghijklmnopqrstuvwxyzABCDEF";

let dir: string;
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), "lobbystack-cli-")); });
afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

function api(handler: (url: URL, init: RequestInit) => { status: number; body: unknown }) {
  return vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
    const { status, body } = handler(new URL(String(input)), init ?? {});
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  });
}

async function run(argv: string[], options: { fetch?: typeof fetch; env?: NodeJS.ProcessEnv; stdin?: string } = {}) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await main({ argv, env: { XDG_CONFIG_HOME: dir, ...options.env }, out: (text) => out.push(text), err: (text) => err.push(text), ...(options.fetch ? { fetch: options.fetch } : {}), ...(options.stdin !== undefined ? { readStdin: async () => options.stdin! } : {}) });
  return { code, out: out.join("\n"), err: err.join("\n") };
}

const savedConfig = async () => JSON.parse(await readFile(join(dir, "lobbystack", "config.json"), "utf8")) as unknown;
const accepted = () => api(() => ({ status: 200, body: { data: platformMe } }));

describe("lobbystack", () => {
  it("logs in only with a key the API accepts, and saves it as the profile in use", async () => {
    const fetch = accepted();
    const login = await run(["login", "--url", "https://app.example.com/", "--key", key, "--profile", "staging"], { fetch });
    expect(login).toMatchObject({ code: exitCodes.ok, err: "" });
    expect(login.out).toContain("Logged in to https://app.example.com with AlloPlace CLI (lsp_1a2b3c4d)");
    expect(login.out).toContain("platform key");
    expect(String(fetch.mock.calls[0]![0])).toBe("https://app.example.com/api/v1/me");
    expect(await savedConfig()).toEqual({ current: "staging", profiles: { staging: { url: "https://app.example.com", key } } });

    const refused = await run(["login", "--url", "https://app.example.com", "--key", "lsk_bad", "--profile", "other"], { fetch: api(() => ({ status: 401, body: { error: { code: "unauthorized", message: "The API key is invalid or has been revoked." } } })) });
    expect(refused).toMatchObject({ code: exitCodes.auth, err: "The API key is invalid or has been revoked." });
    expect(await savedConfig()).not.toHaveProperty("profiles.other");
  });

  it("reads the key from standard input, and checks the business it's given", async () => {
    const fetch = api((_url, init) => ({ status: 200, body: { data: { ...platformMe, business: { id: (init.headers as Record<string, string>)["LobbyStack-Business"], name: "Acme Dental" } } } }));
    const login = await run(["login", "--url", "https://app.example.com", "--key-stdin", "--business", business, "--json"], { fetch, stdin: `${key}\n` });
    expect(login.code).toBe(exitCodes.ok);
    expect(JSON.parse(login.out)).toMatchObject({ profile: "default", url: "https://app.example.com", business: { id: business, name: "Acme Dental" } });
    expect(await savedConfig()).toEqual({ current: "default", profiles: { default: { url: "https://app.example.com", key, business } } });
    expect((await run(["login", "--url", "https://app.example.com", "--key", key, "--business", "acme"])).code).toBe(exitCodes.invalid);
  });

  it("saves the environment's address and key as a pair, and never mixes one with a flag", async () => {
    const fetch = accepted();
    const env = { LOBBYSTACK_URL: "https://env.example.com", LOBBYSTACK_API_KEY: key };
    expect((await run(["login", "--profile", "ci"], { fetch, env })).code).toBe(exitCodes.ok);
    expect(await savedConfig()).toEqual({ current: "ci", profiles: { ci: { url: "https://env.example.com", key } } });
    // An exported key with an address given on the command line would send that key elsewhere.
    for (const argv of [["login", "--url", "https://other.example.com"], ["login", "--key", key], ["login", "--url", "https://other.example.com", "--key", key, "--key-stdin"]]) {
      expect(await run(argv, { fetch, env: { LOBBYSTACK_API_KEY: key } })).toMatchObject({ code: exitCodes.invalid, err: expect.stringContaining("Pass --url with either --key or --key-stdin.") });
    }
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("shows who the key is, as fields or JSON", async () => {
    await run(["login", "--url", "https://app.example.com", "--key", key], { fetch: accepted() });
    const fetch = accepted();
    const whoami = await run(["whoami"], { fetch });
    expect(whoami.code).toBe(exitCodes.ok);
    expect(whoami.out).toMatch(/Profile:\s+default \(https:\/\/app\.example\.com\)/);
    expect(whoami.out).toMatch(/Partner:\s+alloplace, access to its own businesses/);
    expect(whoami.out).toMatch(/Scopes:\s+business:read, businesses:create/);
    expect(JSON.parse((await run(["whoami", "--json"], { fetch })).out)).toMatchObject({ profile: "default", api_key: { prefix: "lsp_1a2b3c4d" } });
    // --business reaches the API as the LobbyStack-Business header.
    await run(["whoami", "--business", business], { fetch });
    expect((fetch.mock.calls.at(-1)![1]!.headers as Record<string, string>)["LobbyStack-Business"]).toBe(business);
    // With the environment's pair, whoami says so.
    expect((await run(["whoami"], { fetch, env: { LOBBYSTACK_URL: "https://env.example.com", LOBBYSTACK_API_KEY: key } })).out).toMatch(/Profile:\s+LOBBYSTACK_URL and LOBBYSTACK_API_KEY \(https:\/\/env\.example\.com\)/);
  });

  it("lists profiles without their keys, switches between them and forgets one", async () => {
    const fetch = accepted();
    await run(["login", "--url", "https://staging.example.com", "--key", key, "--profile", "staging"], { fetch });
    await run(["login", "--url", "https://app.example.com", "--key", key, "--profile", "production"], { fetch });
    const listed = await run(["profiles", "--json"]);
    expect(JSON.parse(listed.out)).toEqual([
      { profile: "staging", current: false, url: "https://staging.example.com", key: "lsp_1a2b3c4d", business: null },
      { profile: "production", current: true, url: "https://app.example.com", key: "lsp_1a2b3c4d", business: null },
    ]);
    expect((await run(["profiles"])).out).not.toContain(key);
    expect(await run(["profiles", "use", "staging"])).toMatchObject({ code: exitCodes.ok, out: "Commands now use the staging profile." });
    expect((await run(["profiles", "use", "nowhere"])).code).toBe(exitCodes.invalid);
    expect((await run(["logout", "--profile", "production"])).code).toBe(exitCodes.ok);
    expect(await savedConfig()).toEqual({ current: "staging", profiles: { staging: { url: "https://staging.example.com", key } } });
    expect((await run(["logout", "--profile", "production"])).code).toBe(exitCodes.invalid);
  });

  it("explains usage mistakes and a missing login with their own exit codes", async () => {
    expect((await run([])).out).toContain("Usage: lobbystack <command>");
    expect(await run(["frobnicate"])).toMatchObject({ code: exitCodes.invalid, err: expect.stringContaining("There's no frobnicate command") });
    expect(await run(["whoami", "--nope"])).toMatchObject({ code: exitCodes.invalid, err: expect.stringContaining("Usage: lobbystack whoami") });
    expect(await run(["login", "--url", "https://app.example.com"])).toMatchObject({ code: exitCodes.invalid });
    expect(await run(["whoami"])).toMatchObject({ code: exitCodes.auth, err: expect.stringContaining("Log in first") });
    expect((await run(["login", "--help"])).out).toContain("Usage: lobbystack login");
    const failed = await run(["whoami", "--json"], { fetch: api(() => ({ status: 500, body: { error: { code: "internal_error", message: "Something went wrong on our side." } } })), env: { LOBBYSTACK_URL: "https://app.example.com", LOBBYSTACK_API_KEY: key } });
    expect(failed.code).toBe(exitCodes.failed);
    expect(JSON.parse(failed.err)).toEqual({ error: { message: "Something went wrong on our side.", exit_code: exitCodes.failed, status: 500, code: "internal_error", details: [] } });
  });
});
