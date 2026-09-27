import { desc, eq, inArray } from "drizzle-orm";

// Local fixture for testing the Zapier integration (integrations/zapier)
// against a development stack. It creates one business that books instantly,
// with a service, a staff member, opening hours, an API key with every scope,
// and a second key with only knowledge:write. The keys below are fixed local
// test values: they only work against a database this script seeded, and the
// script refuses any non-local database.
//
// Run it with the same ENCRYPTION_KEY as the admin app, which peppers the key hash.
//
//   DATABASE_URL=postgres://postgres:...@127.0.0.1:5432/lobbystack pnpm zapier:seed-local
//   DATABASE_URL=... pnpm zapier:seed-local signed-delivery <webhook endpoint id>

export const ZAPIER_LOCAL_API_KEY = "lsk_2a91e0c7_zapierLocalDevOnlyKeyNotForProd1";
const PREFIX = "lsk_2a91e0c7";
export const ZAPIER_LOCAL_NARROW_API_KEY = "lsk_2a91e0c8_zapierLocalNarrowKeyKnowledgeOn1";
const NARROW_PREFIX = "lsk_2a91e0c8";
const SLUG = "zapier-local-e2e";

async function main(): Promise<void> {
  const raw = process.env.DATABASE_URL ?? "";
  const url = new URL(raw);
  if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
    throw new Error("seed-zapier-local only writes to a database on localhost.");
  }
  const { apiKeys, businessHours, businesses, createDatabaseClient, receptionistProfiles, services, staff, webhookDeliveries, webhookEndpoints, webhookEvents } = await import("@lobbystack/db");
  const { apiKeyScopes } = await import("@lobbystack/shared");
  const { hashApiKey } = await import("@lobbystack/domain");
  const database = createDatabaseClient("lobbystack_migrator", { DATABASE_URL: raw });
  try {
    const [command, endpointId] = process.argv.slice(2);
    if (command === "signed-delivery") {
      // Rebuilds the request the worker sends for the newest delivery to one
      // endpoint, signed with the endpoint's real secret by the server's own
      // signing code, so the Zapier trigger can verify it.
      if (!endpointId) throw new Error("Name an endpoint id.");
      const { decryptWebhookSecret, webhookHeaders } = await import("@lobbystack/domain");
      const [row] = await database.db.select({ eventId: webhookEvents.id, payload: webhookEvents.payload, encryptedSecret: webhookEndpoints.encryptedSecret })
        .from(webhookDeliveries)
        .innerJoin(webhookEndpoints, eq(webhookEndpoints.id, webhookDeliveries.endpointId))
        .innerJoin(webhookEvents, eq(webhookEvents.id, webhookDeliveries.eventId))
        .where(eq(webhookDeliveries.endpointId, endpointId))
        .orderBy(desc(webhookDeliveries.createdAt)).limit(1);
      if (!row) {
        console.log("null");
        return;
      }
      const body = JSON.stringify(row.payload);
      const headers = webhookHeaders({ secret: decryptWebhookSecret(row.encryptedSecret), id: row.eventId, timestamp: Math.floor(Date.now() / 1000), body });
      console.log(JSON.stringify({ headers, body }));
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
    await database.db.delete(apiKeys).where(inArray(apiKeys.prefix, [PREFIX, NARROW_PREFIX]));
    await database.db.insert(apiKeys).values([
      { businessId, name: "Zapier local test", prefix: PREFIX, keyHash: hashApiKey(ZAPIER_LOCAL_API_KEY), scopes: [...apiKeyScopes] },
      { businessId, name: "Zapier local test (knowledge only)", prefix: NARROW_PREFIX, keyHash: hashApiKey(ZAPIER_LOCAL_NARROW_API_KEY), scopes: ["knowledge:write"] },
    ]);
    console.log(JSON.stringify({ status: "seeded", businessId, keyPrefix: PREFIX }));
  } finally {
    await database.pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
