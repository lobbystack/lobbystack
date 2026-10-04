import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, realpath } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { writePrivateJson } from "./lib/private-artifact";

async function main(): Promise<void> {
  const base = new URL(process.env.PLAYWRIGHT_BASE_URL ?? "");
  if (!["localhost", "127.0.0.1", "[::1]"].includes(base.hostname) || base.protocol !== "http:") throw new Error("Fixture signup is restricted to an explicit localhost server");
  if (process.env.RELEASE_E2E_WORKER_PAUSED !== "1" || !process.env.BETTER_AUTH_SECRET) throw new Error("Paused worker and a stable test auth secret are required");
  const expectedVersion = process.env.RELEASE_E2E_SERVER_VERSION;
  if (!expectedVersion?.startsWith("release-e2e-")) throw new Error("An explicit release-e2e server identity is required");
  const health = await fetch(new URL("/api/health/live", base), { signal: AbortSignal.timeout(5000), redirect: "error" });
  const identity = await health.json() as { version?: string };
  if (!health.ok || identity.version !== expectedVersion) throw new Error("Fixture server identity mismatch");
  const directory = process.env.RELEASE_FIXTURE_DIRECTORY;
  if (!directory) throw new Error("RELEASE_FIXTURE_DIRECTORY is required");
  await mkdir(directory, { mode: 0o700 }); // Refuse an existing fixture directory.
  const root = await realpath(resolve(directory));
  const emails = [process.env.RELEASE_E2E_FR_EMAIL, process.env.RELEASE_E2E_EN_EMAIL];
  if (emails.some((email) => !email || !/^[a-z0-9._+-]+@example\.invalid$/i.test(email)) || emails[0] === emails[1]) throw new Error("Two distinct example.invalid fixture emails are required");
  if (process.env.PROSPECT_DEMO_OPERATOR_EMAIL !== emails[0]) throw new Error("The FR fixture must be the configured demo operator");
  // Writes go through the same roles the app uses: auth owns users, the worker owns tenant rows.
  for (const name of ["LOBBYSTACK_AUTH_DATABASE_URL", "LOBBYSTACK_WORKER_DATABASE_URL"]) {
    const url = new URL(process.env[name] ?? "");
    if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || !url.pathname.startsWith("/parity_cert_")) throw new Error(`Fixture writes require ${name} on a local parity_cert_ database`);
  }
  const { createDatabaseClient, businesses, businessMemberships, users, withBusinessTransaction } = await import("@lobbystack/db");
  const { and, eq } = await import("drizzle-orm");
  const auth = createDatabaseClient("lobbystack_auth");
  const worker = createDatabaseClient("lobbystack_worker");
  const browser = await chromium.launch();
  const fixtures: Record<string, { userId: string; businessId: string; email: string; storageState: string }> = {};
  try {
    for (const [index, locale] of ["fr", "en"].entries()) {
      const context = await browser.newContext({ baseURL: base.origin, locale });
      try {
        const email = emails[index]!;
        const password = `Fixture-${randomBytes(24).toString("hex")}!`;
        // A distinct client IP per fixture keeps signup and sign-in out of the shared rate-limit bucket.
        const headers = { origin: base.origin, "accept-language": locale, "x-real-ip": `198.19.0.${index + 1}` };
        const response = await context.request.post("/api/auth/sign-up/email", { headers, data: { email, password, name: `Release fixture ${locale}` } });
        if (!response.ok()) throw new Error(`Fixture signup rejected (${response.status()}); no response body logged`);
        const result = await response.json() as { user?: { id?: string } };
        if (!result.user?.id) throw new Error("Fixture signup did not return a user ID");
        const userId = result.user.id;
        // Signup does not start a session, and fixtures skip the emailed code.
        const verified = await auth.db.update(users).set({ emailVerified: true }).where(and(eq(users.id, userId), eq(users.normalizedEmail, email.toLowerCase()))).returning({ id: users.id });
        if (verified.length !== 1) throw new Error("Fixture HTTP server and database identities disagree");
        const signIn = await context.request.post("/api/auth/sign-in/email", { headers, data: { email, password } });
        if (!signIn.ok()) throw new Error(`Fixture sign-in rejected (${signIn.status()})`);
        const preference = await context.request.patch("/api/preferences/locale", { headers, data: { locale } });
        if (!preference.ok()) throw new Error("Fixture locale preference could not be persisted");
        const businessId = randomUUID();
        await withBusinessTransaction(worker.db, { businessId, actorType: "worker" }, async (tx) => {
          await tx.insert(businesses).values({ id: businessId, slug: `release-fixture-${locale}-${businessId}`, name: `Release fixture ${locale}`, timezone: "UTC", defaultLocale: locale, businessType: "service_company", deploymentMode: "self_hosted_standard", onboardingStage: "complete" });
          await tx.insert(businessMemberships).values({ businessId, userId, role: "business_owner", status: "active" });
        });
        await auth.db.update(users).set({ activeBusinessId: businessId }).where(eq(users.id, userId));
        await context.addCookies([{ name: "lobbystack.locale", value: locale, url: base.origin }]);
        const storageState = `${root}/operator-${locale}.json`;
        await writePrivateJson(storageState, await context.storageState());
        fixtures[locale] = { userId, businessId, email, storageState };
      } finally { await context.close(); }
    }
    await writePrivateJson(`${root}/fixtures.json`, fixtures);
    console.log(JSON.stringify({ status: "fixtures-created", locales: Object.keys(fixtures), productionChanged: false }));
  } finally { await browser.close(); await auth.pool.end(); await worker.pool.end(); }
}

void main().catch((error) => { console.error(error instanceof Error ? error.message : "Fixture creation failed"); process.exitCode = 1; });
