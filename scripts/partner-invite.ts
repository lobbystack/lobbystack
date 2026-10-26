import { join } from "node:path";
import { parseArgs } from "node:util";

import { createDatabaseClient } from "@lobbystack/db";
import { createPartnerSignupInvitation } from "@lobbystack/domain";

import { writePrivateJson } from "./lib/private-artifact";

// Lets a company sign up as a partner while PARTNER_SIGNUP is invite. The
// link works once, for the email it names, for 7 days. It goes in a file only
// this user can read, so it never lands in shell history or logs.

function printUsage(): void {
  console.log(`Usage:
  pnpm partner-invite:create --email owner@acme.example

  --email  The address the company signs up with. They must verify it before the link works.

Writes the signup link to .partner-invites/<invitation id>.json. Send it to the
company, then delete the file.

Required env:
  DATABASE_URL or LOBBYSTACK_APP_DATABASE_URL
  APP_BASE_URL, so the link points at the dashboard
`);
}

async function main(): Promise<void> {
  const { values } = parseArgs({ args: process.argv.slice(2), strict: true, options: { email: { type: "string" }, help: { type: "boolean", short: "h" } } });
  if (values.help || !values.email) {
    printUsage();
    process.exitCode = values.help ? 0 : 1;
    return;
  }
  const app = createDatabaseClient("lobbystack_app");
  try {
    const invitation = await createPartnerSignupInvitation({ db: app.db }, { email: values.email });
    const secretFile = join(process.cwd(), ".partner-invites", `${invitation.invitationId}.json`);
    await writePrivateJson(secretFile, { email: values.email.trim().toLowerCase(), url: invitation.url, expiresAt: invitation.expiresAt.toISOString() });
    console.log(`Signup link written to ${secretFile}. It expires ${invitation.expiresAt.toISOString()}.`);
  } finally {
    await app.pool.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
