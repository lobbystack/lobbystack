import { createHash, randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { businesses, createDatabaseClient, partners, type Database, type DatabaseTransaction } from "@lobbystack/db";

import { brandForBusiness, brandForEmail, brandLogo, forgetCachedBrands, resolveHostBrand } from "./brands";

// Explicit opt-in only; never fall back to DATABASE_URL or load an env file.
const testUrl = process.env.LOBBYSTACK_RELIABILITY_TEST_DATABASE_URL;
if (testUrl) {
  const url = new URL(testUrl);
  if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) || !/test/i.test(url.pathname)) {
    throw new Error("Brand integration tests require a dedicated local test database.");
  }
}
const client = testUrl ? createDatabaseClient("lobbystack_migrator", { DATABASE_URL: testUrl }) : undefined;
afterAll(async () => { await client?.pool.end(); });

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 5, 6, 7, 8]);
const logoVersion = createHash("sha256").update(png).digest("hex");

async function rollbackTest(run: (tx: DatabaseTransaction) => Promise<void>) {
  const rollback = new Error("rollback test fixture");
  await expect(client!.db.transaction(async (tx) => {
    await run(tx);
    throw rollback;
  })).rejects.toBe(rollback);
}

/** A deployment whose first owner saved a name and logo, and a direct business and a partner's business on it. */
async function seed(tx: DatabaseTransaction, saved: { appName: string | null; logo: Uint8Array | null } | null) {
  await tx.execute(sql`reset role`);
  await tx.execute(sql`delete from public.deployment_branding`);
  if (saved) {
    await tx.execute(sql`insert into public.deployment_branding (id, app_name, logo, logo_content_type) values (1, ${saved.appName}, ${saved.logo ? Buffer.from(saved.logo) : null}::bytea, ${saved.logo ? "image/png" : null})`);
  }
  const directId = randomUUID();
  const partnerBusinessId = randomUUID();
  const partnerId = randomUUID();
  await tx.insert(partners).values({ id: partnerId, name: "Bright Desk", slug: `bright-${partnerId.slice(0, 8)}` });
  await tx.insert(businesses).values([
    { id: directId, slug: directId, name: "Direct shop", timezone: "UTC", businessType: "test", telemetryEnabled: false },
    { id: partnerBusinessId, slug: partnerBusinessId, name: "Partner shop", timezone: "UTC", businessType: "test", telemetryEnabled: false, partnerId },
  ]);
  const context = { db: tx as unknown as Database };
  const as = async (role: "lobbystack_app" | "lobbystack_worker") => {
    forgetCachedBrands();
    await tx.execute(sql.raw(`set local role ${role}`));
  };
  return { context, as, directId, partnerBusinessId, partnerId };
}

const savedBrand = {
  kind: "host",
  partnerId: null,
  name: "Acme Desk",
  logoUrl: `/api/branding/logo?v=${logoVersion}`,
  faviconUrl: `/api/branding/logo?v=${logoVersion}`,
  color: null,
  origin: "https://desk.example.test",
};

beforeEach(() => {
  vi.stubEnv("APP_BASE_URL", "https://desk.example.test/");
  vi.stubEnv("DEPLOYMENT_MODE", "self_hosted_standard");
  vi.stubEnv("BRAND_APP_NAME", "");
  vi.stubEnv("BRAND_LOGO_URL", "");
  vi.stubEnv("EMAIL_FROM", "Acme Desk <no-reply@desk.example.test>");
  vi.stubEnv("EMAIL_REPLY_TO", "help@desk.example.test");
});
afterEach(() => {
  vi.unstubAllEnvs();
  forgetCachedBrands();
});

describe.skipIf(!testUrl)("brands", () => {
  it("answers every hostname and every business with the host brand from deployment branding", async () => {
    await rollbackTest(async (tx) => {
      const fixture = await seed(tx, { appName: "Acme Desk", logo: png });
      for (const role of ["lobbystack_app", "lobbystack_worker"] as const) {
        await fixture.as(role);
        // Each lookup starts with nothing cached, so it reads deployment_branding as this role.
        for (const host of ["desk.example.test", "desk.example.test:3000", "localhost", "preview-123.up.railway.app", "unknown.example"]) {
          forgetCachedBrands();
          expect(await resolveHostBrand(fixture.context, host), `${role} ${host}`).toMatchObject(savedBrand);
        }
        // A business with a partner shows the host brand too until partners have brands.
        for (const businessId of [fixture.directId, fixture.partnerBusinessId, randomUUID()]) {
          forgetCachedBrands();
          expect(await brandForBusiness(fixture.context, businessId), `${role} ${businessId}`).toMatchObject(savedBrand);
        }
      }
    });
  });

  it("sends a business's emails under the host brand, with the host's sender and Reply-To, and a partner's own under its name", async () => {
    await rollbackTest(async (tx) => {
      const fixture = await seed(tx, { appName: "Acme Desk", logo: null });
      await fixture.as("lobbystack_worker");
      const host = await brandForEmail(fixture.context, { kind: "host" });
      forgetCachedBrands();
      const business = await brandForEmail(fixture.context, { kind: "business", businessId: fixture.partnerBusinessId });
      forgetCachedBrands();
      const partner = await brandForEmail(fixture.context, { kind: "partner", partnerId: fixture.partnerId });
      expect(business).not.toBe(host);
      expect(business).toEqual(host);
      expect(host).toMatchObject({ name: "Acme Desk", logoUrl: null, email: { fromName: "Acme Desk", fromAddress: "no-reply@desk.example.test", replyTo: "help@desk.example.test" } });
      // A partner's own emails, such as invitations to its team, carry its name and link to the host's domain.
      expect(partner).toMatchObject({ kind: "partner", partnerId: fixture.partnerId, name: "Bright Desk", logoUrl: null, origin: host.origin, email: { fromName: "Bright Desk", fromAddress: "no-reply@desk.example.test", replyTo: null } });
    });
  });

  it("serves the saved logo the host brand points at", async () => {
    await rollbackTest(async (tx) => {
      const fixture = await seed(tx, { appName: null, logo: png });
      await fixture.as("lobbystack_app");
      const brand = await resolveHostBrand(fixture.context, "desk.example.test");
      expect(brand).toMatchObject({ name: "LobbyStack", logoUrl: `/api/branding/logo?v=${logoVersion}` });
      const logo = await brandLogo(fixture.context, brand!);
      expect(logo && new Uint8Array(logo.bytes)).toEqual(png);
      expect(logo).toMatchObject({ contentType: "image/png", version: logoVersion });
    });
  });

  it("keeps LobbyStack until something is saved, and lets the environment win field by field", async () => {
    await rollbackTest(async (tx) => {
      const fixture = await seed(tx, null);
      await fixture.as("lobbystack_app");
      expect(await resolveHostBrand(fixture.context, "desk.example.test")).toMatchObject({ name: "LobbyStack", logoUrl: null });

      await tx.execute(sql`reset role`);
      await tx.execute(sql`insert into public.deployment_branding (id, app_name, logo, logo_content_type) values (1, 'Acme Desk', ${Buffer.from(png)}::bytea, 'image/png')`);
      vi.stubEnv("BRAND_APP_NAME", "Front Desk");
      await fixture.as("lobbystack_app");
      expect(await resolveHostBrand(fixture.context, "desk.example.test")).toMatchObject({ name: "Front Desk", logoUrl: `/api/branding/logo?v=${logoVersion}` });
    });
  });

  it("ignores the saved choice on the cloud", async () => {
    await rollbackTest(async (tx) => {
      const fixture = await seed(tx, { appName: "Acme Desk", logo: png });
      vi.stubEnv("DEPLOYMENT_MODE", "cloud");
      await fixture.as("lobbystack_worker");
      expect(await brandForBusiness(fixture.context, fixture.directId)).toMatchObject({ name: "LobbyStack", logoUrl: null });
    });
  });

  it("shows a newly saved choice once the cache is cleared", async () => {
    await rollbackTest(async (tx) => {
      const fixture = await seed(tx, null);
      await fixture.as("lobbystack_app");
      expect((await resolveHostBrand(fixture.context, "desk.example.test"))?.name).toBe("LobbyStack");
      await tx.execute(sql`reset role`);
      await tx.execute(sql`insert into public.deployment_branding (id, app_name) values (1, 'Acme Desk')`);
      await tx.execute(sql`set local role lobbystack_app`);
      // Within the cache's life a process keeps its answer; clearing it shows the save.
      expect((await resolveHostBrand(fixture.context, "desk.example.test"))?.name).toBe("LobbyStack");
      forgetCachedBrands();
      expect((await resolveHostBrand(fixture.context, "desk.example.test"))?.name).toBe("Acme Desk");
    });
  });
});
