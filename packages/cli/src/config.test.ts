import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { configPath, keyPrefix, normalizeBaseUrl, readConfig, resolveConnection, writeConfig, type Config } from "./config";
import { CliError, exitCodes } from "./errors";

let dir: string;
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), "lobbystack-cli-")); });
afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

const business = "5d0bd9a4-7e1c-4a51-9a50-8e1b2c3d4e5f";
const other = "0b7c1d2e-3f40-4a51-8b62-7c83d94ea5b6";
const config: Config = { current: "staging", profiles: { staging: { url: "https://staging.example.com", key: "lsp_1a2b3c4d_staging", business }, production: { url: "https://app.example.com", key: "lsk_0f0f0f0f_production" } } };
// Windows has no POSIX modes to check.
const posix = process.platform !== "win32";

describe("the dashboard address", () => {
  it("keeps only the origin of what people paste, and sends keys over https except to this machine", () => {
    expect(normalizeBaseUrl(" https://app.alloplace.com/ ")).toBe("https://app.alloplace.com");
    expect(normalizeBaseUrl("https://app.alloplace.com/api/v1")).toBe("https://app.alloplace.com");
    expect(normalizeBaseUrl("https://app.alloplace.com/integrations?x=1")).toBe("https://app.alloplace.com");
    expect(normalizeBaseUrl("http://localhost:3000")).toBe("http://localhost:3000");
    expect(normalizeBaseUrl("http://127.0.0.1:3000/")).toBe("http://127.0.0.1:3000");
    expect(normalizeBaseUrl("http://app.localhost:3000")).toBe("http://app.localhost:3000");
    expect(() => normalizeBaseUrl("http://app.alloplace.com")).toThrow(CliError);
    expect(() => normalizeBaseUrl("app.alloplace.com")).toThrow(CliError);
  });

  it("never repeats a key passed where the address goes", () => {
    expect(() => normalizeBaseUrl("lsk_1a2b3c4d_abcdefghijklmnopqrstuvwxyzABCDEF")).toThrow("That isn't a URL");
    try { normalizeBaseUrl("lsk_1a2b3c4d_abcdefghijklmnopqrstuvwxyzABCDEF"); } catch (error) { expect((error as Error).message).not.toContain("abcdefgh"); }
  });
});

describe("profiles", () => {
  it("lives under XDG_CONFIG_HOME when it's set", () => {
    expect(configPath({ XDG_CONFIG_HOME: dir })).toBe(join(dir, "lobbystack", "config.json"));
  });

  it("round-trips, and only this user can read the file, also after a rewrite", async () => {
    const path = join(dir, "lobbystack", "config.json");
    expect(await readConfig(path)).toEqual({ profiles: {} });
    await writeConfig(path, config);
    expect(await readConfig(path)).toEqual(config);
    if (posix) expect((await stat(path)).mode & 0o777).toBe(0o600);
    await chmod(path, 0o644);
    await chmod(join(dir, "lobbystack"), 0o755);
    await writeConfig(path, { profiles: {} });
    expect(await readConfig(path)).toEqual({ profiles: {} });
    if (posix) {
      expect((await stat(path)).mode & 0o777).toBe(0o600);
      expect((await stat(join(dir, "lobbystack"))).mode & 0o777).toBe(0o700);
    }
  });

  it("reads a damaged file as an error, and skips entries it can't use", async () => {
    const path = join(dir, "config.json");
    await writeFile(path, "{not json");
    await expect(readConfig(path)).rejects.toThrow(CliError);
    await writeFile(path, JSON.stringify({ current: "a", profiles: { a: { url: "https://a.example.com", key: "lsk_x" }, broken: { url: 1 } } }));
    expect(await readConfig(path)).toEqual({ current: "a", profiles: { a: { url: "https://a.example.com", key: "lsk_x" } } });
    expect(JSON.parse(await readFile(path, "utf8"))).toHaveProperty("profiles.broken");
  });

  it("never writes through a file left at the temporary path", async () => {
    const path = join(dir, "lobbystack", "config.json");
    await mkdir(join(dir, "lobbystack"));
    await writeFile(`${path}.${process.pid}.tmp`, "someone else's");
    await expect(writeConfig(path, config)).rejects.toThrow();
    await expect(readFile(`${path}.${process.pid}.tmp`, "utf8")).rejects.toThrow();
  });
});

describe("the connection", () => {
  it("uses the profile in use, or the one --profile names", () => {
    expect(resolveConnection(config, {})).toEqual({ profile: "staging", url: "https://staging.example.com", key: "lsp_1a2b3c4d_staging", business });
    expect(resolveConnection(config, {}, { profile: "production" })).toEqual({ profile: "production", url: "https://app.example.com", key: "lsk_0f0f0f0f_production" });
  });

  it("takes the address and the key from one place, so a key never goes to another server", () => {
    // An exported key and a named profile: the profile's own key goes to the profile's address.
    expect(resolveConnection(config, { LOBBYSTACK_API_KEY: "lsk_exported" }, { profile: "staging" })).toMatchObject({ url: "https://staging.example.com", key: "lsp_1a2b3c4d_staging" });
    // A development address in the environment and --profile production: production's pair.
    expect(resolveConnection(config, { LOBBYSTACK_URL: "http://localhost:3000" }, { profile: "production" })).toMatchObject({ url: "https://app.example.com", key: "lsk_0f0f0f0f_production" });
    // Both in the environment, as in CI: they win over the profile in use, which lends nothing, not even its business.
    expect(resolveConnection(config, { LOBBYSTACK_URL: "https://other.example.com/", LOBBYSTACK_API_KEY: "lsk_env" })).toEqual({ profile: null, url: "https://other.example.com", key: "lsk_env" });
    // Only one of them is a mistake, never half a profile.
    for (const env of [{ LOBBYSTACK_URL: "https://other.example.com" }, { LOBBYSTACK_API_KEY: "lsk_env" }]) {
      expect(() => resolveConnection(config, env)).toThrow("Set both LOBBYSTACK_URL and LOBBYSTACK_API_KEY, or neither.");
    }
  });

  it("picks the business from --business, then LOBBYSTACK_BUSINESS, then the profile", () => {
    expect(resolveConnection(config, { LOBBYSTACK_BUSINESS: other })).toMatchObject({ business: other });
    expect(resolveConnection(config, { LOBBYSTACK_BUSINESS: other }, { business })).toMatchObject({ business });
    expect(resolveConnection(config, { LOBBYSTACK_URL: "https://other.example.com", LOBBYSTACK_API_KEY: "lsk_env", LOBBYSTACK_BUSINESS: other })).toMatchObject({ profile: null, business: other });
  });

  it("asks to log in when nothing says where to connect", () => {
    for (const attempt of [() => resolveConnection({ profiles: {} }, {}), () => resolveConnection(config, {}, { profile: "missing" }), () => resolveConnection({ current: "gone", profiles: {} }, {})]) {
      expect(attempt).toThrow(CliError);
      try { attempt(); } catch (error) { expect((error as CliError).exitCode).toBe(exitCodes.auth); }
    }
  });

  it("shows a key's prefix, never its secret", () => {
    expect(keyPrefix("lsk_1a2b3c4d_abcdefghijklmnopqrstuvwxyzABCDEF")).toBe("lsk_1a2b3c4d");
    expect(keyPrefix("lsp_0f0f0f0f_abcdefghijklmnopqrstuvwxyzABCDEF")).toBe("lsp_0f0f0f0f");
    expect(keyPrefix("not-a-key-at-all")).toBe("not-…");
  });
});
