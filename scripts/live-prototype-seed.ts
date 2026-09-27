// Creates a local test operator and business for the GPT-Live prototype:
// weekday hours, one service, one staff member, and a published snapshot.
// Local only. The login is appended to the gitignored .env.local.
import { randomBytes, randomUUID } from "node:crypto";
import { appendFile } from "node:fs/promises";
import { resolve } from "node:path";

const LOCAL_HOSTS = ["localhost", "127.0.0.1", "[::1]"];

async function main(): Promise<void> {
  const base = new URL(process.env.APP_BASE_URL ?? "http://localhost:3000");
  const databaseUrl = new URL(process.env.LOBBYSTACK_MIGRATOR_DATABASE_URL ?? process.env.DATABASE_URL ?? "");
  if (!LOCAL_HOSTS.includes(base.hostname) || !LOCAL_HOSTS.includes(databaseUrl.hostname)) throw new Error("This seed only runs against a local app and database.");

  const email = `live-prototype-${randomBytes(4).toString("hex")}@example.invalid`;
  const password = `Proto-${randomBytes(18).toString("hex")}!`;
  const signUp = await fetch(new URL("/api/auth/sign-up/email", base), {
    method: "POST",
    headers: { "content-type": "application/json", origin: base.origin },
    body: JSON.stringify({ email, password, name: "Live prototype" }),
  });
  if (!signUp.ok) throw new Error(`Sign-up failed with status ${signUp.status}.`);
  const userId = ((await signUp.json()) as { user?: { id?: string } }).user?.id;
  if (!userId) throw new Error("Sign-up returned no user ID.");

  const db = await import("@lobbystack/db");
  const { eq } = await import("drizzle-orm");
  const { refreshBusinessSnapshot } = await import("@lobbystack/domain");
  const migrator = db.createDatabaseClient("lobbystack_migrator");
  const worker = db.createDatabaseClient("lobbystack_worker");
  const businessId = randomUUID();
  try {
    await migrator.db.transaction(async (tx) => {
      await tx.insert(db.businesses).values({ id: businessId, slug: `live-prototype-${businessId.slice(0, 8)}`, name: "Northside Plumbing", timezone: "America/Toronto", defaultLocale: "en", businessType: "service_company", deploymentMode: "development", onboardingStage: "complete" });
      await tx.insert(db.businessMemberships).values({ businessId, userId, role: "business_owner", status: "active" });
      await tx.update(db.users).set({ activeBusinessId: businessId, emailVerified: true }).where(eq(db.users.id, userId));
      await tx.insert(db.businessHours).values([1, 2, 3, 4, 5].map((dayOfWeek) => ({ businessId, dayOfWeek, openMinutes: 8 * 60, closeMinutes: 17 * 60 })));
      const [service] = await tx.insert(db.services).values({ businessId, name: "Drain cleaning", slug: "drain-cleaning", durationMinutes: 60, description: "Clearing blocked sinks, tubs and floor drains." }).returning({ id: db.services.id });
      const [member] = await tx.insert(db.staff).values({ businessId, name: "Northside Plumbing", timezone: "America/Toronto" }).returning({ id: db.staff.id });
      if (!service || !member) throw new Error("Seed rows were not created.");
      await tx.insert(db.staffServiceAssignments).values({ businessId, staffId: member.id, serviceId: service.id });
    });
    await refreshBusinessSnapshot({ db: worker.db }, { businessId });
  } finally {
    await Promise.all([migrator.pool.end(), worker.pool.end()]);
  }

  await appendFile(resolve(process.cwd(), ".env.local"), `LIVE_PROTOTYPE_TEST_EMAIL=${email}\nLIVE_PROTOTYPE_TEST_PASSWORD=${password}\nLIVE_PROTOTYPE_TEST_BUSINESS_ID=${businessId}\n`);
  console.log(JSON.stringify({ status: "seeded", businessId, credentials: ".env.local" }));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
