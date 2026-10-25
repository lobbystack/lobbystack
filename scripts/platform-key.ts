import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import { generatePlatformKey, parsePlatformKeys, rootCredentialWarning, type PlatformKeyAccess, type PlatformKeyEntry } from "../packages/domain/src/server/publicApi/platformKeys";
import { writePrivateJson } from "./lib/private-artifact";

// Makes a platform API key for PLATFORM_API_KEYS. No database access: the key
// is shown once, in a file only this user can read, and the entry printed here
// holds only its hash.

function printUsage(): void {
  console.log(`Usage:
  pnpm platform-key:create --name "AlloPlace CLI" --group alloplace --owner-email ops@example.com [--create-businesses] [--create-users] [--access all] [--scope business:read --scope business:write]

  --group              The group the key belongs to: 1 to 40 lowercase letters, digits or hyphens. Keys in the same group
                       reach the same businesses. Audit rows and logs record it.
  --owner-email        The LobbyStack account the key acts as. It must sign up and verify this email before the key works.
  --access             group (default): only businesses this group's keys onboard. all: every business, as the owner account,
                       which makes the key and that account root credentials.
  --create-businesses  Also grant businesses:create, so the key can make businesses with POST /businesses.
  --create-users       Also grant users:create, so the key can email sign-up invitations with POST /users.
  --scope              Repeat for each scope, platform-only ones included. Leave it out for every scope a business's own key can hold today,
                       plus those the two flags above add. Scopes added later must be added to the entry by hand.

Writes the key to .platform-keys/<prefix>.json and prints the PLATFORM_API_KEYS
value with the new entry added. Run it with the admin's current PLATFORM_API_KEYS
in the environment so the printed value keeps the existing keys.
`);
}

export type PlatformKeyCommand =
  | { kind: "usage"; exitCode: 0 | 1 }
  | { kind: "key"; key: string; entry: PlatformKeyEntry; existing: unknown[] };

/**
 * Reads the command line, checks the admin's current PLATFORM_API_KEYS and
 * makes the key. existing holds the current entries as they are, so the
 * printed value never rewrites an entry that still says partner.
 */
export function createPlatformKey(args: string[], existingRaw: string): PlatformKeyCommand {
  const { values } = parseArgs({
    args,
    strict: true,
    options: {
      name: { type: "string" },
      group: { type: "string" },
      "owner-email": { type: "string" },
      access: { type: "string" },
      scope: { type: "string", multiple: true },
      "create-businesses": { type: "boolean" },
      "create-users": { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
  });
  if (values.help) return { kind: "usage", exitCode: 0 };
  if (!values.name || !values.group || !values["owner-email"]) return { kind: "usage", exitCode: 1 };
  if (values.access !== undefined && values.access !== "group" && values.access !== "all") throw new Error("--access must be group or all.");
  if (values.scope?.length && (values["create-businesses"] || values["create-users"])) throw new Error("--create-businesses and --create-users add to the default scopes. With --scope, list businesses:create or users:create there instead.");

  // Check the current value first, so a broken PLATFORM_API_KEYS is never extended.
  parsePlatformKeys(existingRaw);
  const existing = existingRaw ? JSON.parse(existingRaw) as unknown[] : [];

  const { key, entry } = generatePlatformKey({
    name: values.name,
    group: values.group,
    ownerEmail: values["owner-email"],
    ...(values.access ? { access: values.access as PlatformKeyAccess } : {}),
    ...(values.scope?.length ? { scopes: values.scope } : {}),
    platformScopes: [...(values["create-businesses"] ? ["businesses:create" as const] : []), ...(values["create-users"] ? ["users:create" as const] : [])],
  });
  return { kind: "key", key, entry, existing };
}

async function main(): Promise<void> {
  const command = createPlatformKey(process.argv.slice(2), process.env.PLATFORM_API_KEYS?.trim() ?? "");
  if (command.kind === "usage") {
    printUsage();
    process.exitCode = command.exitCode;
    return;
  }
  const { key, entry, existing } = command;

  const secretFile = join(process.cwd(), ".platform-keys", `${entry.prefix}.json`);
  await writePrivateJson(secretFile, { key, entry });

  const warning = rootCredentialWarning(entry);
  if (warning) console.warn(`${warning}\n`);
  console.log(`Key written to ${secretFile}. Send it to its holder securely, then delete the file.\n`);
  console.log("New entry:");
  console.log(JSON.stringify(entry, null, 2));
  // The entry names its group in group, which admins from before the rename refuse.
  console.log("\nAn admin from before the group rename refuses this entry, and with it every key in PLATFORM_API_KEYS. Update the admin before you add it.");
  if (existing.length) {
    console.log(`\nSet PLATFORM_API_KEYS on the admin to its ${existing.length} current ${existing.length === 1 ? "entry" : "entries"} plus this one:`);
  } else {
    // Only this shell's value is visible here, not the admin's.
    console.log("\nPLATFORM_API_KEYS isn't set in this shell. If the admin already has platform keys, add the entry above to its array; replacing the value would revoke them. With no keys yet, set it to:");
  }
  console.log(JSON.stringify([...existing, entry]));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
