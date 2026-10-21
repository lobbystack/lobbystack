import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import { CliError, exitCodes } from "./errors";

/** A saved login: which dashboard, with which API key, acting on which business by default. */
export type Profile = { url: string; key: string; business?: string };
export type Config = { current?: string; profiles: Record<string, Profile> };
/** What a command connects with. profile is null when the address and key come from the environment. */
export type Connection = { profile: string | null; url: string; key: string; business?: string };

export const DEFAULT_PROFILE = "default";
const PROFILE_NAME = /^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/;
const LOGIN_HINT = "lobbystack login --url <dashboard URL> --key <API key>";

/** ~/.config/lobbystack/config.json, or under XDG_CONFIG_HOME when that is set. */
export function configPath(env: NodeJS.ProcessEnv): string {
  return join(env.XDG_CONFIG_HOME?.trim() || join(homedir(), ".config"), "lobbystack", "config.json");
}

export function assertProfileName(name: string): string {
  if (!PROFILE_NAME.test(name)) throw new CliError(`${JSON.stringify(name)} can't name a profile. Use up to 40 letters, digits, hyphens or underscores, such as staging.`);
  return name;
}

/** This machine, where a dashboard in development may use plain http. */
function isLocalHost(hostname: string): boolean {
  return ["localhost", "127.0.0.1", "[::1]"].includes(hostname) || hostname.endsWith(".localhost");
}

/**
 * The dashboard's origin, from whatever people paste: a trailing slash, a page
 * path or /api/v1 all work. Keys travel only over https, except to this machine.
 */
export function normalizeBaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    // Never repeat what looks like a key, as when --url and --key are swapped: errors end up in logs.
    throw new CliError(`${/ls[kp]_/.test(value) ? "That" : JSON.stringify(value.trim())} isn't a URL. Use the dashboard's address, such as https://app.alloplace.com.`);
  }
  if (url.protocol !== "https:" && !(url.protocol === "http:" && isLocalHost(url.hostname))) throw new CliError("Use an https URL. Only a dashboard on this machine (localhost) may use http.");
  return url.origin;
}

export async function readConfig(path: string): Promise<Config> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { profiles: {} };
    throw error;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new CliError(`${path} isn't valid JSON. Fix it, or delete it and log in again.`);
  }
  const value = parsed as { current?: unknown; profiles?: unknown };
  const profiles: Record<string, Profile> = {};
  if (value && typeof value.profiles === "object" && value.profiles !== null) {
    for (const [name, profile] of Object.entries(value.profiles as Record<string, unknown>)) {
      const entry = profile as { url?: unknown; key?: unknown; business?: unknown } | null;
      if (!entry || typeof entry.url !== "string" || typeof entry.key !== "string") continue;
      profiles[name] = { url: entry.url, key: entry.key, ...(typeof entry.business === "string" && entry.business ? { business: entry.business } : {}) };
    }
  }
  return { ...(typeof value?.current === "string" ? { current: value.current } : {}), profiles };
}

/** Saves the config so only this user can read it, since it holds API keys. */
export async function writeConfig(path: string, config: Config): Promise<void> {
  const directory = dirname(path);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  // mkdir's mode only applies to a directory it creates.
  await chmod(directory, 0o700);
  const temporary = `${path}.${process.pid}.tmp`;
  try {
    // wx: never write through a file or link someone left at the temporary path.
    await writeFile(temporary, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600, flag: "wx" });
    // A umask can narrow the mode; set it outright.
    await chmod(temporary, 0o600);
    await rename(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

/**
 * The connection a command uses. The address and the key always come from
 * one place, so a key never goes to a server it wasn't saved for: --profile
 * first, then LOBBYSTACK_URL with LOBBYSTACK_API_KEY, then the profile in use.
 * The business comes from --business, then LOBBYSTACK_BUSINESS, then the profile.
 */
export function resolveConnection(config: Config, env: NodeJS.ProcessEnv, options: { profile?: string | undefined; business?: string | undefined } = {}): Connection {
  const business = options.business ?? (env.LOBBYSTACK_BUSINESS?.trim() || undefined);
  const envUrl = env.LOBBYSTACK_URL?.trim();
  const envKey = env.LOBBYSTACK_API_KEY?.trim();
  if (options.profile === undefined && (envUrl || envKey)) {
    if (!envUrl || !envKey) throw new CliError("Set both LOBBYSTACK_URL and LOBBYSTACK_API_KEY, or neither.", exitCodes.auth);
    return { profile: null, url: normalizeBaseUrl(envUrl), key: envKey, ...(business ? { business } : {}) };
  }
  const name = options.profile ?? config.current ?? DEFAULT_PROFILE;
  const profile = config.profiles[name];
  if (!profile) {
    throw new CliError(options.profile !== undefined || config.current !== undefined ? `There's no profile named ${name}. Log in with: ${LOGIN_HINT} --profile ${name}` : `Log in first with: ${LOGIN_HINT}. Or set LOBBYSTACK_URL and LOBBYSTACK_API_KEY.`, exitCodes.auth);
  }
  const chosen = business ?? profile.business;
  return { profile: name, url: normalizeBaseUrl(profile.url), key: profile.key, ...(chosen ? { business: chosen } : {}) };
}

/** The visible start of a key, as the dashboard and GET /me show it. Never the secret part. */
export function keyPrefix(key: string): string {
  const match = /^(ls[kp]_[0-9a-f]{8})_/.exec(key);
  return match ? match[1]! : `${key.slice(0, 4)}…`;
}
