import { register as registerRateLimiter } from "@convex-dev/rate-limiter/test";
import { convexTest, type TestConvex } from "convex-test";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api, internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { KNOWLEDGE_INDEX_VERSION } from "../lib/components";
import {
  buildPriorityWebsiteCrawlTargets,
  buildWebsiteCrawlExcludePatterns,
  buildWebsiteCrawlIncludePatterns,
  normalizeWebsiteMarkdown,
  normalizeWebsitePageUrl,
  normalizeWebsiteUrl,
  WEBSITE_CRAWL_BROWSER_FALLBACK_DEPTH,
  WEBSITE_CRAWL_BROWSER_FALLBACK_PAGE_LIMIT,
  WEBSITE_CRAWL_PATTERN_LIMIT,
  WEBSITE_PUBLIC_URL_ERROR_MESSAGE,
} from "../lib/websiteIngestion";
import schema from "../schema";
import { modules } from "../test.setup";

const {
  billingLimitBytesRef,
  deleteWebsiteIngestionStorageBlobMock,
  dnsLookupMock,
  enqueueActionBatchMock,
  failingStorageDeleteIdsRef,
  ragDeleteMock,
  workflowCancelMock,
  workflowStartMock,
} =
  vi.hoisted(() => ({
    billingLimitBytesRef: { value: null as number | null },
    deleteWebsiteIngestionStorageBlobMock: vi.fn(),
    dnsLookupMock: vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]),
    enqueueActionBatchMock: vi.fn(async () => null),
    failingStorageDeleteIdsRef: { value: new Set<string>() },
    ragDeleteMock: vi.fn(async () => null),
    workflowCancelMock: vi.fn(async () => null),
    workflowStartMock: vi.fn(async () => "workflow-test-id"),
  }));

vi.mock("node:dns/promises", () => ({
  lookup: dnsLookupMock,
}));

vi.mock("../lib/billing", async () => {
  const actual = await vi.importActual<typeof import("../lib/billing")>("../lib/billing");

  return {
    ...actual,
    getKnowledgeStorageLimitBytes: (plan: Parameters<typeof actual.getKnowledgeStorageLimitBytes>[0]) =>
      billingLimitBytesRef.value ?? actual.getKnowledgeStorageLimitBytes(plan),
  };
});

vi.mock("../lib/components", async () => {
  const actual = await vi.importActual<typeof import("../lib/components")>("../lib/components");

  return {
    ...actual,
    bulkWorkpool: {
      ...actual.bulkWorkpool,
      enqueueActionBatch: enqueueActionBatchMock,
    },
    workflowManager: {
      ...actual.workflowManager,
      cancel: workflowCancelMock,
      start: workflowStartMock,
    },
    rag: {
      ...actual.rag,
      delete: ragDeleteMock,
    },
  };
});

vi.mock("../lib/websiteIngestionStorage", async () => {
  const actual = await vi.importActual<typeof import("../lib/websiteIngestionStorage")>(
    "../lib/websiteIngestionStorage",
  );

  deleteWebsiteIngestionStorageBlobMock.mockImplementation(async (ctx, storageId) => {
    if (failingStorageDeleteIdsRef.value.has(String(storageId))) {
      throw new Error(`Storage delete failed for ${String(storageId)}`);
    }

    return await actual.deleteWebsiteIngestionStorageBlob(ctx, storageId);
  });

  return {
    ...actual,
    deleteWebsiteIngestionStorageBlob: deleteWebsiteIngestionStorageBlobMock,
  };
});

type ConvexHarness = TestConvex<typeof schema>;

const convexModules = modules;
const originalCloudflareAccountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const originalCloudflareApiToken = process.env.CLOUDFLARE_API_TOKEN;
const originalFirecrawlApiKey = process.env.FIRECRAWL_API_KEY;

function createConvexHarness() {
  const t = convexTest(schema, convexModules);
  registerRateLimiter(t as unknown as Parameters<typeof registerRateLimiter>[0]);
  return t;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
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
    process.env.CLOUDFLARE_ACCOUNT_ID = "test-account";
    process.env.CLOUDFLARE_API_TOKEN = "test-token";
    process.env.FIRECRAWL_API_KEY = "test-firecrawl-key";
    billingLimitBytesRef.value = null;
    failingStorageDeleteIdsRef.value = new Set<string>();

    deleteWebsiteIngestionStorageBlobMock.mockClear();
    dnsLookupMock.mockReset();
    dnsLookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    workflowCancelMock.mockReset();
    workflowStartMock.mockReset();
    enqueueActionBatchMock.mockReset();
    ragDeleteMock.mockReset();
    workflowCancelMock.mockResolvedValue(null);
    workflowStartMock.mockResolvedValue("workflow-test-id");
    enqueueActionBatchMock.mockResolvedValue(null);
    ragDeleteMock.mockResolvedValue(null);

    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  afterAll(() => {
    process.env.CLOUDFLARE_ACCOUNT_ID = originalCloudflareAccountId;
    process.env.CLOUDFLARE_API_TOKEN = originalCloudflareApiToken;
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
        phone: "+15817484609",
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
    expect(business?.onboardingStage).toBe("phone_number");

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
        provider: "cloudflare_browser_run",
        status: "failed",
        crawlMode: "http",
        fallbackTriggered: false,
        pageLimit: 40,
        depth: 3,
        importedCount: 0,
        indexedCount: 0,
        errorCount: 0,
        lastError: "Cloudflare request failed",
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
        provider: "cloudflare_browser_run",
        status: "crawling",
        workflowId: "workflow-123",
        cloudflareJobId: "cf-job-cancel-1",
        crawlMode: "http",
        fallbackTriggered: false,
        pageLimit: 40,
        depth: 3,
        importedCount: 0,
        indexedCount: 0,
        errorCount: 0,
      });
    });

    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue({
      ok: true,
      json: vi.fn(async () => ({ success: true })),
    } as unknown as Response);

    await authed.action(api.ai.context.websiteIngestion.cancelWebsiteIngestionJob, {
      businessId,
      websiteIngestionJobId,
    });

    expect(workflowCancelMock).toHaveBeenCalledWith(expect.anything(), "workflow-123");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/browser-rendering/crawl/"),
      expect.objectContaining({
        method: "DELETE",
      }),
    );

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
        provider: "cloudflare_browser_run",
        status: "crawling",
        workflowId: "workflow-already-stopped",
        cloudflareJobId: "cf-job-cancel-stopped-1",
        crawlMode: "browser",
        fallbackTriggered: true,
        pageLimit: 40,
        depth: 3,
        importedCount: 0,
        indexedCount: 0,
        errorCount: 0,
      });
    });

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: vi.fn(async () => ({ success: true })),
    } as unknown as Response);
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
    expect(business?.onboardingStage).toBe("phone_number");

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

  it("submits Cloudflare crawl jobs with the expected request shape", async () => {
    const t = createConvexHarness();
    const subject = "website-crawl-owner";
    const { businessId } = await seedBusinessOwner({
      t,
      onboardingStage: "phone_number",
      subject,
    });

    const websiteIngestionJobId = await t.run(async (ctx) => {
      return await ctx.db.insert("website_ingestion_jobs", {
        businessId,
        websiteUrl: "https://example.com/clinic",
        provider: "cloudflare_browser_run",
        status: "queued",
        crawlMode: "http",
        fallbackTriggered: false,
        pageLimit: 40,
        depth: 3,
        importedCount: 0,
        indexedCount: 0,
        errorCount: 0,
      });
    });

    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        result: "cf-job-1",
      }),
    } as Response);

    const result = await t.action(
      internal.ai.context.websiteIngestionActions.submitCloudflareWebsiteCrawl,
      {
        websiteIngestionJobId,
        render: false,
      },
    );

    expect(result).toEqual({
      cloudflareJobId: "cf-job-1",
      crawlMode: "http",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [requestUrl, requestInit] = fetchMock.mock.calls[0] ?? [];
    expect(String(requestUrl)).toBe(
      "https://api.cloudflare.com/client/v4/accounts/test-account/browser-rendering/crawl",
    );
    expect(requestInit?.method).toBe("POST");
    expect(requestInit?.headers).toMatchObject({
      Authorization: "Bearer test-token",
      "Content-Type": "application/json",
    });

    const body = JSON.parse(String(requestInit?.body)) as {
      options?: {
        excludePatterns?: string[];
        includePatterns?: string[];
        includeExternalLinks?: boolean;
        includeSubdomains?: boolean;
      };
    } & Record<string, unknown>;
    expect(body).toMatchObject({
      url: "https://example.com/clinic",
      limit: 40,
      depth: 3,
      source: "all",
      formats: ["markdown"],
      crawlPurposes: ["ai-input"],
      render: false,
      options: {
        includeExternalLinks: false,
        includeSubdomains: false,
      },
    });
    expect(body.options?.includePatterns).toEqual([
      "https://example.com/clinic",
      "https://example.com/clinic/**",
      "https://www.example.com/clinic",
      "https://www.example.com/clinic/**",
    ]);
    expect(body.options?.excludePatterns).toEqual(
      expect.arrayContaining([
        "https://example.com/clinic/login",
        "https://example.com/clinic/login/**",
        "https://example.com/clinic/**/login",
        "https://example.com/clinic/**/login/**",
        "https://example.com/clinic/search",
        "https://example.com/clinic/search/**",
        "https://example.com/clinic/**/search",
        "https://example.com/clinic/**/search/**",
        "https://example.com/clinic/cdn-cgi/*",
      ]),
    );
    expect(body.options?.excludePatterns).not.toContain(
      "https://www.example.com/clinic/login",
    );
    expect(body.options?.excludePatterns?.length).toBeLessThanOrEqual(
      WEBSITE_CRAWL_PATTERN_LIMIT,
    );
    expect(body.options?.excludePatterns).not.toContain(
      "https://example.com/clinic/**/*search*",
    );
  });

  it("submits targeted priority crawls against a specific page URL", async () => {
    const t = createConvexHarness();
    const subject = "website-priority-crawl-owner";
    const { businessId } = await seedBusinessOwner({
      t,
      onboardingStage: "phone_number",
      subject,
    });

    const websiteIngestionJobId = await t.run(async (ctx) => {
      return await ctx.db.insert("website_ingestion_jobs", {
        businessId,
        websiteUrl: "https://bostonpizza.com/",
        provider: "cloudflare_browser_run",
        status: "queued",
        crawlMode: "http",
        fallbackTriggered: false,
        pageLimit: 40,
        depth: 3,
        importedCount: 0,
        indexedCount: 0,
        errorCount: 0,
      });
    });

    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        result: "cf-job-priority-1",
      }),
    } as Response);

    const result = await t.action(
      internal.ai.context.websiteIngestionActions.submitCloudflareWebsiteCrawl,
      {
        websiteIngestionJobId,
        render: false,
        crawlTargetUrl: "https://bostonpizza.com/en/menu.html",
        pageLimit: 2,
        depth: 1,
      },
    );

    expect(result).toEqual({
      cloudflareJobId: "cf-job-priority-1",
      crawlMode: "http",
    });

    const [, requestInit] = fetchMock.mock.calls[0] ?? [];
    const body = JSON.parse(String(requestInit?.body ?? "{}")) as {
      depth?: number;
      limit?: number;
      url?: string;
      options?: {
        includePatterns?: string[];
        excludePatterns?: string[];
      };
    };

    expect(body.url).toBe("https://bostonpizza.com/en/menu.html");
    expect(body.limit).toBe(2);
    expect(body.depth).toBe(1);
    expect(body.options?.includePatterns).toEqual([
      "https://bostonpizza.com/en/menu.html",
      "https://bostonpizza.com/en/menu.html/**",
      "https://www.bostonpizza.com/en/menu.html",
      "https://www.bostonpizza.com/en/menu.html/**",
    ]);
    expect(body.options?.excludePatterns).toContain(
      "https://bostonpizza.com/en/menu.html/login",
    );
  });

  it("rejects crawl submission for stored localhost targets before calling Cloudflare", async () => {
    const t = createConvexHarness();
    const subject = "website-localhost-block-owner";
    const { businessId } = await seedBusinessOwner({
      t,
      onboardingStage: "phone_number",
      subject,
    });

    const websiteIngestionJobId = await t.run(async (ctx) => {
      return await ctx.db.insert("website_ingestion_jobs", {
        businessId,
        websiteUrl: "http://127.0.0.1:3000/",
        provider: "cloudflare_browser_run",
        status: "queued",
        crawlMode: "http",
        fallbackTriggered: false,
        pageLimit: 40,
        depth: 3,
        importedCount: 0,
        indexedCount: 0,
        errorCount: 0,
      });
    });

    await expect(
      t.action(internal.ai.context.websiteIngestionActions.submitCloudflareWebsiteCrawl, {
        websiteIngestionJobId,
        render: false,
      }),
    ).rejects.toThrow(WEBSITE_PUBLIC_URL_ERROR_MESSAGE);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("caps browser-render fallback crawls to a smaller page budget", async () => {
    const t = createConvexHarness();
    const subject = "website-browser-budget-owner";
    const { businessId } = await seedBusinessOwner({
      t,
      onboardingStage: "phone_number",
      subject,
    });

    const websiteIngestionJobId = await t.run(async (ctx) => {
      return await ctx.db.insert("website_ingestion_jobs", {
        businessId,
        websiteUrl: "https://example.com/clinic",
        provider: "cloudflare_browser_run",
        status: "queued",
        crawlMode: "http",
        fallbackTriggered: false,
        pageLimit: 40,
        depth: 3,
        importedCount: 0,
        indexedCount: 0,
        errorCount: 0,
      });
    });

    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        result: "cf-job-browser-budget-1",
      }),
    } as Response);

    const result = await t.action(
      internal.ai.context.websiteIngestionActions.submitCloudflareWebsiteCrawl,
      {
        websiteIngestionJobId,
        render: true,
      },
    );

    expect(result).toEqual({
      cloudflareJobId: "cf-job-browser-budget-1",
      crawlMode: "browser",
    });
    const [, requestInit] = fetchMock.mock.calls[0] ?? [];
    const body = JSON.parse(String(requestInit?.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      limit: WEBSITE_CRAWL_BROWSER_FALLBACK_PAGE_LIMIT,
      depth: WEBSITE_CRAWL_BROWSER_FALLBACK_DEPTH,
      render: true,
    });
    expect(body).not.toHaveProperty("rejectResourceTypes");
  });

  it("rejects crawl submission when DNS resolves a hostname to a private address", async () => {
    const t = createConvexHarness();
    const subject = "website-private-dns-owner";
    const { businessId } = await seedBusinessOwner({
      t,
      onboardingStage: "phone_number",
      subject,
    });

    const websiteIngestionJobId = await t.run(async (ctx) => {
      return await ctx.db.insert("website_ingestion_jobs", {
        businessId,
        websiteUrl: "https://clinic.example.com/",
        provider: "cloudflare_browser_run",
        status: "queued",
        crawlMode: "http",
        fallbackTriggered: false,
        pageLimit: 40,
        depth: 3,
        importedCount: 0,
        indexedCount: 0,
        errorCount: 0,
      });
    });

    dnsLookupMock.mockResolvedValue([{ address: "192.168.1.20", family: 4 }]);

    await expect(
      t.action(internal.ai.context.websiteIngestionActions.submitCloudflareWebsiteCrawl, {
        websiteIngestionJobId,
        render: false,
      }),
    ).rejects.toThrow(WEBSITE_PUBLIC_URL_ERROR_MESSAGE);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("retries transient Cloudflare crawl status errors before succeeding", async () => {
    const t = createConvexHarness();
    const subject = "website-crawl-status-owner";
    const { businessId } = await seedBusinessOwner({
      t,
      onboardingStage: "phone_number",
      subject,
    });

    const websiteIngestionJobId = await t.run(async (ctx) => {
      return await ctx.db.insert("website_ingestion_jobs", {
        businessId,
        websiteUrl: "https://example.com",
        provider: "cloudflare_browser_run",
        status: "crawling",
        crawlMode: "http",
        fallbackTriggered: false,
        pageLimit: 40,
        depth: 3,
        importedCount: 0,
        indexedCount: 0,
        errorCount: 0,
      });
    });

    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          success: false,
          errors: [
            {
              message: "Durable Object exceeded its CPU time limit and was reset.",
            },
          ],
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          result: {
            status: "running",
            records: [],
          },
        }),
      } as Response);

    const setTimeoutSpy = vi
      .spyOn(globalThis, "setTimeout")
      .mockImplementation(((handler: TimerHandler) => {
        if (typeof handler === "function") {
          handler();
        }
        return 0 as unknown as ReturnType<typeof setTimeout>;
      }) as unknown as typeof setTimeout);

    try {
      const result = await t.action(
        internal.ai.context.websiteIngestionActions.getCloudflareWebsiteCrawlJobStatus,
        {
          websiteIngestionJobId,
          cloudflareJobId: "cf-job-status-1",
        },
      );

      expect(result).toEqual({
        status: "running",
        finished: 0,
        total: null,
        skipped: 0,
      });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      setTimeoutSpy.mockRestore();
    }
  });

  it("treats fully processed crawl jobs as completed and records progress", async () => {
    const t = createConvexHarness();
    const subject = "website-crawl-progress-owner";
    const { businessId } = await seedBusinessOwner({
      t,
      onboardingStage: "phone_number",
      subject,
    });

    const startedAt = new Date(Date.now() - 5 * 60 * 1_000).toISOString();
    const websiteIngestionJobId = await t.run(async (ctx) => {
      return await ctx.db.insert("website_ingestion_jobs", {
        businessId,
        websiteUrl: "https://example.com",
        provider: "cloudflare_browser_run",
        status: "crawling",
        cloudflareJobId: "cf-job-status-complete-1",
        crawlMode: "browser",
        fallbackTriggered: true,
        pageLimit: 40,
        depth: 3,
        importedCount: 0,
        indexedCount: 0,
        errorCount: 0,
        startedAt,
      });
    });

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        result: {
          status: "running",
          finished: 31,
          skipped: 3,
          total: 34,
          records: [],
        },
      }),
    } as Response);

    const beforeStatusCheck = Date.now();
    const result = await t.action(
      internal.ai.context.websiteIngestionActions.getCloudflareWebsiteCrawlJobStatus,
      {
        websiteIngestionJobId,
        cloudflareJobId: "cf-job-status-complete-1",
      },
    );

    expect(result).toEqual({
      status: "completed",
      finished: 34,
      total: 34,
      skipped: 3,
    });

    const job = await t.query(internal.ai.context.websiteIngestion.getWebsiteIngestionJobRecord, {
      websiteIngestionJobId,
    });
    expect(job).toMatchObject({
      crawlFinishedCount: 34,
      crawlTotalCount: 34,
    });
    expect(Date.parse(String(job?.lastProgressAt))).toBeGreaterThanOrEqual(beforeStatusCheck - 1_000);
  });

  it("keeps capped browser fallback crawls running during the partial-completion grace window", async () => {
    const t = createConvexHarness();
    const subject = "website-browser-partial-progress-owner";
    const { businessId } = await seedBusinessOwner({
      t,
      onboardingStage: "phone_number",
      subject,
    });

    const websiteIngestionJobId = await t.run(async (ctx) => {
      return await ctx.db.insert("website_ingestion_jobs", {
        businessId,
        websiteUrl: "https://example.com",
        provider: "cloudflare_browser_run",
        status: "crawling",
        cloudflareJobId: "cf-job-browser-partial-progress-1",
        crawlMode: "browser",
        fallbackTriggered: true,
        pageLimit: 40,
        depth: 3,
        importedCount: 0,
        indexedCount: 0,
        errorCount: 0,
        startedAt: new Date().toISOString(),
      });
    });

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        result: {
          status: "completed",
          finished: WEBSITE_CRAWL_BROWSER_FALLBACK_PAGE_LIMIT - 1,
          skipped: 0,
          total: WEBSITE_CRAWL_BROWSER_FALLBACK_PAGE_LIMIT,
          records: [],
        },
      }),
    } as Response);

    const result = await t.action(
      internal.ai.context.websiteIngestionActions.getCloudflareWebsiteCrawlJobStatus,
      {
        websiteIngestionJobId,
        cloudflareJobId: "cf-job-browser-partial-progress-1",
      },
    );

    expect(result).toEqual({
      status: "running",
      finished: WEBSITE_CRAWL_BROWSER_FALLBACK_PAGE_LIMIT - 1,
      total: WEBSITE_CRAWL_BROWSER_FALLBACK_PAGE_LIMIT,
      skipped: 0,
    });
  });

  it("treats capped browser fallback crawls as completed after one page stalls past the grace window", async () => {
    const t = createConvexHarness();
    const subject = "website-browser-partial-stalled-owner";
    const { businessId } = await seedBusinessOwner({
      t,
      onboardingStage: "phone_number",
      subject,
    });
    const staleProgressAt = new Date(Date.now() - 6 * 60 * 1_000).toISOString();

    const websiteIngestionJobId = await t.run(async (ctx) => {
      return await ctx.db.insert("website_ingestion_jobs", {
        businessId,
        websiteUrl: "https://example.com",
        provider: "cloudflare_browser_run",
        status: "crawling",
        cloudflareJobId: "cf-job-browser-partial-stalled-1",
        crawlMode: "browser",
        fallbackTriggered: true,
        pageLimit: 40,
        depth: 3,
        importedCount: 0,
        indexedCount: 0,
        errorCount: 0,
        crawlFinishedCount: WEBSITE_CRAWL_BROWSER_FALLBACK_PAGE_LIMIT - 1,
        startedAt: staleProgressAt,
        lastProgressAt: staleProgressAt,
      });
    });

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        result: {
          status: "completed",
          finished: WEBSITE_CRAWL_BROWSER_FALLBACK_PAGE_LIMIT - 1,
          skipped: 0,
          total: WEBSITE_CRAWL_BROWSER_FALLBACK_PAGE_LIMIT,
          records: [],
        },
      }),
    } as Response);

    const result = await t.action(
      internal.ai.context.websiteIngestionActions.getCloudflareWebsiteCrawlJobStatus,
      {
        websiteIngestionJobId,
        cloudflareJobId: "cf-job-browser-partial-stalled-1",
      },
    );

    expect(result).toEqual({
      status: "completed",
      finished: WEBSITE_CRAWL_BROWSER_FALLBACK_PAGE_LIMIT - 1,
      total: WEBSITE_CRAWL_BROWSER_FALLBACK_PAGE_LIMIT,
      skipped: 0,
    });
  });

  it("allows import when Cloudflare still reports running but all pages are already processed", async () => {
    const t = createConvexHarness();
    const subject = "website-import-after-processed-owner";
    const { businessId } = await seedBusinessOwner({
      t,
      onboardingStage: "phone_number",
      subject,
    });

    const websiteIngestionJobId = await t.run(async (ctx) => {
      return await ctx.db.insert("website_ingestion_jobs", {
        businessId,
        websiteUrl: "https://example.com",
        provider: "cloudflare_browser_run",
        status: "crawling",
        cloudflareJobId: "cf-job-import-processed-1",
        crawlMode: "http",
        fallbackTriggered: false,
        pageLimit: 40,
        depth: 3,
        importedCount: 0,
        indexedCount: 0,
        errorCount: 0,
        startedAt: new Date().toISOString(),
      });
    });

    const aboutMarkdown = "# About\n" + "current ".repeat(900);
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        result: {
          status: "running",
          finished: 34,
          skipped: 23,
          total: 34,
          records: [
            {
              url: "https://example.com/about",
              status: "completed",
              markdown: aboutMarkdown,
              metadata: {
                status: 200,
                title: "About",
              },
            },
          ],
        },
      }),
    } as Response);

    const result = await t.action(
      internal.ai.context.websiteIngestionActions.importCloudflareWebsiteCrawlResults,
      {
        websiteIngestionJobId,
        cloudflareJobId: "cf-job-import-processed-1",
        crawlMode: "http",
        commitChanges: false,
      },
    );

    expect(result).toEqual({
      importedDocumentCount: 1,
      resultsReady: true,
      weak: false,
    });
  });

  it("allows capped browser fallback import with one queued page", async () => {
    const t = createConvexHarness();
    const subject = "website-import-browser-partial-owner";
    const { businessId } = await seedBusinessOwner({
      t,
      onboardingStage: "phone_number",
      subject,
    });
    const staleProgressAt = new Date(Date.now() - 6 * 60 * 1_000).toISOString();

    const websiteIngestionJobId = await t.run(async (ctx) => {
      return await ctx.db.insert("website_ingestion_jobs", {
        businessId,
        websiteUrl: "https://example.com",
        provider: "cloudflare_browser_run",
        status: "crawling",
        cloudflareJobId: "cf-job-import-browser-partial-1",
        crawlMode: "browser",
        fallbackTriggered: true,
        pageLimit: 40,
        depth: 3,
        importedCount: 0,
        indexedCount: 0,
        errorCount: 0,
        startedAt: staleProgressAt,
        lastProgressAt: staleProgressAt,
      });
    });

    const aboutMarkdown = "# About\n" + "current ".repeat(900);
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        result: {
          status: "running",
          finished: WEBSITE_CRAWL_BROWSER_FALLBACK_PAGE_LIMIT - 1,
          skipped: 0,
          total: WEBSITE_CRAWL_BROWSER_FALLBACK_PAGE_LIMIT,
          records: [
            {
              url: "https://example.com/",
              status: "queued",
            },
            {
              url: "https://example.com/about",
              status: "completed",
              markdown: aboutMarkdown,
              metadata: {
                status: 200,
                title: "About",
              },
            },
            ...Array.from({ length: WEBSITE_CRAWL_BROWSER_FALLBACK_PAGE_LIMIT - 2 }, (_, index) => ({
              url: `https://example.com/section-${index}`,
              status: "completed",
              markdown: "\u200b",
              metadata: {
                status: 200,
                title: `Section ${index}`,
              },
            })),
          ],
        },
      }),
    } as Response);

    const result = await t.action(
      internal.ai.context.websiteIngestionActions.importCloudflareWebsiteCrawlResults,
      {
        websiteIngestionJobId,
        cloudflareJobId: "cf-job-import-browser-partial-1",
        crawlMode: "browser",
        commitChanges: false,
      },
    );

    expect(result).toEqual({
      importedDocumentCount: 1,
      resultsReady: true,
      weak: false,
    });
  });

  it("returns not-ready instead of throwing while browser crawl records are still lagging", async () => {
    const t = createConvexHarness();
    const subject = "website-import-browser-results-lag-owner";
    const { businessId } = await seedBusinessOwner({
      t,
      onboardingStage: "phone_number",
      subject,
    });

    const websiteIngestionJobId = await t.run(async (ctx) => {
      return await ctx.db.insert("website_ingestion_jobs", {
        businessId,
        websiteUrl: "https://example.com",
        provider: "cloudflare_browser_run",
        status: "crawling",
        cloudflareJobId: "cf-job-import-browser-results-lag-1",
        crawlMode: "browser",
        fallbackTriggered: true,
        pageLimit: 40,
        depth: 3,
        importedCount: 0,
        indexedCount: 0,
        errorCount: 0,
        startedAt: new Date().toISOString(),
        lastProgressAt: new Date().toISOString(),
      });
    });

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        result: {
          status: "completed",
          finished: WEBSITE_CRAWL_BROWSER_FALLBACK_PAGE_LIMIT,
          skipped: 0,
          total: WEBSITE_CRAWL_BROWSER_FALLBACK_PAGE_LIMIT,
          records: [
            {
              url: "https://example.com/about",
              status: "completed",
              markdown: "# About\n" + "current ".repeat(900),
              metadata: {
                status: 200,
                title: "About",
              },
            },
          ],
        },
      }),
    } as Response);

    const result = await t.action(
      internal.ai.context.websiteIngestionActions.importCloudflareWebsiteCrawlResults,
      {
        websiteIngestionJobId,
        cloudflareJobId: "cf-job-import-browser-results-lag-1",
        crawlMode: "browser",
        commitChanges: false,
      },
    );

    expect(result).toEqual({
      importedDocumentCount: 0,
      resultsReady: false,
      weak: false,
    });
    expect(enqueueActionBatchMock).not.toHaveBeenCalled();
  });

  it("treats cancelled browser crawl records as terminal and imports completed pages", async () => {
    const t = createConvexHarness();
    const subject = "website-import-browser-cancelled-terminal-owner";
    const { businessId } = await seedBusinessOwner({
      t,
      onboardingStage: "phone_number",
      subject,
    });

    const websiteIngestionJobId = await t.run(async (ctx) => {
      return await ctx.db.insert("website_ingestion_jobs", {
        businessId,
        websiteUrl: "https://example.com",
        provider: "cloudflare_browser_run",
        status: "crawling",
        cloudflareJobId: "cf-job-import-browser-cancelled-terminal-1",
        crawlMode: "browser",
        fallbackTriggered: true,
        pageLimit: 40,
        depth: 3,
        importedCount: 0,
        indexedCount: 0,
        errorCount: 0,
        startedAt: new Date().toISOString(),
        lastProgressAt: new Date().toISOString(),
      });
    });

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        result: {
          status: "completed",
          finished: 2,
          skipped: 0,
          total: 2,
          records: [
            {
              url: "https://example.com/about",
              status: "completed",
              markdown: "# About\n" + "current ".repeat(900),
              metadata: {
                status: 200,
                title: "About",
              },
            },
            {
              url: "https://example.com/menu",
              status: "cancelled",
            },
          ],
        },
      }),
    } as Response);

    const result = await t.action(
      internal.ai.context.websiteIngestionActions.importCloudflareWebsiteCrawlResults,
      {
        websiteIngestionJobId,
        cloudflareJobId: "cf-job-import-browser-cancelled-terminal-1",
        crawlMode: "browser",
        commitChanges: false,
      },
    );

    expect(result).toEqual({
      importedDocumentCount: 1,
      resultsReady: true,
      weak: false,
    });
    expect(enqueueActionBatchMock).not.toHaveBeenCalled();
  });

  it("imports settled browser crawl records when Cloudflare pagination stays incomplete", async () => {
    const t = createConvexHarness();
    const subject = "website-import-browser-settled-incomplete-owner";
    const { businessId } = await seedBusinessOwner({
      t,
      onboardingStage: "phone_number",
      subject,
    });

    const settledAt = new Date(Date.now() - 6 * 60 * 1_000).toISOString();
    const websiteIngestionJobId = await t.run(async (ctx) => {
      return await ctx.db.insert("website_ingestion_jobs", {
        businessId,
        websiteUrl: "https://example.com",
        provider: "cloudflare_browser_run",
        status: "crawling",
        cloudflareJobId: "cf-job-import-browser-settled-incomplete-1",
        crawlMode: "browser",
        fallbackTriggered: true,
        pageLimit: 40,
        depth: 3,
        importedCount: 0,
        indexedCount: 0,
        errorCount: 0,
        startedAt: settledAt,
        lastProgressAt: settledAt,
      });
    });

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        result: {
          status: "completed",
          finished: WEBSITE_CRAWL_BROWSER_FALLBACK_PAGE_LIMIT,
          skipped: 0,
          total: WEBSITE_CRAWL_BROWSER_FALLBACK_PAGE_LIMIT,
          cursor: "stale-cursor",
          records: [
            {
              url: "https://example.com/about",
              status: "completed",
              markdown: "# About\n" + "current ".repeat(900),
              metadata: {
                status: 200,
                title: "About",
              },
            },
          ],
        },
      }),
    } as Response);

    const result = await t.action(
      internal.ai.context.websiteIngestionActions.importCloudflareWebsiteCrawlResults,
      {
        websiteIngestionJobId,
        cloudflareJobId: "cf-job-import-browser-settled-incomplete-1",
        crawlMode: "browser",
        commitChanges: false,
      },
    );

    expect(result).toEqual({
      importedDocumentCount: 1,
      resultsReady: true,
      weak: false,
    });
    expect(enqueueActionBatchMock).not.toHaveBeenCalled();
  });

  it("returns not-ready instead of failing when crawl result pagination repeats early", async () => {
    const t = createConvexHarness();
    const subject = "website-import-repeated-cursor-owner";
    const { businessId } = await seedBusinessOwner({
      t,
      onboardingStage: "phone_number",
      subject,
    });

    const websiteIngestionJobId = await t.run(async (ctx) => {
      return await ctx.db.insert("website_ingestion_jobs", {
        businessId,
        websiteUrl: "https://example.com",
        provider: "cloudflare_browser_run",
        status: "crawling",
        cloudflareJobId: "cf-job-import-repeated-cursor-1",
        crawlMode: "http",
        fallbackTriggered: false,
        pageLimit: 40,
        depth: 3,
        importedCount: 0,
        indexedCount: 0,
        errorCount: 0,
        startedAt: new Date().toISOString(),
        lastProgressAt: new Date().toISOString(),
      });
    });

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        result: {
          status: "completed",
          finished: 40,
          skipped: 0,
          total: 40,
          cursor: "stale-cursor",
          records: [
            {
              url: "https://example.com/about",
              status: "completed",
              markdown: "# About\n" + "current ".repeat(900),
              metadata: {
                status: 200,
                title: "About",
              },
            },
          ],
        },
      }),
    } as Response);

    const result = await t.action(
      internal.ai.context.websiteIngestionActions.importCloudflareWebsiteCrawlResults,
      {
        websiteIngestionJobId,
        cloudflareJobId: "cf-job-import-repeated-cursor-1",
        crawlMode: "http",
        commitChanges: false,
      },
    );

    expect(result).toEqual({
      importedDocumentCount: 0,
      resultsReady: false,
      weak: false,
    });
    expect(enqueueActionBatchMock).not.toHaveBeenCalled();
  });

  it("requests terminal crawl results without a limit parameter", async () => {
    const t = createConvexHarness();
    const subject = "website-import-full-results-owner";
    const { businessId } = await seedBusinessOwner({
      t,
      onboardingStage: "phone_number",
      subject,
    });

    const websiteIngestionJobId = await t.run(async (ctx) => {
      return await ctx.db.insert("website_ingestion_jobs", {
        businessId,
        websiteUrl: "https://example.com",
        provider: "cloudflare_browser_run",
        status: "crawling",
        cloudflareJobId: "cf-job-import-full-results-1",
        crawlMode: "http",
        fallbackTriggered: false,
        pageLimit: 40,
        depth: 3,
        importedCount: 0,
        indexedCount: 0,
        errorCount: 0,
        startedAt: new Date().toISOString(),
      });
    });

    const aboutMarkdown = "# About\n" + "current ".repeat(900);
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        result: {
          status: "completed",
          finished: 1,
          skipped: 0,
          total: 1,
          records: [
            {
              url: "https://example.com/about",
              status: "completed",
              markdown: aboutMarkdown,
              metadata: {
                status: 200,
                title: "About",
              },
            },
          ],
        },
      }),
    } as Response);

    const result = await t.action(
      internal.ai.context.websiteIngestionActions.importCloudflareWebsiteCrawlResults,
      {
        websiteIngestionJobId,
        cloudflareJobId: "cf-job-import-full-results-1",
        crawlMode: "http",
        commitChanges: false,
      },
    );

    expect(result).toEqual({
      importedDocumentCount: 1,
      resultsReady: true,
      weak: false,
    });
    expect(String(fetchMock.mock.calls[0]?.[0] ?? "")).not.toContain("limit=");
  });

  it("reconciles a completed crawl into indexing when the provider finished first", async () => {
    const t = createConvexHarness();
    const subject = "website-reconcile-completed-owner";
    const { businessId } = await seedBusinessOwner({
      t,
      onboardingStage: "phone_number",
      subject,
    });

    const websiteIngestionJobId = await t.run(async (ctx) => {
      return await ctx.db.insert("website_ingestion_jobs", {
        businessId,
        websiteUrl: "https://example.com",
        provider: "cloudflare_browser_run",
        status: "crawling",
        cloudflareJobId: "cf-job-reconcile-1",
        crawlMode: "browser",
        fallbackTriggered: true,
        pageLimit: 40,
        depth: 3,
        importedCount: 0,
        indexedCount: 0,
        errorCount: 0,
        startedAt: new Date().toISOString(),
        lastProgressAt: new Date().toISOString(),
      });
    });

    const aboutMarkdown = "# About\n" + "current ".repeat(900);
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          result: {
            status: "completed",
            finished: 1,
            total: 1,
            skipped: 0,
            records: [],
          },
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          result: {
            status: "completed",
            total: 1,
            finished: 1,
            skipped: 0,
            records: [
              {
                url: "https://example.com/about",
                status: "completed",
                markdown: aboutMarkdown,
                metadata: {
                  status: 200,
                  title: "About",
                },
              },
            ],
          },
        }),
      } as Response);

    const result = await t.action(
      internal.ai.context.websiteIngestionActions.reconcileWebsiteIngestionJob,
      {
        websiteIngestionJobId,
      },
    );

    expect(result).toEqual({ status: "indexing" });
    expect(enqueueActionBatchMock).toHaveBeenCalledTimes(1);

    const job = await t.query(internal.ai.context.websiteIngestion.getWebsiteIngestionJobRecord, {
      websiteIngestionJobId,
    });
    expect(job).toMatchObject({
      status: "indexing",
      importedCount: 1,
      crawlFinishedCount: 1,
      crawlTotalCount: 1,
    });

    const websiteDocument = await t.query(
      internal.ai.context.websiteIngestion.getWebsiteKnowledgeDocumentBySourceUrl,
      {
        businessId,
        sourceUrl: "https://example.com/about",
      },
    );
    expect(websiteDocument?.status).toBe("queued");
  });

  it("keeps browser fallback crawling when counters finish before result records are available", async () => {
    const t = createConvexHarness();
    const subject = "website-reconcile-browser-results-lag-owner";
    const { businessId } = await seedBusinessOwner({
      t,
      onboardingStage: "phone_number",
      subject,
    });

    const websiteIngestionJobId = await t.run(async (ctx) => {
      return await ctx.db.insert("website_ingestion_jobs", {
        businessId,
        websiteUrl: "https://example.com",
        provider: "cloudflare_browser_run",
        status: "crawling",
        cloudflareJobId: "cf-job-reconcile-browser-results-lag-1",
        crawlMode: "browser",
        fallbackTriggered: true,
        pageLimit: 40,
        depth: 3,
        importedCount: 0,
        indexedCount: 0,
        errorCount: 0,
        startedAt: new Date().toISOString(),
        lastProgressAt: new Date().toISOString(),
      });
    });

    const aboutMarkdown = "# About\n" + "current ".repeat(900);
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          result: {
            status: "completed",
            finished: WEBSITE_CRAWL_BROWSER_FALLBACK_PAGE_LIMIT,
            total: WEBSITE_CRAWL_BROWSER_FALLBACK_PAGE_LIMIT,
            skipped: 0,
            records: [
              {
                url: "https://example.com/about",
                status: "completed",
                markdown: aboutMarkdown,
                metadata: {
                  status: 200,
                  title: "About",
                },
              },
            ],
          },
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          result: {
            status: "completed",
            finished: WEBSITE_CRAWL_BROWSER_FALLBACK_PAGE_LIMIT,
            total: WEBSITE_CRAWL_BROWSER_FALLBACK_PAGE_LIMIT,
            skipped: 0,
            records: [
              {
                url: "https://example.com/about",
                status: "completed",
                markdown: aboutMarkdown,
                metadata: {
                  status: 200,
                  title: "About",
                },
              },
            ],
          },
        }),
      } as Response);

    const result = await t.action(
      internal.ai.context.websiteIngestionActions.reconcileWebsiteIngestionJob,
      {
        websiteIngestionJobId,
      },
    );

    expect(result).toEqual({ status: "crawling" });
    expect(enqueueActionBatchMock).not.toHaveBeenCalled();

    const job = await t.query(internal.ai.context.websiteIngestion.getWebsiteIngestionJobRecord, {
      websiteIngestionJobId,
    });
    expect(job).toMatchObject({
      status: "crawling",
      importedCount: 0,
      indexedCount: 0,
      crawlFinishedCount: WEBSITE_CRAWL_BROWSER_FALLBACK_PAGE_LIMIT,
      crawlTotalCount: WEBSITE_CRAWL_BROWSER_FALLBACK_PAGE_LIMIT,
    });
  });

  it("falls back to a browser crawl when the completed HTTP crawl is too weak", async () => {
    const t = createConvexHarness();
    const subject = "website-reconcile-browser-fallback-owner";
    const { businessId } = await seedBusinessOwner({
      t,
      onboardingStage: "phone_number",
      subject,
    });

    const websiteIngestionJobId = await t.run(async (ctx) => {
      return await ctx.db.insert("website_ingestion_jobs", {
        businessId,
        websiteUrl: "https://example.com",
        provider: "cloudflare_browser_run",
        status: "crawling",
        cloudflareJobId: "cf-job-http-1",
        crawlMode: "http",
        fallbackTriggered: false,
        pageLimit: 40,
        depth: 3,
        importedCount: 0,
        indexedCount: 0,
        errorCount: 0,
        startedAt: new Date().toISOString(),
        lastProgressAt: new Date().toISOString(),
      });
    });

    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          result: {
            status: "completed",
            finished: 1,
            total: 1,
            skipped: 0,
            records: [],
          },
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          result: {
            status: "completed",
            total: 1,
            finished: 1,
            skipped: 0,
            records: [
              {
                url: "https://example.com/about",
                status: "completed",
                markdown: "# About\n" + "weak ".repeat(30),
                metadata: {
                  status: 200,
                  title: "About",
                },
              },
            ],
          },
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          result: "cf-job-browser-1",
        }),
      } as Response);

    const result = await t.action(
      internal.ai.context.websiteIngestionActions.reconcileWebsiteIngestionJob,
      {
        websiteIngestionJobId,
      },
    );

    expect(result).toEqual({ status: "crawling" });
    expect(enqueueActionBatchMock).not.toHaveBeenCalled();
    expect(ragDeleteMock).not.toHaveBeenCalled();

    const job = await t.query(internal.ai.context.websiteIngestion.getWebsiteIngestionJobRecord, {
      websiteIngestionJobId,
    });
    expect(job).toMatchObject({
      status: "crawling",
      cloudflareJobId: "cf-job-browser-1",
      crawlMode: "browser",
      fallbackTriggered: true,
      pageLimit: WEBSITE_CRAWL_BROWSER_FALLBACK_PAGE_LIMIT,
      depth: WEBSITE_CRAWL_BROWSER_FALLBACK_DEPTH,
      importedCount: 0,
      indexedCount: 0,
      errorCount: 0,
      crawlFinishedCount: 0,
      crawlTotalCount: 0,
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const browserSubmitCall = fetchMock.mock.calls[2];
    expect(String(browserSubmitCall?.[0] ?? "")).toBe(
      "https://api.cloudflare.com/client/v4/accounts/test-account/browser-rendering/crawl",
    );
    const browserSubmitBody = JSON.parse(String(browserSubmitCall?.[1]?.body ?? "{}")) as {
      depth?: number;
      limit?: number;
      render?: boolean;
    };
    expect(browserSubmitBody.render).toBe(true);
    expect(browserSubmitBody.limit).toBe(WEBSITE_CRAWL_BROWSER_FALLBACK_PAGE_LIMIT);
    expect(browserSubmitBody.depth).toBe(WEBSITE_CRAWL_BROWSER_FALLBACK_DEPTH);
  });

  it("fails a crawl that stops making progress for too long", async () => {
    const t = createConvexHarness();
    const subject = "website-stalled-crawl-owner";
    const { businessId } = await seedBusinessOwner({
      t,
      onboardingStage: "phone_number",
      subject,
    });

    const staleProgressAt = new Date(Date.now() - 31 * 60 * 1000).toISOString();
    const websiteIngestionJobId = await t.run(async (ctx) => {
      return await ctx.db.insert("website_ingestion_jobs", {
        businessId,
        websiteUrl: "https://example.com",
        provider: "cloudflare_browser_run",
        status: "crawling",
        cloudflareJobId: "cf-job-stalled-1",
        crawlMode: "browser",
        fallbackTriggered: true,
        pageLimit: 40,
        depth: 3,
        importedCount: 0,
        indexedCount: 0,
        errorCount: 0,
        startedAt: staleProgressAt,
        lastProgressAt: staleProgressAt,
        crawlFinishedCount: 1,
        crawlTotalCount: 40,
      });
    });

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        result: {
          status: "running",
          finished: 1,
          total: 40,
          skipped: 0,
          records: [
            {
              url: "https://example.com",
              status: "completed",
              markdown: "# Home",
              metadata: {
                status: 200,
                title: "Home",
              },
            },
          ],
        },
      }),
    } as Response);

    const result = await t.action(
      internal.ai.context.websiteIngestionActions.reconcileWebsiteIngestionJob,
      {
        websiteIngestionJobId,
      },
    );

    expect(result).toEqual({ status: "failed" });

    const job = await t.query(internal.ai.context.websiteIngestion.getWebsiteIngestionJobRecord, {
      websiteIngestionJobId,
    });
    expect(job?.status).toBe("failed");
    expect(job?.lastError).toBe("Website crawl ended with status stalled.");
  });

  it("treats submitted indexing records as complete for workflow polling", async () => {
    const t = createConvexHarness();
    const subject = "website-indexing-poll-owner";
    const { businessId } = await seedBusinessOwner({
      t,
      onboardingStage: "phone_number",
      subject,
    });

    const websiteIngestionJobId = await t.run(async (ctx) => {
      const websiteIngestionJobId = await ctx.db.insert("website_ingestion_jobs", {
        businessId,
        websiteUrl: "https://example.com/",
        provider: "cloudflare_browser_run",
        status: "indexing",
        crawlMode: "http",
        fallbackTriggered: false,
        pageLimit: 40,
        depth: 3,
        importedCount: 2,
        indexedCount: 0,
        errorCount: 0,
      });

      await ctx.db.insert("knowledge_documents", {
        businessId,
        section: "knowledge",
        sourceType: "website",
        sourceUrl: "https://example.com/about",
        websiteIngestionJobId,
        title: "About",
        textContent: "About preview",
        mimeType: "text/markdown",
        status: "indexing",
        processingProgress: 96,
        tags: [],
        importance: 85,
        indexedEntryId: "entry-about",
        indexVersion: KNOWLEDGE_INDEX_VERSION,
      });
      await ctx.db.insert("knowledge_documents", {
        businessId,
        section: "knowledge",
        sourceType: "website",
        sourceUrl: "https://example.com/contact",
        websiteIngestionJobId,
        title: "Contact",
        textContent: "Contact preview",
        mimeType: "text/markdown",
        status: "error",
        processingProgress: 0,
        tags: [],
        importance: 85,
        error: "Indexing failed.",
      });

      return websiteIngestionJobId;
    });

    const counts = await t.action(
      internal.ai.context.websiteIngestionActions.waitForWebsiteIngestionDocuments,
      {
        websiteIngestionJobId,
      },
    );

    expect(counts).toEqual({
      businessId,
      indexed: 0,
      error: 1,
      pending: 1,
    });
  });

  it("preserves subpath websites when normalizing crawl targets", () => {
    expect(normalizeWebsiteUrl("https://example.com/clinic/?utm_source=test#team")).toBe(
      "https://example.com/clinic",
    );
    expect(buildWebsiteCrawlIncludePatterns("https://example.com/clinic/")).toEqual([
      "https://example.com/clinic",
      "https://example.com/clinic/**",
      "https://www.example.com/clinic",
      "https://www.example.com/clinic/**",
    ]);
    expect(buildWebsiteCrawlExcludePatterns("https://example.com/clinic/")).toContain(
      "https://example.com/clinic/login",
    );
    expect(buildWebsiteCrawlExcludePatterns("https://example.com/clinic/")).toContain(
      "https://example.com/clinic/**/login/**",
    );
    expect(buildWebsiteCrawlExcludePatterns("https://example.com/clinic/")).not.toContain(
      "https://www.example.com/clinic/login",
    );
    expect(buildWebsiteCrawlExcludePatterns("https://example.com/clinic/")).not.toContain(
      "https://example.com/clinic/**/*search*",
    );
    expect(buildWebsiteCrawlExcludePatterns("https://example.com/clinic/")).toHaveLength(53);
  });

  it("treats apex and www redirects as the same website during page import", () => {
    expect(normalizeWebsitePageUrl("https://www.example.com/about", "https://example.com/")).toBe(
      "https://example.com/about",
    );
    expect(normalizeWebsitePageUrl("https://example.com/about", "https://www.example.com/")).toBe(
      "https://www.example.com/about",
    );
  });

  it("treats apex and www redirects as the same website for common ccTLDs", () => {
    expect(buildWebsiteCrawlIncludePatterns("https://example.co.uk/")).toEqual([
      "https://example.co.uk/",
      "https://example.co.uk/**",
      "https://www.example.co.uk/",
      "https://www.example.co.uk/**",
    ]);
    expect(
      normalizeWebsitePageUrl(
        "https://www.example.co.uk/about",
        "https://example.co.uk/",
      ),
    ).toBe("https://example.co.uk/about");
    expect(
      normalizeWebsitePageUrl(
        "https://example.com.au/about",
        "https://www.example.com.au/",
      ),
    ).toBe("https://www.example.com.au/about");
  });

  it("does not synthesize apex/www aliases for arbitrary subdomains", () => {
    expect(buildWebsiteCrawlIncludePatterns("https://clinic.example.com/")).toEqual([
      "https://clinic.example.com/",
      "https://clinic.example.com/**",
    ]);
    expect(
      normalizeWebsitePageUrl(
        "https://www.clinic.example.com/about",
        "https://clinic.example.com/",
      ),
    ).toBeNull();
    expect(
      normalizeWebsitePageUrl(
        "https://clinic.example.com/about",
        "https://www.clinic.example.com/",
      ),
    ).toBeNull();
  });

  it("rejects pages outside the configured subpath during page import", () => {
    expect(
      normalizeWebsitePageUrl("https://example.com/clinic/about", "https://example.com/clinic"),
    ).toBe("https://example.com/clinic/about");
    expect(
      normalizeWebsitePageUrl(
        "https://www.example.com/clinic/contact?ref=nav",
        "https://example.com/clinic",
      ),
    ).toBe("https://example.com/clinic/contact");
    expect(
      normalizeWebsitePageUrl("https://example.com/about", "https://example.com/clinic"),
    ).toBeNull();
    expect(
      normalizeWebsitePageUrl("https://example.com/clinic-and-spa", "https://example.com/clinic"),
    ).toBeNull();
  });

  it("builds priority crawl targets for menu-style pages", () => {
    expect(buildPriorityWebsiteCrawlTargets("https://bostonpizza.com/")).toEqual([
      "https://bostonpizza.com/menu",
      "https://bostonpizza.com/menu.html",
      "https://bostonpizza.com/menus",
      "https://bostonpizza.com/menus.html",
      "https://bostonpizza.com/en/menu",
      "https://bostonpizza.com/en/menu.html",
      "https://bostonpizza.com/en/menus",
      "https://bostonpizza.com/en/menus.html",
      "https://bostonpizza.com/fr/menu",
      "https://bostonpizza.com/fr/menu.html",
      "https://bostonpizza.com/fr/menus",
      "https://bostonpizza.com/fr/menus.html",
    ]);
    expect(buildPriorityWebsiteCrawlTargets("https://example.com/about.html")).toEqual([]);
  });

  it("deduplicates apex and www versions of the same page during import", async () => {
    const t = createConvexHarness();
    const subject = "website-hostname-dedupe-owner";
    const { businessId } = await seedBusinessOwner({
      t,
      onboardingStage: "phone_number",
      subject,
    });

    const websiteIngestionJobId = await t.run(async (ctx) => {
      return await ctx.db.insert("website_ingestion_jobs", {
        businessId,
        websiteUrl: "https://example.com/",
        provider: "cloudflare_browser_run",
        status: "crawling",
        crawlMode: "http",
        fallbackTriggered: false,
        pageLimit: 40,
        depth: 3,
        importedCount: 0,
        indexedCount: 0,
        errorCount: 0,
      });
    });

    const markdown = "# About\n" + "hello ".repeat(900);
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        result: {
          status: "completed",
          records: [
            {
              url: "https://example.com/about",
              status: "completed",
              markdown,
              metadata: { title: "About" },
            },
            {
              url: "https://www.example.com/about?ref=nav",
              status: "completed",
              markdown,
              metadata: { title: "About (www)" },
            },
          ],
        },
      }),
    } as Response);

    const summary = await t.action(
      internal.ai.context.websiteIngestionActions.importCloudflareWebsiteCrawlResults,
      {
        websiteIngestionJobId,
        cloudflareJobId: "cf-job-hostname-dedupe-1",
        crawlMode: "http",
      },
    );

    expect(summary).toMatchObject({
      importedDocumentCount: 1,
      weak: false,
    });
    expect(enqueueActionBatchMock).toHaveBeenCalledTimes(1);

    const documents = await t.run(async (ctx) => {
      return await ctx.db
        .query("knowledge_documents")
        .withIndex("by_business_id_and_source_type", (q) =>
          q.eq("businessId", businessId).eq("sourceType", "website"),
        )
        .collect();
    });
    expect(documents).toHaveLength(1);
    expect(documents[0]?.sourceUrl).toBe("https://example.com/about");
  });

  it("reuses an existing website document without duplicating or reindexing it when the content hash is unchanged", async () => {
    const t = createConvexHarness();
    const subject = "website-dedupe-owner";
    const { businessId } = await seedBusinessOwner({
      t,
      onboardingStage: "phone_number",
      subject,
    });
    const stableMarkdown = "# About\n" + "hello ".repeat(900);
    const stableHash = await sha256Hex(normalizeWebsiteMarkdown(stableMarkdown));

    const websiteIngestionJobId = await t.run(async (ctx) => {
      const extractedTextStorageId = await ctx.storage.store(
        new Blob([stableMarkdown], {
          type: "text/markdown;charset=utf-8",
        }),
      );
      await ctx.db.insert("knowledge_documents", {
        businessId,
        section: "knowledge",
        sourceType: "website",
        sourceUrl: "https://example.com/about",
        title: "About",
        extractedTextStorageId,
        mimeType: "text/markdown",
        textContent: "About preview",
        status: "indexed",
        processingProgress: 100,
        tags: [],
        importance: 85,
        contentHash: stableHash,
        indexedEntryId: "entry-about",
        indexVersion: KNOWLEDGE_INDEX_VERSION,
      });

      return await ctx.db.insert("website_ingestion_jobs", {
        businessId,
        websiteUrl: "https://example.com",
        provider: "cloudflare_browser_run",
        status: "crawling",
        crawlMode: "http",
        fallbackTriggered: false,
        pageLimit: 40,
        depth: 3,
        importedCount: 0,
        indexedCount: 0,
        errorCount: 0,
      });
    });

    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        result: {
          status: "completed",
          records: [
            {
              url: "https://example.com/about?ref=nav#team",
              status: "completed",
              markdown: stableMarkdown,
              metadata: {
                title: "About Us",
              },
            },
          ],
        },
      }),
    } as Response);

    const summary = await t.action(
      internal.ai.context.websiteIngestionActions.importCloudflareWebsiteCrawlResults,
      {
        websiteIngestionJobId,
        cloudflareJobId: "cf-job-1",
        crawlMode: "http",
      },
    );

    if (summary.importedDocumentCount !== 1) {
      throw new Error(`Expected one imported document, received ${summary.importedDocumentCount}.`);
    }
    if (summary.weak) {
      throw new Error("Expected the crawl summary to avoid the browser fallback.");
    }
    if (enqueueActionBatchMock.mock.calls.length !== 0) {
      throw new Error("Expected unchanged website content to skip reindexing.");
    }

    const matchingDocument = await t.query(
      internal.ai.context.websiteIngestion.getWebsiteKnowledgeDocumentBySourceUrl,
      {
        businessId,
        sourceUrl: "https://example.com/about",
      },
    );
    if (!matchingDocument) {
      throw new Error("Expected to find the attached website knowledge document.");
    }
    if (String(matchingDocument.websiteIngestionJobId) !== String(websiteIngestionJobId)) {
      throw new Error("Expected the existing document to be attached to the latest crawl job.");
    }
    if (matchingDocument.title !== "About Us") {
      throw new Error(`Expected the updated website title, received ${matchingDocument.title}.`);
    }

    const documents = await t.run(async (ctx) => {
      return await ctx.db
        .query("knowledge_documents")
        .withIndex("by_business_id_and_source_url", (q) =>
          q.eq("businessId", businessId).eq("sourceUrl", "https://example.com/about"),
        )
        .collect();
    });
    if (documents.length !== 1) {
      throw new Error(`Expected a single website document, received ${documents.length}.`);
    }
  });

  it("does not mutate website documents while only analyzing a weak crawl", async () => {
    const t = createConvexHarness();
    const subject = "website-weak-analysis-owner";
    const { businessId } = await seedBusinessOwner({
      t,
      onboardingStage: "phone_number",
      subject,
    });

    const { aboutDocumentId, contactDocumentId, aboutStorageId, contactStorageId, websiteIngestionJobId } =
      await t.run(async (ctx) => {
        const aboutStorageId = await ctx.storage.store(
          new Blob(["# About\nOriginal copy"], {
            type: "text/markdown;charset=utf-8",
          }),
        );
        const contactStorageId = await ctx.storage.store(
          new Blob(["# Contact\nOriginal contact copy"], {
            type: "text/markdown;charset=utf-8",
          }),
        );
        const aboutDocumentId = await ctx.db.insert("knowledge_documents", {
          businessId,
          section: "knowledge",
          sourceType: "website",
          sourceUrl: "https://example.com/about",
          title: "Original About",
          extractedTextStorageId: aboutStorageId,
          mimeType: "text/markdown",
          textContent: "Original about preview",
          status: "indexed",
          processingProgress: 100,
          tags: [],
          importance: 85,
          contentHash: "about-hash",
          indexedEntryId: "entry-about",
          indexVersion: KNOWLEDGE_INDEX_VERSION,
        });
        const contactDocumentId = await ctx.db.insert("knowledge_documents", {
          businessId,
          section: "knowledge",
          sourceType: "website",
          sourceUrl: "https://example.com/contact",
          title: "Contact",
          extractedTextStorageId: contactStorageId,
          mimeType: "text/markdown",
          textContent: "Original contact preview",
          status: "indexed",
          processingProgress: 100,
          tags: [],
          importance: 85,
          contentHash: "contact-hash",
          indexedEntryId: "entry-contact",
          indexVersion: KNOWLEDGE_INDEX_VERSION,
        });
        const websiteIngestionJobId = await ctx.db.insert("website_ingestion_jobs", {
          businessId,
          websiteUrl: "https://example.com/",
          provider: "cloudflare_browser_run",
          status: "crawling",
          crawlMode: "http",
          fallbackTriggered: false,
          pageLimit: 40,
          depth: 3,
          importedCount: 0,
          indexedCount: 0,
          errorCount: 0,
        });

        return {
          aboutDocumentId,
          contactDocumentId,
          aboutStorageId,
          contactStorageId,
          websiteIngestionJobId,
        };
      });

    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        result: {
          status: "completed",
          records: [
            {
              url: "https://example.com/about",
              status: "completed",
              markdown: "# About\n" + "weak ".repeat(30),
              metadata: {
                title: "Updated About",
              },
            },
          ],
        },
      }),
    } as Response);

    const summary = await t.action(
      internal.ai.context.websiteIngestionActions.importCloudflareWebsiteCrawlResults,
      {
        websiteIngestionJobId,
        cloudflareJobId: "cf-job-weak-1",
        crawlMode: "http",
        commitChanges: false,
      },
    );

    expect(summary).toMatchObject({
      importedDocumentCount: 1,
      weak: true,
    });
    expect(enqueueActionBatchMock).not.toHaveBeenCalled();
    expect(ragDeleteMock).not.toHaveBeenCalled();

    const aboutDocument = await t.run(async (ctx) => await ctx.db.get(aboutDocumentId));
    expect(aboutDocument?.title).toBe("Original About");
    expect(String(aboutDocument?.extractedTextStorageId)).toBe(String(aboutStorageId));

    const contactDocument = await t.run(async (ctx) => await ctx.db.get(contactDocumentId));
    expect(contactDocument?.title).toBe("Contact");
    expect(String(contactDocument?.extractedTextStorageId)).toBe(String(contactStorageId));
  });

  it("requeues unchanged website documents when a prior index attempt failed", async () => {
    const t = createConvexHarness();
    const subject = "website-retry-owner";
    const { businessId } = await seedBusinessOwner({
      t,
      onboardingStage: "phone_number",
      subject,
    });
    const stableMarkdown = "# About\n" + "hello ".repeat(900);
    const stableHash = await sha256Hex(normalizeWebsiteMarkdown(stableMarkdown));

    const { existingDocumentId, websiteIngestionJobId } = await t.run(async (ctx) => {
      const extractedTextStorageId = await ctx.storage.store(
        new Blob([stableMarkdown], {
          type: "text/markdown;charset=utf-8",
        }),
      );
      const existingDocumentId = await ctx.db.insert("knowledge_documents", {
        businessId,
        section: "knowledge",
        sourceType: "website",
        sourceUrl: "https://example.com/about",
        title: "About",
        extractedTextStorageId,
        mimeType: "text/markdown",
        textContent: "About preview",
        status: "error",
        processingProgress: 100,
        tags: [],
        importance: 85,
        contentHash: stableHash,
        error: "Indexing failed.",
      });

      const websiteIngestionJobId = await ctx.db.insert("website_ingestion_jobs", {
        businessId,
        websiteUrl: "https://example.com",
        provider: "cloudflare_browser_run",
        status: "crawling",
        crawlMode: "http",
        fallbackTriggered: false,
        pageLimit: 40,
        depth: 3,
        importedCount: 0,
        indexedCount: 0,
        errorCount: 0,
      });

      return { existingDocumentId, websiteIngestionJobId };
    });

    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        result: {
          status: "completed",
          records: [
            {
              url: "https://example.com/about",
              status: "completed",
              markdown: stableMarkdown,
              metadata: {
                title: "About Us",
              },
            },
          ],
        },
      }),
    } as Response);

    const summary = await t.action(
      internal.ai.context.websiteIngestionActions.importCloudflareWebsiteCrawlResults,
      {
        websiteIngestionJobId,
        cloudflareJobId: "cf-job-retry-1",
        crawlMode: "http",
      },
    );

    expect(summary).toMatchObject({
      importedDocumentCount: 1,
      weak: false,
    });
    expect(enqueueActionBatchMock).toHaveBeenCalledTimes(1);
    expect(enqueueActionBatchMock).toHaveBeenCalledWith(
      expect.anything(),
      internal.ai.context.knowledge.indexKnowledgeDocument,
      [
        {
          documentId: existingDocumentId,
          skipSnapshotRefresh: true,
        },
      ],
    );

    const updatedDocument = await t.query(
      internal.ai.context.websiteIngestion.getWebsiteKnowledgeDocumentBySourceUrl,
      {
        businessId,
        sourceUrl: "https://example.com/about",
      },
    );
    expect(updatedDocument?.status).toBe("queued");
    expect(updatedDocument?.error).toBeUndefined();
    expect(String(updatedDocument?.websiteIngestionJobId)).toBe(
      String(websiteIngestionJobId),
    );
  });

  it("updates changed website documents in place and enqueues indexing with snapshot refresh suppressed", async () => {
    const t = createConvexHarness();
    const subject = "website-update-owner";
    const { businessId } = await seedBusinessOwner({
      t,
      onboardingStage: "phone_number",
      subject,
    });

    const { websiteIngestionJobId, previousExtractedTextStorageId, existingDocumentId } =
      await t.run(async (ctx) => {
        const previousExtractedTextStorageId = await ctx.storage.store(
          new Blob(["# About\nOriginal copy"], {
            type: "text/markdown;charset=utf-8",
          }),
        );
        const existingDocumentId = await ctx.db.insert("knowledge_documents", {
          businessId,
          section: "knowledge",
          sourceType: "website",
          sourceUrl: "https://example.com/about",
          title: "About",
          extractedTextStorageId: previousExtractedTextStorageId,
          mimeType: "text/markdown",
          textContent: "Original preview",
          status: "indexed",
          processingProgress: 100,
          tags: [],
          importance: 85,
          contentHash: "old-hash",
        });

        const websiteIngestionJobId = await ctx.db.insert("website_ingestion_jobs", {
          businessId,
          websiteUrl: "https://example.com",
          provider: "cloudflare_browser_run",
          status: "crawling",
          crawlMode: "http",
          fallbackTriggered: false,
          pageLimit: 40,
          depth: 3,
          importedCount: 0,
          indexedCount: 0,
          errorCount: 0,
        });

        return { websiteIngestionJobId, previousExtractedTextStorageId, existingDocumentId };
      });

    const updatedMarkdown = "# About\n" + "updated ".repeat(900);
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        result: {
          status: "completed",
          records: [
            {
              url: "https://example.com/about",
              status: "completed",
              markdown: updatedMarkdown,
              metadata: {
                title: "About the Practice",
              },
            },
          ],
        },
      }),
    } as Response);

    const summary = await t.action(
      internal.ai.context.websiteIngestionActions.importCloudflareWebsiteCrawlResults,
      {
        websiteIngestionJobId,
        cloudflareJobId: "cf-job-2",
        crawlMode: "browser",
      },
    );

    expect(summary).toMatchObject({
      importedDocumentCount: 1,
      weak: false,
    });
    expect(enqueueActionBatchMock).toHaveBeenCalledTimes(1);
    expect(enqueueActionBatchMock).toHaveBeenCalledWith(
      expect.anything(),
      internal.ai.context.knowledge.indexKnowledgeDocument,
      [
        {
          documentId: existingDocumentId,
          skipSnapshotRefresh: true,
        },
      ],
    );

    const updatedDocument = await t.query(
      internal.ai.context.websiteIngestion.getWebsiteKnowledgeDocumentBySourceUrl,
      {
        businessId,
        sourceUrl: "https://example.com/about",
      },
    );
    expect(String(updatedDocument?._id)).toBe(String(existingDocumentId));
    expect(updatedDocument?.title).toBe("About the Practice");
    expect(updatedDocument?.status).toBe("queued");
    expect(String(updatedDocument?.websiteIngestionJobId)).toBe(
      String(websiteIngestionJobId),
    );
    expect(updatedDocument?.contentHash).not.toBe("old-hash");
    expect(String(updatedDocument?.extractedTextStorageId)).not.toBe(
      String(previousExtractedTextStorageId),
    );

    const previousStorage = await t.run(async (ctx) => {
      return await ctx.db.system.get("_storage", previousExtractedTextStorageId);
    });
    expect(previousStorage).toBeNull();
  });

  it("keeps the new website blob when previous extracted text cleanup fails", async () => {
    const t = createConvexHarness();
    const subject = "website-update-cleanup-owner";
    const { businessId } = await seedBusinessOwner({
      t,
      onboardingStage: "phone_number",
      subject,
    });

    const { websiteIngestionJobId, previousExtractedTextStorageId, existingDocumentId } =
      await t.run(async (ctx) => {
        const previousExtractedTextStorageId = await ctx.storage.store(
          new Blob(["# About\nOriginal copy"], {
            type: "text/markdown;charset=utf-8",
          }),
        );
        const existingDocumentId = await ctx.db.insert("knowledge_documents", {
          businessId,
          section: "knowledge",
          sourceType: "website",
          sourceUrl: "https://example.com/about",
          title: "About",
          extractedTextStorageId: previousExtractedTextStorageId,
          mimeType: "text/markdown",
          textContent: "Original preview",
          status: "indexed",
          processingProgress: 100,
          tags: [],
          importance: 85,
          contentHash: "old-hash",
        });

        const websiteIngestionJobId = await ctx.db.insert("website_ingestion_jobs", {
          businessId,
          websiteUrl: "https://example.com",
          provider: "cloudflare_browser_run",
          status: "crawling",
          crawlMode: "http",
          fallbackTriggered: false,
          pageLimit: 40,
          depth: 3,
          importedCount: 0,
          indexedCount: 0,
          errorCount: 0,
        });

        return { websiteIngestionJobId, previousExtractedTextStorageId, existingDocumentId };
      });

    failingStorageDeleteIdsRef.value = new Set([String(previousExtractedTextStorageId)]);

    const updatedMarkdown = "# About\n" + "updated ".repeat(900);
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        result: {
          status: "completed",
          records: [
            {
              url: "https://example.com/about",
              status: "completed",
              markdown: updatedMarkdown,
              metadata: {
                title: "About the Practice",
              },
            },
          ],
        },
      }),
    } as Response);

    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      const summary = await t.action(
        internal.ai.context.websiteIngestionActions.importCloudflareWebsiteCrawlResults,
        {
          websiteIngestionJobId,
          cloudflareJobId: "cf-job-cleanup-failure-1",
          crawlMode: "browser",
        },
      );

      expect(summary).toMatchObject({
        importedDocumentCount: 1,
        weak: false,
      });
      expect(enqueueActionBatchMock).toHaveBeenCalledTimes(1);
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);

      const updatedDocument = await t.query(
        internal.ai.context.websiteIngestion.getWebsiteKnowledgeDocumentBySourceUrl,
        {
          businessId,
          sourceUrl: "https://example.com/about",
        },
      );
      expect(String(updatedDocument?._id)).toBe(String(existingDocumentId));
      expect(updatedDocument?.status).toBe("queued");

      const nextExtractedTextStorageId = updatedDocument?.extractedTextStorageId;
      expect(String(nextExtractedTextStorageId)).not.toBe(
        String(previousExtractedTextStorageId),
      );

      const previousStorage = await t.run(async (ctx) => {
        return await ctx.db.system.get("_storage", previousExtractedTextStorageId);
      });
      expect(previousStorage).not.toBeNull();

      const nextStorage = await t.run(async (ctx) => {
        if (!nextExtractedTextStorageId) {
          return null;
        }
        return await ctx.db.system.get("_storage", nextExtractedTextStorageId);
      });
      expect(nextStorage).not.toBeNull();
    } finally {
      consoleWarnSpy.mockRestore();
    }
  });

  it("removes stale website documents when the crawl is fully under the page limit", async () => {
    const t = createConvexHarness();
    const subject = "website-stale-owner";
    const { businessId } = await seedBusinessOwner({
      t,
      onboardingStage: "phone_number",
      subject,
    });

    const { aboutDocumentId, contactDocumentId, staleStorageId, websiteIngestionJobId } =
      await t.run(async (ctx) => {
        const currentMarkdown = "# About\n" + "current ".repeat(900);
        const aboutStorageId = await ctx.storage.store(
          new Blob([currentMarkdown], {
            type: "text/markdown;charset=utf-8",
          }),
        );
        const staleStorageId = await ctx.storage.store(
          new Blob(["# Contact\n" + "old ".repeat(900)], {
            type: "text/markdown;charset=utf-8",
          }),
        );
        const aboutDocumentId = await ctx.db.insert("knowledge_documents", {
          businessId,
          section: "knowledge",
          sourceType: "website",
          sourceUrl: "https://example.com/about",
          title: "About",
          extractedTextStorageId: aboutStorageId,
          mimeType: "text/markdown",
          textContent: "Current about preview",
          status: "indexed",
          processingProgress: 100,
          tags: [],
          importance: 85,
          contentHash: await sha256Hex(normalizeWebsiteMarkdown(currentMarkdown)),
          indexedEntryId: "entry-about",
          indexVersion: KNOWLEDGE_INDEX_VERSION,
        });
        const contactDocumentId = await ctx.db.insert("knowledge_documents", {
          businessId,
          section: "knowledge",
          sourceType: "website",
          sourceUrl: "https://example.com/contact",
          title: "Contact",
          extractedTextStorageId: staleStorageId,
          mimeType: "text/markdown",
          textContent: "Old contact preview",
          status: "indexed",
          processingProgress: 100,
          tags: [],
          importance: 85,
          contentHash: await sha256Hex(
            normalizeWebsiteMarkdown("# Contact\n" + "old ".repeat(900)),
          ),
          indexedEntryId: "entry-contact",
          indexVersion: KNOWLEDGE_INDEX_VERSION,
        });

        const websiteIngestionJobId = await ctx.db.insert("website_ingestion_jobs", {
          businessId,
          websiteUrl: "https://example.com",
          provider: "cloudflare_browser_run",
          status: "crawling",
          crawlMode: "http",
          fallbackTriggered: false,
          pageLimit: 40,
          depth: 3,
          importedCount: 0,
          indexedCount: 0,
          errorCount: 0,
        });

        return { aboutDocumentId, contactDocumentId, staleStorageId, websiteIngestionJobId };
      });

    const currentMarkdown = "# About\n" + "current ".repeat(900);
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        result: {
          status: "completed",
          total: 1,
          records: [
            {
              url: "https://example.com/about",
              status: "completed",
              markdown: currentMarkdown,
              metadata: {
                title: "About",
              },
            },
          ],
        },
      }),
    } as Response);

    const summary = await t.action(
      internal.ai.context.websiteIngestionActions.importCloudflareWebsiteCrawlResults,
      {
        websiteIngestionJobId,
        cloudflareJobId: "cf-job-stale-1",
        crawlMode: "browser",
      },
    );

    expect(summary).toMatchObject({
      importedDocumentCount: 1,
      weak: false,
    });
    expect(enqueueActionBatchMock).not.toHaveBeenCalled();
    expect(ragDeleteMock).toHaveBeenCalledWith(expect.anything(), {
      entryId: "entry-contact",
    });

    const remainingAbout = await t.query(
      internal.ai.context.websiteIngestion.getWebsiteKnowledgeDocumentBySourceUrl,
      {
        businessId,
        sourceUrl: "https://example.com/about",
      },
    );
    expect(String(remainingAbout?._id)).toBe(String(aboutDocumentId));
    expect(String(remainingAbout?.websiteIngestionJobId)).toBe(String(websiteIngestionJobId));

    const removedContact = await t.query(
      internal.ai.context.websiteIngestion.getWebsiteKnowledgeDocumentBySourceUrl,
      {
        businessId,
        sourceUrl: "https://example.com/contact",
      },
    );
    expect(removedContact).toBeNull();

    const removedContactRecord = await t.run(async (ctx) => {
      return await ctx.db.get(contactDocumentId);
    });
    expect(removedContactRecord).toBeNull();

    const staleStorage = await t.run(async (ctx) => {
      return await ctx.db.system.get("_storage", staleStorageId);
    });
    expect(staleStorage).toBeNull();
  });

  it("does not prune website documents that belong to a different imported site", async () => {
    const t = createConvexHarness();
    const subject = "website-cross-site-prune-owner";
    const { businessId } = await seedBusinessOwner({
      t,
      onboardingStage: "phone_number",
      subject,
    });

    const { currentSiteDocumentId, otherSiteDocumentId, otherSiteStorageId, websiteIngestionJobId } =
      await t.run(async (ctx) => {
        const currentMarkdown = "# About\n" + "current ".repeat(900);
        const currentStorageId = await ctx.storage.store(
          new Blob([currentMarkdown], {
            type: "text/markdown;charset=utf-8",
          }),
        );
        const otherSiteMarkdown = "# Menu\n" + "other ".repeat(900);
        const otherSiteStorageId = await ctx.storage.store(
          new Blob([otherSiteMarkdown], {
            type: "text/markdown;charset=utf-8",
          }),
        );
        const currentSiteDocumentId = await ctx.db.insert("knowledge_documents", {
          businessId,
          section: "knowledge",
          sourceType: "website",
          sourceUrl: "https://example.com/about",
          title: "About",
          extractedTextStorageId: currentStorageId,
          mimeType: "text/markdown",
          textContent: "Current about preview",
          status: "indexed",
          processingProgress: 100,
          tags: [],
          importance: 85,
          contentHash: await sha256Hex(normalizeWebsiteMarkdown(currentMarkdown)),
          indexedEntryId: "entry-about",
          indexVersion: KNOWLEDGE_INDEX_VERSION,
        });
        const otherSiteDocumentId = await ctx.db.insert("knowledge_documents", {
          businessId,
          section: "knowledge",
          sourceType: "website",
          sourceUrl: "https://other.com/menu",
          title: "Menu",
          extractedTextStorageId: otherSiteStorageId,
          mimeType: "text/markdown",
          textContent: "Other site menu preview",
          status: "indexed",
          processingProgress: 100,
          tags: [],
          importance: 85,
          contentHash: await sha256Hex(normalizeWebsiteMarkdown(otherSiteMarkdown)),
          indexedEntryId: "entry-other-menu",
          indexVersion: KNOWLEDGE_INDEX_VERSION,
        });

        const websiteIngestionJobId = await ctx.db.insert("website_ingestion_jobs", {
          businessId,
          websiteUrl: "https://example.com",
          provider: "cloudflare_browser_run",
          status: "crawling",
          crawlMode: "browser",
          fallbackTriggered: false,
          pageLimit: 40,
          depth: 3,
          importedCount: 0,
          indexedCount: 0,
          errorCount: 0,
        });

        return {
          currentSiteDocumentId,
          otherSiteDocumentId,
          otherSiteStorageId,
          websiteIngestionJobId,
        };
      });

    const currentMarkdown = "# About\n" + "current ".repeat(900);
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        result: {
          status: "completed",
          total: 1,
          records: [
            {
              url: "https://example.com/about",
              status: "completed",
              markdown: currentMarkdown,
              metadata: {
                title: "About",
              },
            },
          ],
        },
      }),
    } as Response);

    const summary = await t.action(
      internal.ai.context.websiteIngestionActions.importCloudflareWebsiteCrawlResults,
      {
        websiteIngestionJobId,
        cloudflareJobId: "cf-job-cross-site-prune-1",
        crawlMode: "browser",
      },
    );

    expect(summary).toMatchObject({
      importedDocumentCount: 1,
      weak: false,
    });
    expect(enqueueActionBatchMock).not.toHaveBeenCalled();
    expect(ragDeleteMock).not.toHaveBeenCalledWith(expect.anything(), {
      entryId: "entry-other-menu",
    });

    const remainingCurrentSite = await t.query(
      internal.ai.context.websiteIngestion.getWebsiteKnowledgeDocumentBySourceUrl,
      {
        businessId,
        sourceUrl: "https://example.com/about",
      },
    );
    expect(String(remainingCurrentSite?._id)).toBe(String(currentSiteDocumentId));

    const remainingOtherSite = await t.query(
      internal.ai.context.websiteIngestion.getWebsiteKnowledgeDocumentBySourceUrl,
      {
        businessId,
        sourceUrl: "https://other.com/menu",
      },
    );
    expect(String(remainingOtherSite?._id)).toBe(String(otherSiteDocumentId));

    const preservedOtherSiteStorage = await t.run(async (ctx) => {
      return await ctx.db.system.get("_storage", otherSiteStorageId);
    });
    expect(preservedOtherSiteStorage).not.toBeNull();
  });

  it("keeps crawled low-signal pages instead of pruning them as stale", async () => {
    const t = createConvexHarness();
    const subject = "website-low-signal-owner";
    const { businessId } = await seedBusinessOwner({
      t,
      onboardingStage: "phone_number",
      subject,
    });

    const { aboutDocumentId, contactDocumentId, contactStorageId, websiteIngestionJobId } =
      await t.run(async (ctx) => {
        const aboutMarkdown = "# About\n" + "current ".repeat(900);
        const contactMarkdown = "# Contact\n" + "current ".repeat(200);
        const aboutStorageId = await ctx.storage.store(
          new Blob([aboutMarkdown], {
            type: "text/markdown;charset=utf-8",
          }),
        );
        const contactStorageId = await ctx.storage.store(
          new Blob([contactMarkdown], {
            type: "text/markdown;charset=utf-8",
          }),
        );
        const aboutDocumentId = await ctx.db.insert("knowledge_documents", {
          businessId,
          section: "knowledge",
          sourceType: "website",
          sourceUrl: "https://example.com/about",
          title: "About",
          extractedTextStorageId: aboutStorageId,
          mimeType: "text/markdown",
          textContent: "Current about preview",
          status: "indexed",
          processingProgress: 100,
          tags: [],
          importance: 85,
          contentHash: await sha256Hex(normalizeWebsiteMarkdown(aboutMarkdown)),
          indexedEntryId: "entry-about",
          indexVersion: KNOWLEDGE_INDEX_VERSION,
        });
        const contactDocumentId = await ctx.db.insert("knowledge_documents", {
          businessId,
          section: "knowledge",
          sourceType: "website",
          sourceUrl: "https://example.com/contact",
          title: "Contact",
          extractedTextStorageId: contactStorageId,
          mimeType: "text/markdown",
          textContent: "Current contact preview",
          status: "indexed",
          processingProgress: 100,
          tags: [],
          importance: 85,
          contentHash: await sha256Hex(normalizeWebsiteMarkdown(contactMarkdown)),
          indexedEntryId: "entry-contact",
          indexVersion: KNOWLEDGE_INDEX_VERSION,
        });

        const websiteIngestionJobId = await ctx.db.insert("website_ingestion_jobs", {
          businessId,
          websiteUrl: "https://example.com",
          provider: "cloudflare_browser_run",
          status: "crawling",
          crawlMode: "http",
          fallbackTriggered: false,
          pageLimit: 40,
          depth: 3,
          importedCount: 0,
          indexedCount: 0,
          errorCount: 0,
        });

        return { aboutDocumentId, contactDocumentId, contactStorageId, websiteIngestionJobId };
      });

    const aboutMarkdown = "# About\n" + "current ".repeat(900);
    const lowSignalContactMarkdown = "# Contact\nCall us today";
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        result: {
          status: "completed",
          total: 2,
          records: [
            {
              url: "https://example.com/about",
              status: "completed",
              markdown: aboutMarkdown,
              metadata: {
                title: "About",
              },
            },
            {
              url: "https://example.com/contact",
              status: "completed",
              markdown: lowSignalContactMarkdown,
              metadata: {
                title: "Contact",
              },
            },
          ],
        },
      }),
    } as Response);

    const summary = await t.action(
      internal.ai.context.websiteIngestionActions.importCloudflareWebsiteCrawlResults,
      {
        websiteIngestionJobId,
        cloudflareJobId: "cf-job-low-signal-1",
        crawlMode: "browser",
      },
    );

    expect(summary).toMatchObject({
      importedDocumentCount: 1,
      weak: false,
    });
    expect(enqueueActionBatchMock).not.toHaveBeenCalled();
    expect(ragDeleteMock).not.toHaveBeenCalledWith(expect.anything(), {
      entryId: "entry-contact",
    });

    const remainingAbout = await t.query(
      internal.ai.context.websiteIngestion.getWebsiteKnowledgeDocumentBySourceUrl,
      {
        businessId,
        sourceUrl: "https://example.com/about",
      },
    );
    expect(String(remainingAbout?._id)).toBe(String(aboutDocumentId));

    const remainingContact = await t.query(
      internal.ai.context.websiteIngestion.getWebsiteKnowledgeDocumentBySourceUrl,
      {
        businessId,
        sourceUrl: "https://example.com/contact",
      },
    );
    expect(String(remainingContact?._id)).toBe(String(contactDocumentId));
    expect(String(remainingContact?.websiteIngestionJobId)).not.toBe(
      String(websiteIngestionJobId),
    );

    const preservedStorage = await t.run(async (ctx) => {
      return await ctx.db.system.get("_storage", contactStorageId);
    });
    expect(preservedStorage).not.toBeNull();
  });

  it("skips HTTP error pages and prunes them from website knowledge", async () => {
    const t = createConvexHarness();
    const subject = "website-http-error-owner";
    const { businessId } = await seedBusinessOwner({
      t,
      onboardingStage: "phone_number",
      subject,
    });

    const { aboutDocumentId, contactDocumentId, contactStorageId, websiteIngestionJobId } =
      await t.run(async (ctx) => {
        const aboutMarkdown = "# About\n" + "current ".repeat(900);
        const contactMarkdown = "# Contact\n" + "current ".repeat(200);
        const aboutStorageId = await ctx.storage.store(
          new Blob([aboutMarkdown], {
            type: "text/markdown;charset=utf-8",
          }),
        );
        const contactStorageId = await ctx.storage.store(
          new Blob([contactMarkdown], {
            type: "text/markdown;charset=utf-8",
          }),
        );
        const aboutDocumentId = await ctx.db.insert("knowledge_documents", {
          businessId,
          section: "knowledge",
          sourceType: "website",
          sourceUrl: "https://example.com/about",
          title: "About",
          extractedTextStorageId: aboutStorageId,
          mimeType: "text/markdown",
          textContent: "Current about preview",
          status: "indexed",
          processingProgress: 100,
          tags: [],
          importance: 85,
          contentHash: await sha256Hex(normalizeWebsiteMarkdown(aboutMarkdown)),
          indexedEntryId: "entry-about",
          indexVersion: KNOWLEDGE_INDEX_VERSION,
        });
        const contactDocumentId = await ctx.db.insert("knowledge_documents", {
          businessId,
          section: "knowledge",
          sourceType: "website",
          sourceUrl: "https://example.com/contact",
          title: "Contact",
          extractedTextStorageId: contactStorageId,
          mimeType: "text/markdown",
          textContent: "Current contact preview",
          status: "indexed",
          processingProgress: 100,
          tags: [],
          importance: 85,
          contentHash: await sha256Hex(normalizeWebsiteMarkdown(contactMarkdown)),
          indexedEntryId: "entry-contact",
          indexVersion: KNOWLEDGE_INDEX_VERSION,
        });

        const websiteIngestionJobId = await ctx.db.insert("website_ingestion_jobs", {
          businessId,
          websiteUrl: "https://example.com",
          provider: "cloudflare_browser_run",
          status: "crawling",
          crawlMode: "http",
          fallbackTriggered: false,
          pageLimit: 40,
          depth: 3,
          importedCount: 0,
          indexedCount: 0,
          errorCount: 0,
        });

        return { aboutDocumentId, contactDocumentId, contactStorageId, websiteIngestionJobId };
      });

    const aboutMarkdown = "# About\n" + "current ".repeat(900);
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        result: {
          status: "completed",
          total: 2,
          records: [
            {
              url: "https://example.com/about",
              status: "completed",
              markdown: aboutMarkdown,
              metadata: {
                status: 200,
                title: "About",
              },
            },
            {
              url: "https://example.com/contact",
              status: "completed",
              markdown: "# 404\nNot found",
              metadata: {
                status: 404,
                title: "Not Found",
              },
            },
          ],
        },
      }),
    } as Response);

    const summary = await t.action(
      internal.ai.context.websiteIngestionActions.importCloudflareWebsiteCrawlResults,
      {
        websiteIngestionJobId,
        cloudflareJobId: "cf-job-http-error-1",
        crawlMode: "browser",
      },
    );

    expect(summary).toMatchObject({
      importedDocumentCount: 1,
      weak: false,
    });
    expect(enqueueActionBatchMock).not.toHaveBeenCalled();
    expect(ragDeleteMock).toHaveBeenCalledWith(expect.anything(), {
      entryId: "entry-contact",
    });

    const remainingAbout = await t.query(
      internal.ai.context.websiteIngestion.getWebsiteKnowledgeDocumentBySourceUrl,
      {
        businessId,
        sourceUrl: "https://example.com/about",
      },
    );
    expect(String(remainingAbout?._id)).toBe(String(aboutDocumentId));

    const removedContact = await t.query(
      internal.ai.context.websiteIngestion.getWebsiteKnowledgeDocumentBySourceUrl,
      {
        businessId,
        sourceUrl: "https://example.com/contact",
      },
    );
    expect(removedContact).toBeNull();

    const removedContactRecord = await t.run(async (ctx) => {
      return await ctx.db.get(contactDocumentId);
    });
    expect(removedContactRecord).toBeNull();

    const removedContactStorage = await t.run(async (ctx) => {
      return await ctx.db.system.get("_storage", contactStorageId);
    });
    expect(removedContactStorage).toBeNull();
  });

  it("does not reclaim unseen website pages from a crawl that reaches the page limit", async () => {
    const t = createConvexHarness();
    const subject = "website-storage-reclaim-owner";
    const { businessId } = await seedBusinessOwner({
      t,
      onboardingStage: "phone_number",
      subject,
    });
    billingLimitBytesRef.value = 750;

    const { websiteIngestionJobId, existingAboutId, staleContactId } = await t.run(async (ctx) => {
      const existingAboutMarkdown = "# About\n" + "a".repeat(220);
      const staleContactMarkdown = "# Contact\n" + "b".repeat(420);
      const aboutStorageId = await ctx.storage.store(
        new Blob([existingAboutMarkdown], {
          type: "text/markdown;charset=utf-8",
        }),
      );
      const contactStorageId = await ctx.storage.store(
        new Blob([staleContactMarkdown], {
          type: "text/markdown;charset=utf-8",
        }),
      );

      const existingAboutId = await ctx.db.insert("knowledge_documents", {
        businessId,
        section: "knowledge",
        sourceType: "website",
        sourceUrl: "https://example.com/about",
        title: "About",
        extractedTextStorageId: aboutStorageId,
        mimeType: "text/markdown",
        textContent: "About preview",
        status: "indexed",
        processingProgress: 100,
        tags: [],
        importance: 85,
        contentHash: "old-about-hash",
        indexedEntryId: "entry-about",
        indexVersion: KNOWLEDGE_INDEX_VERSION,
      });
      const staleContactId = await ctx.db.insert("knowledge_documents", {
        businessId,
        section: "knowledge",
        sourceType: "website",
        sourceUrl: "https://example.com/contact",
        title: "Contact",
        extractedTextStorageId: contactStorageId,
        mimeType: "text/markdown",
        textContent: "Contact preview",
        status: "indexed",
        processingProgress: 100,
        tags: [],
        importance: 85,
        contentHash: "old-contact-hash",
        indexedEntryId: "entry-contact",
        indexVersion: KNOWLEDGE_INDEX_VERSION,
      });
      const websiteIngestionJobId = await ctx.db.insert("website_ingestion_jobs", {
        businessId,
        websiteUrl: "https://example.com/",
        provider: "cloudflare_browser_run",
        status: "crawling",
        crawlMode: "http",
        fallbackTriggered: false,
        pageLimit: 40,
        depth: 3,
        importedCount: 0,
        indexedCount: 0,
        errorCount: 0,
      });

      return { websiteIngestionJobId, existingAboutId, staleContactId };
    });

    const updatedAboutMarkdown = "# About\n" + "c".repeat(360);
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        result: {
          status: "completed",
          total: 40,
          records: [
            {
              url: "https://example.com/about",
              status: "completed",
              markdown: updatedAboutMarkdown,
              metadata: {
                title: "Updated About",
              },
            },
          ],
        },
      }),
    } as Response);

    await expect(
      t.action(internal.ai.context.websiteIngestionActions.importCloudflareWebsiteCrawlResults, {
        websiteIngestionJobId,
        cloudflareJobId: "cf-job-storage-1",
        crawlMode: "browser",
      }),
    ).rejects.toThrow("Knowledge storage limit reached.");
    expect(enqueueActionBatchMock).not.toHaveBeenCalled();
    expect(ragDeleteMock).not.toHaveBeenCalled();

    const updatedAbout = await t.run(async (ctx) => await ctx.db.get(existingAboutId));
    expect(updatedAbout?.title).toBe("About");

    const preservedContact = await t.run(async (ctx) => await ctx.db.get(staleContactId));
    expect(preservedContact).not.toBeNull();
  });
});
