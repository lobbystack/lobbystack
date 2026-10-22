import { join } from "node:path";
import { parseArgs } from "node:util";

import { generatePlatformKey, parsePlatformKeys, rootCredentialWarning, type PlatformKeyAccess } from "../packages/domain/src/server/publicApi/platformKeys";
import { writePrivateJson } from "./lib/private-artifact";

// Makes a platform API key for PLATFORM_API_KEYS. No database access: the key
// is shown once, in a file only this user can read, and the entry printed here
// holds only its hash.

function printUsage(): void {
  console.log(`Usage:
  pnpm platform-key:create --name "AlloPlace CLI" --partner alloplace --owner-email ops@example.com [--create-businesses] [--create-users] [--access all] [--scope business:read --scope business:write]

  --partner            Who the key belongs to: 1 to 40 lowercase letters, digits or hyphens. Audit rows and logs record it.
  --owner-email        The LobbyStack account the key acts as. It must sign up and verify this email before the key works.
  --access             partner (default): only businesses this partner onboards. all: every business, as the owner account,
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

async function main(): Promise<void> {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    strict: true,
    options: {
      name: { type: "string" },
      partner: { type: "string" },
      "owner-email": { type: "string" },
      access: { type: "string" },
      scope: { type: "string", multiple: true },
      "create-businesses": { type: "boolean" },
      "create-users": { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
  });
  if (values.help) {
    printUsage();
    return;
  }
  if (!values.name || !values.partner || !values["owner-email"]) {
    printUsage();
    process.exitCode = 1;
    return;
  }
  if (values.access !== undefined && values.access !== "partner" && values.access !== "all") throw new Error("--access must be partner or all.");
  if (values.scope?.length && (values["create-businesses"] || values["create-users"])) throw new Error("--create-businesses and --create-users add to the default scopes. With --scope, list businesses:create or users:create there instead.");

  // Check the current value first, so a broken PLATFORM_API_KEYS is never extended.
  const existingRaw = process.env.PLATFORM_API_KEYS?.trim() ?? "";
  parsePlatformKeys(existingRaw);
  const existing = existingRaw ? JSON.parse(existingRaw) as unknown[] : [];

  const { key, entry } = generatePlatformKey({
    name: values.name,
    partner: values.partner,
    ownerEmail: values["owner-email"],
    ...(values.access ? { access: values.access as PlatformKeyAccess } : {}),
    ...(values.scope?.length ? { scopes: values.scope } : {}),
    platformScopes: [...(values["create-businesses"] ? ["businesses:create" as const] : []), ...(values["create-users"] ? ["users:create" as const] : [])],
  });

  const secretFile = join(process.cwd(), ".platform-keys", `${entry.prefix}.json`);
  await writePrivateJson(secretFile, { key, entry });

  const warning = rootCredentialWarning(entry);
  if (warning) console.warn(`${warning}\n`);
  console.log(`Key written to ${secretFile}. Send it to its holder securely, then delete the file.\n`);
  console.log("New entry:");
  console.log(JSON.stringify(entry, null, 2));
  if (existing.length) {
    console.log(`\nSet PLATFORM_API_KEYS on the admin to its ${existing.length} current ${existing.length === 1 ? "entry" : "entries"} plus this one:`);
  } else {
    // Only this shell's value is visible here, not the admin's.
    console.log("\nPLATFORM_API_KEYS isn't set in this shell. If the admin already has platform keys, add the entry above to its array; replacing the value would revoke them. With no keys yet, set it to:");
  }
  console.log(JSON.stringify([...existing, entry]));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
