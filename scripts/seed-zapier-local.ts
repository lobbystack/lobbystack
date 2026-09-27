import { and, desc, eq } from "drizzle-orm";

// Local fixture for testing the Zapier integration (integrations/zapier)
// against a development stack. It creates one business that books instantly,
// with a service, a staff member, opening hours and an API key with every
// scope. The key below is a fixed local test value: it only works against a
// database this script seeded, and the script refuses any non-local database.
//
// Run it with the same ENCRYPTION_KEY as the admin app, which peppers the key hash.
//
//   DATABASE_URL=postgres://postgres:...@127.0.0.1:5432/lobbystack pnpm zapier:seed-local
//   DATABASE_URL=... pnpm zapier:seed-local latest-event contact.created

export const ZAPIER_LOCAL_API_KEY = "lsk_2a91e0c7_zapierLocalDevOnlyKeyNotForProd1";
const PREFIX = "lsk_2a91e0c7";
const SLUG = "zapier-local-e2e";

async function main(): Promise<void> {
  const raw = process.env.DATABASE_URL ?? "";
  const url = new URL(raw);
  if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
    throw new Error("seed-zapier-local only writes to a database on localhost.");
  }
  const { apiKeys, businessHours, businesses, createDatabaseClient, receptionistProfiles, services, staff, webhookEvents } = await import("@lobbystack/db");
  const { apiKeyScopes } = await import("@lobbystack/shared");
  const { hashApiKey } = await import("@lobbystack/domain");
  const database = createDatabaseClient("lobbystack_migrator", { DATABASE_URL: raw });
  try {
    const [command, eventType] = process.argv.slice(2);
    if (command === "latest-event") {
      const [business] = await database.db.select({ id: businesses.id }).from(businesses).where(eq(businesses.slug, SLUG));
      if (!business || !eventType) throw new Error("Seed first, and name an event type.");
      const [event] = await database.db.select({ payload: webhookEvents.payload }).from(webhookEvents)
        .where(and(eq(webhookEvents.businessId, business.id), eq(webhookEvents.type, eventType)))
        .orderBy(desc(webhookEvents.createdAt)).limit(1);
      console.log(JSON.stringify(event?.payload ?? null));
      return;
    }

    const businessId = await database.db.transaction(async (tx) => {
      const [existing] = await tx.select({ id: businesses.id }).from(businesses).where(eq(businesses.slug, SLUG));
      if (existing) return existing.id;
      const [business] = await tx.insert(businesses).values({ slug: SLUG, name: "Zapier Local Test Clinic", timezone: "America/Toronto", defaultLocale: "en", businessType: "service_company", deploymentMode: "development", onboardingStage: "complete" }).returning({ id: businesses.id });
      const id = business!.id;
      await tx.insert(receptionistProfiles).values({ businessId: id, greeting: "Hi", tone: "warm", summary: "Zapier local test", bookingPolicy: "Book", transferMode: "never", bookingMode: "instant" });
      await tx.insert(staff).values({ businessId: id, name: "Alex Morgan", timezone: "America/Toronto" });
      await tx.insert(services).values({ businessId: id, name: "Consultation", slug: "consultation", durationMinutes: 30 });
      await tx.insert(businessHours).values(Array.from({ length: 7 }, (_, dayOfWeek) => ({ businessId: id, dayOfWeek, openMinutes: 8 * 60, closeMinutes: 20 * 60 })));
      return id;
    });
    const keyHash = hashApiKey(ZAPIER_LOCAL_API_KEY);
    await database.db.delete(apiKeys).where(eq(apiKeys.prefix, PREFIX));
    await database.db.insert(apiKeys).values({ businessId, name: "Zapier local test", prefix: PREFIX, keyHash, scopes: [...apiKeyScopes] });
    console.log(JSON.stringify({ status: "seeded", businessId, keyPrefix: PREFIX }));
  } finally {
    await database.pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
