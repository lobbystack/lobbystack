import { createClient } from "./client";
import { businessId, stringValue, type Command } from "./command";
import { DEFAULT_PROFILE, assertProfileName, keyPrefix, normalizeBaseUrl, readConfig, writeConfig } from "./config";
import { CliError } from "./errors";
import { formatFields, formatTable, print } from "./output";
import { userAgent } from "./version";

// Logging in, and the profiles that hold a dashboard address and an API key.

const loginUsage = [
  "lobbystack login --url <dashboard URL> --key <API key> [--profile <name>] [--business <id>]",
  "lobbystack login --url <dashboard URL> --key-stdin [--profile <name>] [--business <id>]",
  "lobbystack login [--profile <name>] [--business <id>], with LOBBYSTACK_URL and LOBBYSTACK_API_KEY set",
].join("\n");

export const login: Command = {
  summary: "Check an API key and save it, with the dashboard's address, as a profile.",
  usage: loginUsage,
  options: {
    url: { type: "string", placeholder: "<dashboard URL>", description: "The dashboard's address, such as https://app.alloplace.com." },
    key: { type: "string", placeholder: "<API key>", description: "An API key from Settings > API keys, or a platform key." },
    "key-stdin": { type: "boolean", description: "Read the key from standard input, which keeps it out of your shell history." },
  },
  operations: ["getMe"],
  async run({ io, output, values, configPath: path }) {
    // The address and the key come from one place, so a key is only ever checked against the server it's saved for.
    const flagged = values.url !== undefined || values.key !== undefined || values["key-stdin"] !== undefined;
    if (flagged && (values.url === undefined || (values.key === undefined) === (values["key-stdin"] !== true))) throw new CliError(`Pass --url with either --key or --key-stdin.\nUsage: ${loginUsage}`);
    const url = flagged ? stringValue(values, "url") : io.env.LOBBYSTACK_URL?.trim();
    const key = flagged ? (stringValue(values, "key") ?? await io.readStdin?.())?.trim() : io.env.LOBBYSTACK_API_KEY?.trim();
    if (!url || !key) throw new CliError(`Pass the dashboard's address and an API key.\nUsage: ${loginUsage}`);
    const name = assertProfileName(stringValue(values, "profile") ?? DEFAULT_PROFILE);
    const base = normalizeBaseUrl(url);
    const business = businessId(stringValue(values, "business"));
    const me = (await createClient({ url: base, key, business, userAgent, ...(io.fetch ? { fetch: io.fetch } : {}) }).call("getMe")).data;
    const config = await readConfig(path);
    config.profiles[name] = { url: base, key, ...(business ? { business } : {}) };
    config.current = name;
    await writeConfig(path, config);
    const pick = me.platform && !me.business ? " It's a platform key: pick a business with lobbystack business use <id>, or pass --business." : "";
    print(output, { profile: name, url: base, ...me }, () => `Logged in to ${base} with ${me.api_key.name} (${me.api_key.prefix}). Commands now use the ${name} profile.${me.business ? ` Business: ${me.business.name}.` : ""}${pick}`);
  },
};

export const logout: Command = {
  summary: "Forget a profile and the API key saved with it.",
  usage: "lobbystack logout [--profile <name>]",
  async run({ output, values, configPath: path }) {
    const config = await readConfig(path);
    const name = stringValue(values, "profile") ?? config.current ?? DEFAULT_PROFILE;
    if (!config.profiles[name]) throw new CliError(`There's no profile named ${name}.`);
    delete config.profiles[name];
    if (config.current === name) delete config.current;
    await writeConfig(path, config);
    print(output, { profile: name, removed: true }, () => `Removed the ${name} profile. The key still works until you revoke it in the dashboard, or in PLATFORM_API_KEYS for a platform key.`);
  },
};

export const whoami: Command = {
  summary: "Show the API key in use, its business and its scopes.",
  usage: "lobbystack whoami [--profile <name>] [--business <id>]",
  operations: ["getMe"],
  async run({ output, connect }) {
    const { client, connection } = await connect();
    const me = (await client.call("getMe")).data;
    print(output, { profile: connection.profile, url: connection.url, ...me }, () => formatFields([
      ["Profile", connection.profile ? `${connection.profile} (${connection.url})` : `LOBBYSTACK_URL and LOBBYSTACK_API_KEY (${connection.url})`],
      ["API key", `${me.api_key.name} (${me.api_key.prefix})`],
      ...(me.platform ? [["Partner", `${me.platform.partner}, access to ${me.platform.access === "all" ? "every business" : "its own businesses"}`] as const] : []),
      ["Business", me.business ? `${me.business.name} (${me.business.id})` : "none"],
      ["Scopes", me.api_key.scopes],
    ]));
  },
};

const profilesUsage = "lobbystack profiles\nlobbystack profiles use <name>";

export const profiles: Command = {
  summary: "List the saved profiles, or pick the one commands use.",
  usage: profilesUsage,
  async run({ output, positionals, configPath: path }) {
    const config = await readConfig(path);
    const [action, name, ...extra] = positionals;
    if (action === "use") {
      if (!name || extra.length) throw new CliError(`Usage: ${profilesUsage}`);
      if (!config.profiles[name]) throw new CliError(`There's no profile named ${name}.`);
      config.current = name;
      await writeConfig(path, config);
      print(output, { current: name }, () => `Commands now use the ${name} profile.`);
      return;
    }
    if (action !== undefined) throw new CliError(`Usage: ${profilesUsage}`);
    const current = config.current ?? DEFAULT_PROFILE;
    // The key's prefix only: the secret part stays in the file.
    const rows = Object.entries(config.profiles).map(([profile, entry]) => ({ profile, current: profile === current, url: entry.url, key: keyPrefix(entry.key), business: entry.business ?? null }));
    print(output, rows, () => formatTable(rows.map((row) => ({ ...row, current: row.current ? "yes" : "" })), [{ key: "profile", label: "Profile" }, { key: "current", label: "In use" }, { key: "url", label: "URL" }, { key: "key", label: "Key" }, { key: "business", label: "Business" }]));
  },
};
