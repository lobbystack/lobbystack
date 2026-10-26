import { createHash, randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";

import { sql } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { businesses, createDatabaseClient, partnerDomains, partners, type Database, type DatabaseTransaction } from "@lobbystack/db";

import { deploymentAppName } from "./branding";
import { brandChangesChannel, brandForBusiness, brandForEmail, brandForHostReference, brandLogo, forgetCachedBrands, listenForBrandChanges, resolveHostBrand, type BrandChangeSubscriber } from "./brands";

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
const favicon = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9, 9, 9]);
const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const logoVersion = digest(png);

async function rollbackTest(run: (tx: DatabaseTransaction) => Promise<void>) {
  const rollback = new Error("rollback test fixture");
  await expect(client!.db.transaction(async (tx) => {
    await run(tx);
    throw rollback;
  })).rejects.toBe(rollback);
}

/**
 * A deployment whose first owner saved a name and logo, a partner with a
 * brand and a subdomain under portal.example.test, and a direct business and
 * a partner's business on it.
 */
async function seed(tx: DatabaseTransaction, saved: { appName: string | null; logo: Uint8Array | null } | null) {
  await tx.execute(sql`reset role`);
  await tx.execute(sql`delete from public.deployment_branding`);
  if (saved) {
    await tx.execute(sql`insert into public.deployment_branding (id, app_name, logo, logo_content_type) values (1, ${saved.appName}, ${saved.logo ? Buffer.from(saved.logo) : null}::bytea, ${saved.logo ? "image/png" : null})`);
  }
  const directId = randomUUID();
  const partnerBusinessId = randomUUID();
  const partnerId = randomUUID();
  const slug = `bright-${partnerId.slice(0, 8)}`;
  const subdomain = `${slug}.portal.example.test`;
  await tx.insert(partners).values({
    id: partnerId,
    name: "Bright Desk",
    slug,
    logo: Buffer.from(png),
    logoContentType: "image/png",
    favicon: Buffer.from(favicon),
    faviconContentType: "image/png",
    brandColor: "#0f766e",
    termsUrl: "https://bright.example.test/terms",
    privacyUrl: "https://bright.example.test/privacy",
    supportEmail: "help@bright.example.test",
  });
  await tx.insert(partnerDomains).values({ partnerId, hostname: subdomain, kind: "subdomain", verifiedAt: new Date() });
  await tx.insert(businesses).values([
    { id: directId, slug: directId, name: "Direct shop", timezone: "UTC", businessType: "test", telemetryEnabled: false },
    { id: partnerBusinessId, slug: partnerBusinessId, name: "Partner shop", timezone: "UTC", businessType: "test", telemetryEnabled: false, partnerId },
  ]);
  const context = { db: tx as unknown as Database };
  const as = async (role: "lobbystack_app" | "lobbystack_worker") => {
    forgetCachedBrands();
    await tx.execute(sql.raw(`set local role ${role}`));
  };
  /** Runs a write as the migrator, as another process would, without telling this one's cache. */
  const elsewhere = async (write: () => Promise<unknown>, role: "lobbystack_app" | "lobbystack_worker" = "lobbystack_app") => {
    await tx.execute(sql`reset role`);
    await write();
    await tx.execute(sql.raw(`set local role ${role}`));
  };
  return { context, as, elsewhere, directId, partnerBusinessId, partnerId, slug, subdomain };
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

/** A Redis subscriber that delivers what a test publishes. */
function fakeSubscriber() {
  const emitter = new EventEmitter();
  const subscribed: string[] = [];
  const subscriber: BrandChangeSubscriber = {
    status: "ready",
    subscribe: async (channel) => { subscribed.push(channel); },
    on: ((event: string, listener: Parameters<EventEmitter["on"]>[1]) => emitter.on(event, listener)) as BrandChangeSubscriber["on"],
  };
  return { subscriber, subscribed, deliver: (message: string) => emitter.emit("message", brandChangesChannel(), message), reconnect: () => emitter.emit("ready") };
}

/** Turns on partners' own domains, which the Cloudflare for SaaS credentials do. */
function customDomainsOn() {
  vi.stubEnv("CLOUDFLARE_SAAS_API_TOKEN", "test-token");
  vi.stubEnv("CLOUDFLARE_SAAS_ZONE_ID", "test-zone");
}

beforeEach(() => {
  vi.stubEnv("APP_BASE_URL", "https://desk.example.test/");
  vi.stubEnv("CLOUDFLARE_SAAS_API_TOKEN", "");
  vi.stubEnv("CLOUDFLARE_SAAS_ZONE_ID", "");
  vi.stubEnv("CADDY_ON_DEMAND_TLS", "");
  vi.stubEnv("DEPLOYMENT_MODE", "self_hosted_standard");
  vi.stubEnv("BRAND_APP_NAME", "");
  vi.stubEnv("BRAND_LOGO_URL", "");
  vi.stubEnv("EMAIL_FROM", "Acme Desk <no-reply@desk.example.test>");
  vi.stubEnv("EMAIL_REPLY_TO", "help@desk.example.test");
  vi.stubEnv("PARTNER_BASE_DOMAIN", "portal.example.test");
  vi.stubEnv("MARKETING_HOSTS", "www.example.test");
  vi.stubEnv("AUTH_TRUSTED_ORIGINS", "https://alias.example.test,*.wild.example.test");
  vi.stubEnv("ALLOWED_DEV_ORIGINS", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
  forgetCachedBrands();
});

describe.skipIf(!testUrl)("brands on the host's own domain", () => {
  it("answers the host's hostnames with the host brand from deployment branding, as either runtime role", async () => {
    await rollbackTest(async (tx) => {
      const fixture = await seed(tx, { appName: "Acme Desk", logo: png });
      for (const role of ["lobbystack_app", "lobbystack_worker"] as const) {
        await fixture.as(role);
        // Each lookup starts with nothing cached, so it reads deployment_branding as this role.
        for (const host of ["desk.example.test", "DESK.example.test.:443", "www.example.test", "alias.example.test", "localhost:3000", "127.0.0.1:13000", "[::1]:3000"]) {
          forgetCachedBrands();
          expect(await resolveHostBrand(fixture.context, host), `${role} ${host}`).toMatchObject(savedBrand);
        }
        for (const businessId of [fixture.directId, randomUUID()]) {
          forgetCachedBrands();
          expect(await brandForBusiness(fixture.context, businessId), `${role} ${businessId}`).toMatchObject(savedBrand);
        }
      }
    });
  });

  it("counts loopback hostnames as the host's only outside production, and development tunnels only in development", async () => {
    await rollbackTest(async (tx) => {
      const fixture = await seed(tx, { appName: "Acme Desk", logo: null });
      await fixture.as("lobbystack_app");
      vi.stubEnv("ALLOWED_DEV_ORIGINS", "*.ngrok-free.app");
      expect(await resolveHostBrand(fixture.context, "abc.ngrok-free.app")).toMatchObject({ kind: "host" });
      vi.stubEnv("NODE_ENV", "production");
      forgetCachedBrands();
      for (const host of ["localhost:3000", "127.0.0.1", "abc.ngrok-free.app"]) expect(await resolveHostBrand(fixture.context, host), host).toBeNull();
      expect(await resolveHostBrand(fixture.context, "desk.example.test")).toMatchObject({ kind: "host" });
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
      await fixture.elsewhere(() => tx.execute(sql`insert into public.deployment_branding (id, app_name) values (1, 'Acme Desk')`));
      // Within the cache's life a process keeps its answer; clearing it shows the save.
      expect((await resolveHostBrand(fixture.context, "desk.example.test"))?.name).toBe("LobbyStack");
      forgetCachedBrands();
      expect((await resolveHostBrand(fixture.context, "desk.example.test"))?.name).toBe("Acme Desk");
    });
  });

  it("never lets a partner's brand replace the name texts use", async () => {
    await rollbackTest(async (tx) => {
      const fixture = await seed(tx, { appName: "Acme Desk", logo: null });
      for (const role of ["lobbystack_app", "lobbystack_worker"] as const) {
        await fixture.as(role);
        expect((await brandForBusiness(fixture.context, fixture.partnerBusinessId)).name).toBe("Bright Desk");
        expect(await deploymentAppName(tx)).toBe("Acme Desk");
      }
    });
  });
});

describe.skipIf(!testUrl)("brands on a partner's domain", () => {
  it("answers the partner's subdomain with the partner's brand, whatever the case, trailing dot or port", async () => {
    await rollbackTest(async (tx) => {
      const fixture = await seed(tx, { appName: "Acme Desk", logo: png });
      await fixture.as("lobbystack_app");
      const brand = await resolveHostBrand(fixture.context, fixture.subdomain);
      expect(brand).toEqual({
        kind: "partner",
        partnerId: fixture.partnerId,
        name: "Bright Desk",
        logoUrl: `/api/branding/logo?partner=${fixture.partnerId}&v=${logoVersion}`,
        faviconUrl: `/api/branding/logo?partner=${fixture.partnerId}&image=favicon&v=${digest(favicon)}`,
        color: "#0f766e",
        origin: `https://${fixture.subdomain}`,
        links: { website: null, terms: "https://bright.example.test/terms", privacy: "https://bright.example.test/privacy", support: "mailto:help@bright.example.test" },
        email: { fromName: "Bright Desk", fromAddress: "no-reply@portal.example.test", replyTo: "help@bright.example.test" },
      });
      for (const host of [fixture.subdomain.toUpperCase(), `${fixture.subdomain}.`, `${fixture.subdomain}:443`]) {
        forgetCachedBrands();
        expect(await resolveHostBrand(fixture.context, host), host).toEqual(brand);
      }
    });
  });

  it("gives pages and routes the brand the proxy resolved, by reference alone", async () => {
    await rollbackTest(async (tx) => {
      const fixture = await seed(tx, { appName: "Acme Desk", logo: png });
      await fixture.as("lobbystack_app");
      expect(await brandForHostReference(fixture.context, { kind: "partner", partnerId: fixture.partnerId })).toEqual(await resolveHostBrand(fixture.context, fixture.subdomain));
      expect(await brandForHostReference(fixture.context, { kind: "host" })).toEqual(await resolveHostBrand(fixture.context, "desk.example.test"));
      // A partner that no longer exists has no brand, rather than the host's.
      expect(await brandForHostReference(fixture.context, { kind: "partner", partnerId: randomUUID() })).toBeNull();
    });
  });

  it("answers any other hostname with no brand, never the host's", async () => {
    await rollbackTest(async (tx) => {
      const fixture = await seed(tx, { appName: "Acme Desk", logo: null });
      await fixture.as("lobbystack_app");
      const hosts = ["unknown.portal.example.test", "portal.example.test", `x.${fixture.subdomain}`, "preview-123.up.railway.app", "desk.example.test.evil.test", "x.wild.example.test", "unknown.localhost:3000", "", "desk example", "desk.example.test:abc", "[::1"];
      for (const host of hosts) expect(await resolveHostBrand(fixture.context, host), host).toBeNull();
    });
  });

  it("stops answering a subdomain left under an earlier partner base domain, and a domain not yet verified", async () => {
    await rollbackTest(async (tx) => {
      const fixture = await seed(tx, { appName: "Acme Desk", logo: null });
      customDomainsOn();
      await fixture.elsewhere(() => tx.insert(partnerDomains).values({ partnerId: fixture.partnerId, hostname: "app.bright.example.test", kind: "custom" }));
      await fixture.as("lobbystack_app");
      expect(await resolveHostBrand(fixture.context, "app.bright.example.test")).toBeNull();
      vi.stubEnv("PARTNER_BASE_DOMAIN", "partners.example.test");
      expect(await resolveHostBrand(fixture.context, fixture.subdomain)).toBeNull();
      vi.stubEnv("PARTNER_BASE_DOMAIN", "");
      forgetCachedBrands();
      expect(await resolveHostBrand(fixture.context, fixture.subdomain)).toBeNull();
    });
  });

  it("answers a partner's own verified domain with its brand while the deployment issues certificates for partners' domains", async () => {
    await rollbackTest(async (tx) => {
      const fixture = await seed(tx, { appName: "Acme Desk", logo: null });
      await fixture.elsewhere(() => tx.insert(partnerDomains).values({ partnerId: fixture.partnerId, hostname: "app.bright.example.test", kind: "custom", verifiedAt: new Date() }));
      expect(await resolveHostBrand(fixture.context, "app.bright.example.test")).toBeNull();
      customDomainsOn();
      // The partner's origin stays on its subdomain, where sign-up works, so its businesses' emails keep linking there.
      expect(await resolveHostBrand(fixture.context, "app.bright.example.test")).toMatchObject({ kind: "partner", partnerId: fixture.partnerId, origin: `https://${fixture.subdomain}` });
      expect(await resolveHostBrand(fixture.context, fixture.subdomain)).toMatchObject({ kind: "partner", origin: `https://${fixture.subdomain}` });
      // Caddy's on-demand TLS turns partners' own domains on as well.
      vi.stubEnv("CLOUDFLARE_SAAS_API_TOKEN", "");
      vi.stubEnv("CADDY_ON_DEMAND_TLS", "true");
      forgetCachedBrands();
      expect(await resolveHostBrand(fixture.context, "app.bright.example.test")).toMatchObject({ kind: "partner", partnerId: fixture.partnerId });
      // Without a subdomain, the verified domain is where the partner's links go.
      vi.stubEnv("PARTNER_BASE_DOMAIN", "");
      forgetCachedBrands();
      await fixture.as("lobbystack_worker");
      expect(await brandForBusiness(fixture.context, fixture.partnerBusinessId)).toMatchObject({ origin: "https://app.bright.example.test" });
    });
  });

  it("caches answers, misses included, until another process announces a change", async () => {
    await rollbackTest(async (tx) => {
      const fixture = await seed(tx, { appName: "Acme Desk", logo: null });
      await fixture.as("lobbystack_app");
      const redis = fakeSubscriber();
      await listenForBrandChanges(redis.subscriber);
      expect(redis.subscribed).toEqual(["lobbystack:brand-changes"]);

      // A hostname nobody has yet stays a miss after a partner takes it, until the change is announced.
      const later = `later-${fixture.partnerId.slice(0, 6)}.portal.example.test`;
      expect(await resolveHostBrand(fixture.context, later)).toBeNull();
      const other = randomUUID();
      await fixture.elsewhere(async () => {
        await tx.insert(partners).values({ id: other, name: "Later Desk", slug: later.split(".")[0]! });
        await tx.insert(partnerDomains).values({ partnerId: other, hostname: later, kind: "subdomain", verifiedAt: new Date() });
      });
      expect(await resolveHostBrand(fixture.context, later)).toBeNull();
      redis.deliver(JSON.stringify({ kind: "partner", partnerId: other }));
      expect(await resolveHostBrand(fixture.context, later)).toMatchObject({ kind: "partner", partnerId: other, name: "Later Desk" });

      // A brand saved elsewhere shows once its change arrives.
      expect((await resolveHostBrand(fixture.context, fixture.subdomain))?.color).toBe("#0f766e");
      await fixture.elsewhere(() => tx.execute(sql`update public.partners set brand_color = '#112233', name = 'Brighter Desk' where id = ${fixture.partnerId}::uuid`));
      expect((await brandForEmail(fixture.context, { kind: "partner", partnerId: fixture.partnerId })).name).toBe("Bright Desk");
      redis.deliver(JSON.stringify({ kind: "partner", partnerId: fixture.partnerId }));
      expect(await resolveHostBrand(fixture.context, fixture.subdomain)).toMatchObject({ name: "Brighter Desk", color: "#112233" });

      // A message it can't read, or a dropped connection that may have lost one, clears everything.
      await fixture.elsewhere(() => tx.execute(sql`update public.partners set name = 'Brightest Desk' where id = ${fixture.partnerId}::uuid`));
      redis.deliver("not json");
      expect((await resolveHostBrand(fixture.context, fixture.subdomain))?.name).toBe("Brightest Desk");
      await fixture.elsewhere(() => tx.execute(sql`update public.partners set name = 'Bright Desk' where id = ${fixture.partnerId}::uuid`));
      redis.reconnect();
      expect((await resolveHostBrand(fixture.context, fixture.subdomain))?.name).toBe("Bright Desk");
    });
  });

  it("gives a partner's business its partner's brand and a direct business the host's", async () => {
    await rollbackTest(async (tx) => {
      const fixture = await seed(tx, { appName: "Acme Desk", logo: null });
      for (const role of ["lobbystack_app", "lobbystack_worker"] as const) {
        await fixture.as(role);
        expect(await brandForBusiness(fixture.context, fixture.partnerBusinessId)).toMatchObject({ kind: "partner", partnerId: fixture.partnerId, name: "Bright Desk", origin: `https://${fixture.subdomain}` });
        expect(await brandForEmail(fixture.context, { kind: "business", businessId: fixture.directId })).toMatchObject({ kind: "host", name: "Acme Desk" });
      }
    });
  });

  it("sends a partner's emails from the partner base domain under its name, with links on its subdomain and replies to its support email", async () => {
    await rollbackTest(async (tx) => {
      vi.stubEnv("APP_BASE_URL", "http://localhost:13000");
      const fixture = await seed(tx, { appName: "Acme Desk", logo: null });
      await fixture.as("lobbystack_worker");
      const host = await brandForEmail(fixture.context, { kind: "host" });
      const partner = await brandForEmail(fixture.context, { kind: "partner", partnerId: fixture.partnerId });
      expect(host).toMatchObject({ kind: "host", name: "Acme Desk", origin: "http://localhost:13000", email: { fromName: "Acme Desk", fromAddress: "no-reply@desk.example.test", replyTo: "help@desk.example.test" } });
      // The scheme and port come from APP_BASE_URL, so development links reach the dev server.
      expect(partner).toMatchObject({ kind: "partner", name: "Bright Desk", origin: `http://${fixture.subdomain}:13000`, logoUrl: `/api/branding/logo?partner=${fixture.partnerId}&v=${logoVersion}`, email: { fromName: "Bright Desk", fromAddress: "no-reply@portal.example.test", replyTo: "help@bright.example.test" } });
      await expect(brandForEmail(fixture.context, { kind: "partner", partnerId: randomUUID() })).rejects.toThrow("was not found");
    });
  });

  it("serves a partner's logo and favicon, and nothing for an image it never saved", async () => {
    await rollbackTest(async (tx) => {
      const fixture = await seed(tx, { appName: "Acme Desk", logo: null });
      await fixture.as("lobbystack_app");
      const brand = { kind: "partner" as const, partnerId: fixture.partnerId };
      const logo = await brandLogo(fixture.context, brand);
      expect(logo && new Uint8Array(logo.bytes)).toEqual(png);
      expect(logo).toMatchObject({ contentType: "image/png", version: logoVersion });
      const icon = await brandLogo(fixture.context, brand, "favicon");
      expect(icon && new Uint8Array(icon.bytes)).toEqual(favicon);
      expect(icon?.version).toBe(digest(favicon));
      // The host's deployment has no logo saved, whatever the partner has.
      expect(await brandLogo(fixture.context, { kind: "host", partnerId: null })).toBeNull();
      await fixture.elsewhere(() => tx.execute(sql`update public.partners set favicon = null, favicon_content_type = null where id = ${fixture.partnerId}::uuid`));
      expect(await brandLogo(fixture.context, brand, "favicon")).toBeNull();
      expect(await brandLogo(fixture.context, { kind: "partner", partnerId: randomUUID() })).toBeNull();
      // With no favicon of its own, the tab shows the logo.
      forgetCachedBrands();
      expect((await resolveHostBrand(fixture.context, fixture.subdomain))?.faviconUrl).toBe(`/api/branding/logo?partner=${fixture.partnerId}&v=${logoVersion}`);
    });
  });
});
