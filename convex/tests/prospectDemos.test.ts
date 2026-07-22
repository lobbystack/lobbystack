import { register as registerRateLimiter } from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import {
  generateProspectDemoToken,
  hashProspectDemoToken,
  PROSPECT_DEMO_SESSION_PURPOSE,
  PROSPECT_DEMO_WIDGET_ID,
} from "../lib/prospectDemo";
import schema from "../schema";
import { modules } from "../test.setup";

const OPERATOR_EMAIL = "prospect-demo-operator@example.com";
const originalOperatorEmail = process.env.PROSPECT_DEMO_OPERATOR_EMAIL;
const originalSiteUrl = process.env.SITE_URL;
const originalDeploymentMode = process.env.DEPLOYMENT_MODE;
const originalDashboardTestCallToken = process.env.DASHBOARD_TEST_CALL_TOKEN;

async function seedProspectDemoFixture(input?: {
  status?: "preparing" | "active" | "claimed" | "revoked";
  expiresAt?: number;
  claimedBySubject?: string;
}) {
  const t = convexTest(schema, modules);
  registerRateLimiter(t as unknown as Parameters<typeof registerRateLimiter>[0]);

  const token = generateProspectDemoToken("Acme Demo");
  const tokenHash = await hashProspectDemoToken(token);
  const now = Date.now();

  const seeded = await t.run(async (ctx) => {
    const operatorUserId = await ctx.db.insert("users", {
      authSubject: "prospect-demo-operator",
      email: OPERATOR_EMAIL,
    });
    const businessId = await ctx.db.insert("businesses", {
      slug: "prospect-acme",
      name: "Acme Demo",
      timezone: "America/Toronto",
      defaultLocale: "en",
      websiteUrl: "https://acme.example",
      onboardingStage: "create_business",
      businessType: "general",
      deploymentMode: "cloud",
      status: "active",
    });
    await ctx.db.insert("business_memberships", {
      businessId,
      userId: operatorUserId,
      role: "business_owner",
      status: "active",
    });
    await ctx.db.insert("receptionist_profiles", {
      businessId,
      greeting: "Thanks for calling Acme Demo.",
      tone: "warm",
      summary: "Acme Demo receptionist",
      bookingPolicy: "By appointment",
      transferMode: "disabled",
    });
    await ctx.db.insert("business_context_snapshots", {
      businessId,
      version: "1",
      generatedAt: new Date(now).toISOString(),
      displayName: "Acme Demo",
      timezone: "America/Toronto",
      defaultLocale: "en",
      businessType: "general",
      greeting: "Thanks for calling Acme Demo.",
      voiceInstructions: "Be helpful.",
      smsInstructions: "Keep replies short.",
      summary: "Acme Demo receptionist",
      bookingPolicy: "By appointment",
      knowledgeDigest: "",
      transferPolicy: { mode: "disabled" },
      hours: [],
      closures: [],
      services: [],
      contactChannels: {},
    });
    const websiteIngestionJobId = await ctx.db.insert("website_ingestion_jobs", {
      businessId,
      websiteUrl: "https://acme.example",
      provider: "firecrawl",
      status: "completed",
      crawlMode: "map",
      fallbackTriggered: false,
      pageLimit: 20,
      depth: 2,
      importedCount: 1,
      indexedCount: 1,
      errorCount: 0,
    });

    const claimantUserId = await ctx.db.insert("users", {
      authSubject: "prospect-claimant",
      email: "prospect-claimant@example.com",
    });
    await ctx.db.insert("users", {
      authSubject: "prospect-competitor",
      email: "prospect-competitor@example.com",
    });

    let claimedByUserId: Id<"users"> | undefined;
    if (input?.claimedBySubject) {
      claimedByUserId = await ctx.db.insert("users", {
        authSubject: input.claimedBySubject,
        email: `${input.claimedBySubject}@example.com`,
      });
    }

    const demoId = await ctx.db.insert("prospect_demos", {
      businessId,
      tokenHash,
      status: input?.status ?? "active",
      locale: "en",
      suggestedPrompts: [
        "What are your hours?",
        "Can I get a quote for service?",
      ],
      recipientEmail: "prospect@example.com",
      websiteUrl: "https://acme.example",
      businessName: "Acme Demo",
      operatorUserId,
      websiteIngestionJobId,
      expiresAt: input?.expiresAt ?? now + 7 * 24 * 60 * 60 * 1000,
      publishedAt: now,
      createdAt: now,
      ...(claimedByUserId
        ? { claimedAt: now, claimedByUserId }
        : {}),
    });

    return {
      businessId,
      demoId,
      operatorUserId,
      claimantUserId,
      claimedByUserId,
    };
  });

  return { t, token, ...seeded };
}

describe("prospect demos", () => {
  beforeEach(() => {
    process.env.PROSPECT_DEMO_OPERATOR_EMAIL = OPERATOR_EMAIL;
    process.env.SITE_URL = "https://app.lobbystack.com";
    process.env.DEPLOYMENT_MODE = "development";
  });

  afterEach(() => {
    if (originalOperatorEmail === undefined) {
      delete process.env.PROSPECT_DEMO_OPERATOR_EMAIL;
    } else {
      process.env.PROSPECT_DEMO_OPERATOR_EMAIL = originalOperatorEmail;
    }
    if (originalSiteUrl === undefined) {
      delete process.env.SITE_URL;
    } else {
      process.env.SITE_URL = originalSiteUrl;
    }
    if (originalDeploymentMode === undefined) {
      delete process.env.DEPLOYMENT_MODE;
    } else {
      process.env.DEPLOYMENT_MODE = originalDeploymentMode;
    }
    if (originalDashboardTestCallToken === undefined) {
      delete process.env.DASHBOARD_TEST_CALL_TOKEN;
    } else {
      process.env.DASHBOARD_TEST_CALL_TOKEN = originalDashboardTestCallToken;
    }
  });

  it("hashes tokens and resolves public preview without recipient email", async () => {
    const { t, token, demoId } = await seedProspectDemoFixture();

    const preview = await t.query(api.demos.previewProspectDemo, { token });
    expect(preview).toMatchObject({
      state: "active",
      demoId,
      businessName: "Acme Demo",
      businessSlug: "prospect-acme",
      suggestedPrompts: [
        "What are your hours?",
        "Can I get a quote for service?",
      ],
    });
    expect(preview).not.toHaveProperty("recipientEmail");
  });

  it("marks expired and revoked demos unavailable", async () => {
    const expired = await seedProspectDemoFixture({
      expiresAt: Date.now() - 1_000,
    });
    await expect(
      expired.t.query(api.demos.previewProspectDemo, { token: expired.token }),
    ).resolves.toMatchObject({ state: "expired" });

    const revoked = await seedProspectDemoFixture({ status: "revoked" });
    await expect(
      revoked.t.query(api.demos.previewProspectDemo, { token: revoked.token }),
    ).resolves.toMatchObject({ state: "revoked" });
  });

  it("publishes only when ready and revokes closed previews", async () => {
    const { t, token, demoId } = await seedProspectDemoFixture({
      status: "preparing",
    });

    const published = await t.mutation(internal.demos.publishProspectDemo, {
      demoId,
      rawToken: token,
    });
    expect(published).toMatchObject({
      status: "active",
      demoUrl: `https://app.lobbystack.com/demo/${token}`,
    });

    await t.mutation(internal.demos.revokeProspectDemo, { demoId });
    await expect(
      t.query(api.demos.previewProspectDemo, { token }),
    ).resolves.toMatchObject({ state: "revoked" });
  });

  it("claims idempotently for the same user and rejects competitors", async () => {
    const { t, token, demoId, businessId, operatorUserId } =
      await seedProspectDemoFixture();

    const claimant = t.withIdentity({ subject: "prospect-claimant" });
    const first = await claimant.mutation(api.demos.claimProspectDemo, { token });
    expect(first).toMatchObject({
      status: "claimed",
      businessId,
    });

    const reclaim = await claimant.mutation(api.demos.claimProspectDemo, {
      token,
    });
    expect(reclaim).toMatchObject({
      status: "already_claimed",
      businessId,
    });

    const competitor = t.withIdentity({ subject: "prospect-competitor" });
    await expect(
      competitor.mutation(api.demos.claimProspectDemo, { token }),
    ).rejects.toThrow(/already been claimed/i);

    await t.run(async (ctx) => {
      const demo = await ctx.db.get(demoId);
      const memberships = await ctx.db
        .query("business_memberships")
        .withIndex("by_business_id", (q) => q.eq("businessId", businessId))
        .collect();
      const operatorMembership = memberships.find(
        (membership) => membership.userId === operatorUserId,
      );
      const claimantMembership = memberships.find(
        (membership) => membership.userId === demo?.claimedByUserId,
      );
      const business = await ctx.db.get(businessId);
      const claimantUser = demo?.claimedByUserId
        ? await ctx.db.get(demo.claimedByUserId)
        : null;

      expect(demo?.status).toBe("claimed");
      expect(operatorMembership?.status).toBe("removed");
      expect(claimantMembership).toMatchObject({
        role: "business_owner",
        status: "active",
      });
      expect(business?.onboardingStage).toBe("create_business");
      expect(claimantUser?.activeBusinessId).toBe(businessId);
    });
  });

  it("starts prospect demo web calls without billing reservation", async () => {
    const { t, token, demoId, businessId } = await seedProspectDemoFixture();

    const result = await t.mutation(internal.voice.runtime.startWebCall, {
      businessSlug: "prospect-acme",
      providerCallId: "call_prospect_demo_1",
      gatewaySessionId: "gateway-prospect-1",
      widgetId: PROSPECT_DEMO_WIDGET_ID,
      prospectDemoToken: token,
      startedAt: "2026-07-21T18:00:00.000Z",
    });

    await t.run(async (ctx) => {
      const call = await ctx.db.get(result.callId);
      const usageEvents = await ctx.db.query("billing_usage_events").collect();
      expect(call).toMatchObject({
        businessId,
        sessionPurpose: PROSPECT_DEMO_SESSION_PURPOSE,
        prospectDemoId: demoId,
        widgetId: PROSPECT_DEMO_WIDGET_ID,
      });
      expect(
        usageEvents.filter((event) =>
          event.sourceKey.includes(String(result.callId)),
        ),
      ).toHaveLength(0);
    });
  });

  it("rejects mismatched prospect demo tokens for web voice", async () => {
    const { t } = await seedProspectDemoFixture();
    const validation = await t.query(
      internal.demos.validateProspectDemoForWebVoice,
      {
        token: generateProspectDemoToken("Other Business"),
        businessSlug: "prospect-acme",
      },
    );
    expect(validation).toEqual({ ok: false, reason: "invalid" });
  });

  it("rejects web voice context access without a prospect demo token", async () => {
    const { t, businessId } = await seedProspectDemoFixture();

    const access = await t.query(internal.demos.resolveProspectDemoWebVoiceAccess, {
      businessId,
      businessSlug: "prospect-acme",
    });
    expect(access).toEqual({
      allowed: false,
      reason: "token_required",
    });
  });

  it("rejects web voice starts without a prospect demo token", async () => {
    const { t } = await seedProspectDemoFixture();

    await expect(
      t.mutation(internal.voice.runtime.startWebCall, {
        businessSlug: "prospect-acme",
        providerCallId: "call_prospect_demo_no_token",
        gatewaySessionId: "gateway-prospect-no-token",
        startedAt: "2026-07-21T18:00:00.000Z",
      }),
    ).rejects.toThrow(/prospect demo is not available/i);
  });

  it("starts unclaimed prospect demo web calls with a verified dashboard test call token", async () => {
    process.env.DASHBOARD_TEST_CALL_TOKEN = "dashboard-token";
    const { t, businessId } = await seedProspectDemoFixture();

    const result = await t.mutation(internal.voice.runtime.startWebCall, {
      businessSlug: "prospect-acme",
      providerCallId: "call_dashboard_test_demo_1",
      gatewaySessionId: "gateway-dashboard-test-1",
      widgetId: "lobbystack-dashboard-test-call",
      dashboardTestCallToken: "dashboard-token",
      startedAt: "2026-07-21T18:00:00.000Z",
    });

    await t.run(async (ctx) => {
      const call = await ctx.db.get(result.callId);
      expect(call).toMatchObject({
        businessId,
        widgetId: "lobbystack-dashboard-test-call",
      });
      expect(call?.sessionPurpose).toBeUndefined();
      expect(call?.prospectDemoId).toBeUndefined();
    });
  });

  it("allows web voice starts without a token after a prospect demo is claimed", async () => {
    const { t, token, businessId } = await seedProspectDemoFixture();

    const claimant = t.withIdentity({ subject: "prospect-claimant" });
    await claimant.mutation(api.demos.claimProspectDemo, { token });

    const access = await t.query(internal.demos.resolveProspectDemoWebVoiceAccess, {
      businessId,
      businessSlug: "prospect-acme",
    });
    expect(access).toEqual({
      allowed: true,
      mode: "normal",
    });

    const result = await t.mutation(internal.voice.runtime.startWebCall, {
      businessSlug: "prospect-acme",
      providerCallId: "call_claimed_demo_1",
      gatewaySessionId: "gateway-claimed-1",
      startedAt: "2026-07-21T18:00:00.000Z",
    });

    await t.run(async (ctx) => {
      const call = await ctx.db.get(result.callId);
      expect(call?.sessionPurpose).toBeUndefined();
      expect(call?.prospectDemoId).toBeUndefined();
    });
  });

  it("limits prospect demo starts to five per visitor", async () => {
    const { t, demoId, businessId } = await seedProspectDemoFixture();

    for (let i = 0; i < 5; i++) {
      await t.mutation(internal.voice.runtime.assertWebVoiceStartAllowed, {
        businessId,
        origin: "https://app.lobbystack.com",
        visitorId: "visitor-demo-1",
        widgetId: PROSPECT_DEMO_WIDGET_ID,
        prospectDemoId: demoId,
      });
    }

    await expect(
      t.mutation(internal.voice.runtime.assertWebVoiceStartAllowed, {
        businessId,
        origin: "https://app.lobbystack.com",
        visitorId: "visitor-demo-1",
        widgetId: PROSPECT_DEMO_WIDGET_ID,
        prospectDemoId: demoId,
      }),
    ).rejects.toThrow("web_voice_rate_limited");
  });

  it("enforces the prospect demo quota even when widgetId is missing", async () => {
    const { t, demoId, businessId } = await seedProspectDemoFixture();

    for (let i = 0; i < 5; i++) {
      await t.mutation(internal.voice.runtime.assertWebVoiceStartAllowed, {
        businessId,
        origin: "https://app.lobbystack.com",
        visitorId: "visitor-no-widget",
        prospectDemoId: demoId,
      });
    }

    await expect(
      t.mutation(internal.voice.runtime.assertWebVoiceStartAllowed, {
        businessId,
        origin: "https://app.lobbystack.com",
        visitorId: "visitor-no-widget",
        prospectDemoId: demoId,
      }),
    ).rejects.toThrow("web_voice_rate_limited");
  });

  it("falls back to IP identity for prospect demo quota when visitorId is missing", async () => {
    const { t, demoId, businessId } = await seedProspectDemoFixture();

    for (let i = 0; i < 5; i++) {
      await t.mutation(internal.voice.runtime.assertWebVoiceStartAllowed, {
        businessId,
        origin: "https://app.lobbystack.com",
        ipHash: "demo-ip-hash",
        prospectDemoId: demoId,
      });
    }

    await expect(
      t.mutation(internal.voice.runtime.assertWebVoiceStartAllowed, {
        businessId,
        origin: "https://app.lobbystack.com",
        ipHash: "demo-ip-hash",
        prospectDemoId: demoId,
      }),
    ).rejects.toThrow("web_voice_rate_limited");
  });

  it("enforces the IP prospect demo quota even when visitorId changes", async () => {
    const { t, demoId, businessId } = await seedProspectDemoFixture();

    for (let i = 0; i < 5; i++) {
      await t.mutation(internal.voice.runtime.assertWebVoiceStartAllowed, {
        businessId,
        origin: "https://app.lobbystack.com",
        visitorId: `visitor-rotating-${i}`,
        ipHash: "shared-demo-ip",
        prospectDemoId: demoId,
      });
    }

    await expect(
      t.mutation(internal.voice.runtime.assertWebVoiceStartAllowed, {
        businessId,
        origin: "https://app.lobbystack.com",
        visitorId: "visitor-rotating-new",
        ipHash: "shared-demo-ip",
        prospectDemoId: demoId,
      }),
    ).rejects.toThrow("web_voice_rate_limited");
  });

  it("rejects prospect demo starts with no visitor or IP identity", async () => {
    const { t, demoId, businessId } = await seedProspectDemoFixture();

    await expect(
      t.mutation(internal.voice.runtime.assertWebVoiceStartAllowed, {
        businessId,
        origin: "https://app.lobbystack.com",
        prospectDemoId: demoId,
      }),
    ).rejects.toThrow("web_voice_rate_limited");
  });
});
