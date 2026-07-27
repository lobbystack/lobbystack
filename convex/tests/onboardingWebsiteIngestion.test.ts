import { register as registerRateLimiter } from "@convex-dev/rate-limiter/test";
import { convexTest, type TestConvex } from "convex-test";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { api, internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import {
  normalizeWebsitePageUrl,
  normalizeWebsiteUrl,
  WEBSITE_PUBLIC_URL_ERROR_MESSAGE,
} from "../lib/websiteIngestion";
import schema from "../schema";
import { modules } from "../test.setup";

const {
  dnsLookupMock,
  workflowCancelMock,
  workflowStartMock,
} =
  vi.hoisted(() => ({
    dnsLookupMock: vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]),
    workflowCancelMock: vi.fn(async () => null),
    workflowStartMock: vi.fn(async () => "workflow-test-id"),
  }));

vi.mock("node:dns/promises", () => ({
  lookup: dnsLookupMock,
}));

vi.mock("../lib/components", async () => {
  const actual = await vi.importActual<typeof import("../lib/components")>("../lib/components");

  return {
    ...actual,
    workflowManager: {
      ...actual.workflowManager,
      cancel: workflowCancelMock,
      start: workflowStartMock,
    },
  };
});

type ConvexHarness = TestConvex<typeof schema>;

const convexModules = modules;
const originalFirecrawlApiKey = process.env.FIRECRAWL_API_KEY;

function createConvexHarness() {
  const t = convexTest(schema, convexModules);
  registerRateLimiter(t as unknown as Parameters<typeof registerRateLimiter>[0]);
  return t;
}

async function seedBusinessOwner(input: {
  t: ConvexHarness;
  onboardingStage: string;
  subject: string;
  phone?: string;
  phoneVerificationTime?: number;
}) {
  return await input.t.run(async (ctx) => {
    const businessId = await ctx.db.insert("businesses", {
      slug: `${input.subject}-business`,
      name: `${input.subject} Business`,
      timezone: "America/Toronto",
      defaultLocale: "en",
      onboardingStage: input.onboardingStage,
      businessType: "clinic",
      deploymentMode: "manual",
      status: "active",
    });
    const userId = await ctx.db.insert("users", {
      authSubject: input.subject,
      email: `${input.subject}@example.com`,
      ...(input.phone ? { phone: input.phone } : {}),
      ...(input.phoneVerificationTime
        ? { phoneVerificationTime: input.phoneVerificationTime }
        : {}),
    });
    await ctx.db.insert("business_memberships", {
      businessId,
      userId,
      role: "business_owner",
      status: "active",
    });

    return { businessId, userId };
  });
}

async function listWebsiteIngestionJobs(
  t: ConvexHarness,
  businessId: Id<"businesses">,
): Promise<Array<Doc<"website_ingestion_jobs">>> {
  return await t.run(async (ctx) => {
    return await ctx.db
      .query("website_ingestion_jobs")
      .withIndex("by_business_id", (q) => q.eq("businessId", businessId))
      .collect();
  });
}

describe("website onboarding and ingestion", () => {
  beforeEach(() => {
    process.env.FIRECRAWL_API_KEY = "test-firecrawl-key";

    dnsLookupMock.mockReset();
    dnsLookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    workflowCancelMock.mockReset();
    workflowStartMock.mockReset();
    workflowCancelMock.mockResolvedValue(null);
    workflowStartMock.mockResolvedValue("workflow-test-id");
  });

  afterAll(() => {
    process.env.FIRECRAWL_API_KEY = originalFirecrawlApiKey;
  });

  it("starts already verified users at the website step during business bootstrap", async () => {
    const t = createConvexHarness();
    const subject = "website-bootstrap-owner";
    const phoneVerificationTime = Date.now() - 60_000;

    await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        authSubject: subject,
        email: "verified@example.com",
        phone: "+15815550100",
        phoneVerificationTime,
      });
    });

    const authed = t.withIdentity({ subject });
    const result = await authed.mutation(api.businesses.admin.bootstrapBusiness, {
      name: "Verified Bootstrap Business",
      slug: "verified-bootstrap-business",
      timezone: "America/Toronto",
      businessType: "clinic",
    });

    const business = await t.query(internal.businesses.admin.getBusinessById, {
      businessId: result.businessId,
    });
    expect(business?.onboardingStage).toBe("website");
  });

  it("normalizes the website URL, creates an ingestion job, and advances onboarding", async () => {
    const t = createConvexHarness();
    const subject = "website-submit-owner";
    const { businessId } = await seedBusinessOwner({
      t,
      onboardingStage: "website",
      subject,
    });
    const authed = t.withIdentity({ subject });

    const result = await authed.action(api.onboarding.websites.submitOnboardingWebsite, {
      businessId,
      websiteUrl: "example.com/clinic/?utm_source=test#team",
    });

    expect(result.websiteUrl).toBe("https://example.com/clinic");
    expect(workflowStartMock).toHaveBeenCalledTimes(1);
    expect(workflowStartMock).toHaveBeenCalledWith(
      expect.anything(),
      internal.ai.workflows.runtime.importWebsiteKnowledgeWorkflow,
      {
        websiteIngestionJobId: result.websiteIngestionJobId,
      },
    );

    const business = await t.query(internal.businesses.admin.getBusinessById, {
      businessId,
    });
    expect(business?.websiteUrl).toBe("https://example.com/clinic");
    expect(business?.onboardingStage).toBe("knowledge");

    const jobs = await listWebsiteIngestionJobs(t, businessId);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      businessId,
      websiteUrl: "https://example.com/clinic",
      provider: "firecrawl",
      status: "queued",
      workflowId: "workflow-test-id",
      crawlMode: "firecrawl",
      fallbackTriggered: false,
      pageLimit: 40,
      depth: 3,
      importedCount: 0,
      indexedCount: 0,
      errorCount: 0,
    });
  });

  it("starts a website ingestion job from the knowledge dashboard without changing onboarding", async () => {
    const t = createConvexHarness();
    const subject = "website-dashboard-owner";
    const { businessId } = await seedBusinessOwner({
      t,
      onboardingStage: "phone_number",
      subject,
    });
    const authed = t.withIdentity({ subject });

    const result = await authed.action(api.ai.context.websiteIngestion.submitWebsiteIngestion, {
      businessId,
      websiteUrl: "example.com/faq/?utm_source=test#top",
    });

    expect(result.websiteUrl).toBe("https://example.com/faq");
    expect(workflowStartMock).toHaveBeenCalledTimes(1);
    expect(workflowStartMock).toHaveBeenCalledWith(
      expect.anything(),
      internal.ai.workflows.runtime.importWebsiteKnowledgeWorkflow,
      {
        websiteIngestionJobId: result.websiteIngestionJobId,
      },
    );

    const business = await t.query(internal.businesses.admin.getBusinessById, {
      businessId,
    });
    expect(business?.websiteUrl).toBe("https://example.com/faq");
    expect(business?.onboardingStage).toBe("phone_number");

    const jobs = await listWebsiteIngestionJobs(t, businessId);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      businessId,
      websiteUrl: "https://example.com/faq",
      provider: "firecrawl",
      status: "queued",
      workflowId: "workflow-test-id",
      crawlMode: "firecrawl",
      fallbackTriggered: false,
      pageLimit: 40,
      depth: 3,
      importedCount: 0,
      indexedCount: 0,
      errorCount: 0,
    });
  });

  it("reuses an active same-url website ingestion job instead of creating a duplicate", async () => {
    const t = createConvexHarness();
    const subject = "website-reuse-active-job-owner";
    const { businessId } = await seedBusinessOwner({
      t,
      onboardingStage: "phone_number",
      subject,
    });
    const authed = t.withIdentity({ subject });

    const first = await authed.action(api.ai.context.websiteIngestion.submitWebsiteIngestion, {
      businessId,
      websiteUrl: "example.com/faq/?utm_source=first#top",
    });
    const second = await authed.action(api.ai.context.websiteIngestion.submitWebsiteIngestion, {
      businessId,
      websiteUrl: "https://example.com/faq?utm_source=second#bottom",
    });

    expect(second.websiteIngestionJobId).toBe(first.websiteIngestionJobId);
    expect(workflowStartMock).toHaveBeenCalledTimes(1);

    const jobs = await listWebsiteIngestionJobs(t, businessId);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?._id).toBe(first.websiteIngestionJobId);
  });

  it("starts a fresh website ingestion job when resubmitting after a completed import", async () => {
    const t = createConvexHarness();
    const subject = "website-resubmit-completed-job-owner";
    const { businessId } = await seedBusinessOwner({
      t,
      onboardingStage: "phone_number",
      subject,
    });
    const authed = t.withIdentity({ subject });

    const completedJobId = await t.run(async (ctx) => {
      return await ctx.db.insert("website_ingestion_jobs", {
        businessId,
        websiteUrl: "https://example.com/faq",
        provider: "firecrawl",
        status: "completed",
        workflowId: "workflow-completed",
        crawlMode: "firecrawl",
        fallbackTriggered: false,
        pageLimit: 40,
        depth: 3,
        importedCount: 3,
        indexedCount: 3,
        errorCount: 0,
        completedAt: new Date().toISOString(),
      });
    });

    const result = await authed.action(api.ai.context.websiteIngestion.submitWebsiteIngestion, {
      businessId,
      websiteUrl: "https://example.com/faq?utm_source=resubmit#bottom",
    });

    expect(result.websiteIngestionJobId).not.toBe(completedJobId);
    expect(workflowStartMock).toHaveBeenCalledTimes(1);
    expect(workflowStartMock).toHaveBeenCalledWith(
      expect.anything(),
      internal.ai.workflows.runtime.importWebsiteKnowledgeWorkflow,
      {
        websiteIngestionJobId: result.websiteIngestionJobId,
      },
    );

    const jobs = await listWebsiteIngestionJobs(t, businessId);
    expect(jobs).toHaveLength(2);
    expect(jobs.find((job) => job._id === completedJobId)?.status).toBe("completed");
    expect(jobs.find((job) => job._id === result.websiteIngestionJobId)).toMatchObject({
      businessId,
      websiteUrl: "https://example.com/faq",
      provider: "firecrawl",
      status: "queued",
      workflowId: "workflow-test-id",
    });
  });

  it("allows deleting a failed website ingestion job with no imported documents", async () => {
    const t = createConvexHarness();
    const subject = "website-delete-failed-job-owner";
    const { businessId } = await seedBusinessOwner({
      t,
      onboardingStage: "phone_number",
      subject,
    });
    const authed = t.withIdentity({ subject });

    const websiteIngestionJobId = await t.run(async (ctx) => {
      return await ctx.db.insert("website_ingestion_jobs", {
        businessId,
        websiteUrl: "https://example.com",
        provider: "firecrawl",
        status: "failed",
        crawlMode: "firecrawl",
        fallbackTriggered: false,
        pageLimit: 40,
        depth: 3,
        importedCount: 0,
        indexedCount: 0,
        errorCount: 0,
        lastError: "Firecrawl request failed",
      });
    });

    await authed.mutation(api.ai.context.websiteIngestion.deleteWebsiteIngestionJob, {
      businessId,
      websiteIngestionJobId,
    });

    const jobs = await listWebsiteIngestionJobs(t, businessId);
    expect(jobs).toHaveLength(0);
  });

  it("allows canceling an active website ingestion job with no imported documents", async () => {
    const t = createConvexHarness();
    const subject = "website-cancel-active-job-owner";
    const { businessId } = await seedBusinessOwner({
      t,
      onboardingStage: "phone_number",
      subject,
    });
    const authed = t.withIdentity({ subject });

    const websiteIngestionJobId = await t.run(async (ctx) => {
      return await ctx.db.insert("website_ingestion_jobs", {
        businessId,
        websiteUrl: "https://example.com",
        provider: "firecrawl",
        status: "crawling",
        workflowId: "workflow-123",
        crawlMode: "firecrawl",
        fallbackTriggered: false,
        pageLimit: 40,
        depth: 3,
        importedCount: 0,
        indexedCount: 0,
        errorCount: 0,
      });
    });


    await authed.action(api.ai.context.websiteIngestion.cancelWebsiteIngestionJob, {
      businessId,
      websiteIngestionJobId,
    });

    expect(workflowCancelMock).toHaveBeenCalledWith(expect.anything(), "workflow-123");

    const jobs = await listWebsiteIngestionJobs(t, businessId);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.status).toBe("canceled");
  });

  it("marks active website imports canceled when the workflow already stopped", async () => {
    const t = createConvexHarness();
    const subject = "website-cancel-stopped-workflow-owner";
    const { businessId } = await seedBusinessOwner({
      t,
      onboardingStage: "phone_number",
      subject,
    });
    const authed = t.withIdentity({ subject });

    const websiteIngestionJobId = await t.run(async (ctx) => {
      return await ctx.db.insert("website_ingestion_jobs", {
        businessId,
        websiteUrl: "https://example.com",
        provider: "firecrawl",
        status: "crawling",
        workflowId: "workflow-already-stopped",
        crawlMode: "firecrawl",
        fallbackTriggered: true,
        pageLimit: 40,
        depth: 3,
        importedCount: 0,
        indexedCount: 0,
        errorCount: 0,
      });
    });

    workflowCancelMock.mockRejectedValueOnce(new Error("Workflow not running: [object Object]"));

    await authed.action(api.ai.context.websiteIngestion.cancelWebsiteIngestionJob, {
      businessId,
      websiteIngestionJobId,
    });

    const jobs = await listWebsiteIngestionJobs(t, businessId);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.status).toBe("canceled");
    expect(jobs[0]?.completedAt).toBeTruthy();
    expect(jobs[0]?.lastError).toBeUndefined();
  });

  it("does not advance onboarding when website preflight fails", async () => {
    const t = createConvexHarness();
    const subject = "website-preflight-owner";
    const { businessId } = await seedBusinessOwner({
      t,
      onboardingStage: "website",
      subject,
    });
    const authed = t.withIdentity({ subject });

    dnsLookupMock.mockResolvedValue([{ address: "192.168.1.20", family: 4 }]);

    await expect(
      authed.action(api.onboarding.websites.submitOnboardingWebsite, {
        businessId,
        websiteUrl: "https://clinic.example.com",
      }),
    ).rejects.toThrow(WEBSITE_PUBLIC_URL_ERROR_MESSAGE);

    const business = await t.query(internal.businesses.admin.getBusinessById, {
      businessId,
    });
    expect(business?.websiteUrl).toBeUndefined();
    expect(business?.onboardingStage).toBe("website");

    const jobs = await listWebsiteIngestionJobs(t, businessId);
    expect(jobs).toHaveLength(0);
    expect(workflowStartMock).not.toHaveBeenCalled();
  });

  it("does not advance onboarding when the hostname does not resolve", async () => {
    const t = createConvexHarness();
    const subject = "website-unresolved-host-owner";
    const { businessId } = await seedBusinessOwner({
      t,
      onboardingStage: "website",
      subject,
    });
    const authed = t.withIdentity({ subject });

    dnsLookupMock.mockRejectedValue(
      Object.assign(new Error("getaddrinfo ENOTFOUND missing.example"), {
        code: "ENOTFOUND",
      }),
    );

    await expect(
      authed.action(api.onboarding.websites.submitOnboardingWebsite, {
        businessId,
        websiteUrl: "https://missing.example",
      }),
    ).rejects.toThrow("Enter a public website URL with a live hostname.");

    const business = await t.query(internal.businesses.admin.getBusinessById, {
      businessId,
    });
    expect(business?.websiteUrl).toBeUndefined();
    expect(business?.onboardingStage).toBe("website");

    const jobs = await listWebsiteIngestionJobs(t, businessId);
    expect(jobs).toHaveLength(0);
    expect(workflowStartMock).not.toHaveBeenCalled();
  });

  it("does not advance onboarding or keep a queued job when workflow start fails", async () => {
    const t = createConvexHarness();
    const subject = "website-workflow-failure-owner";
    const { businessId } = await seedBusinessOwner({
      t,
      onboardingStage: "website",
      subject,
    });
    const authed = t.withIdentity({ subject });

    workflowStartMock.mockRejectedValueOnce(new Error("Workflow start failed."));

    await expect(
      authed.action(api.onboarding.websites.submitOnboardingWebsite, {
        businessId,
        websiteUrl: "example.com/clinic",
      }),
    ).rejects.toThrow("Workflow start failed.");

    const business = await t.query(internal.businesses.admin.getBusinessById, {
      businessId,
    });
    expect(business?.websiteUrl).toBeUndefined();
    expect(business?.onboardingStage).toBe("website");

    const jobs = await listWebsiteIngestionJobs(t, businessId);
    expect(jobs).toHaveLength(0);
  });

  it("allows skipping the website step without creating an ingestion job", async () => {
    const t = createConvexHarness();
    const subject = "website-skip-owner";
    const { businessId } = await seedBusinessOwner({
      t,
      onboardingStage: "website",
      subject,
    });
    const authed = t.withIdentity({ subject });

    const result = await authed.mutation(api.onboarding.websites.skipOnboardingWebsite, {
      businessId,
    });

    expect(result).toEqual({ status: "skipped" });
    expect(workflowStartMock).not.toHaveBeenCalled();

    const business = await t.query(internal.businesses.admin.getBusinessById, {
      businessId,
    });
    expect(business?.websiteUrl).toBeUndefined();
    expect(business?.onboardingStage).toBe("knowledge");

    const jobs = await listWebsiteIngestionJobs(t, businessId);
    expect(jobs).toHaveLength(0);
  });

  it("rejects localhost and direct IP website URLs during onboarding submission", async () => {
    expect(() => normalizeWebsiteUrl("http://localhost:3000")).toThrow(
      WEBSITE_PUBLIC_URL_ERROR_MESSAGE,
    );
    expect(() => normalizeWebsiteUrl("https://127.0.0.1:8000")).toThrow(
      WEBSITE_PUBLIC_URL_ERROR_MESSAGE,
    );
    expect(() => normalizeWebsiteUrl("https://[::1]:8000")).toThrow(
      WEBSITE_PUBLIC_URL_ERROR_MESSAGE,
    );
    expect(() => normalizeWebsiteUrl("https://clinic.home.arpa")).toThrow(
      WEBSITE_PUBLIC_URL_ERROR_MESSAGE,
    );
  });

  it("preserves subpath websites when normalizing crawl targets", () => {
    expect(normalizeWebsitePageUrl("https://example.com/clinic/about", "https://example.com/clinic")).toBe(
      "https://example.com/clinic/about",
    );
    expect(normalizeWebsitePageUrl("https://example.com/about", "https://example.com/clinic")).toBeNull();
  });

  it("treats apex and www redirects as the same website during page import", () => {
    expect(normalizeWebsitePageUrl("https://www.example.com/menu", "https://example.com/")).toBe(
      "https://example.com/menu",
    );
    expect(normalizeWebsitePageUrl("https://example.com/menu", "https://www.example.com/")).toBe(
      "https://www.example.com/menu",
    );
  });

  it("treats apex and www redirects as the same website for common ccTLDs", () => {
    expect(normalizeWebsitePageUrl("https://www.example.co.uk/menu", "https://example.co.uk/")).toBe(
      "https://example.co.uk/menu",
    );
  });

  it("does not synthesize apex/www aliases for arbitrary subdomains", () => {
    expect(normalizeWebsitePageUrl("https://example.com/menu", "https://clinic.example.com/")).toBeNull();
  });

  it("rejects pages outside the configured subpath during page import", () => {
    expect(normalizeWebsitePageUrl("https://example.com/clinic/menu", "https://example.com/clinic")).toBe(
      "https://example.com/clinic/menu",
    );
    expect(normalizeWebsitePageUrl("https://example.com/menu", "https://example.com/clinic")).toBeNull();
  });
});
