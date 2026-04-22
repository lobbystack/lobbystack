import { register as registerRateLimiter } from "@convex-dev/rate-limiter/test";
import { convexTest, type TestConvex } from "convex-test";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api, internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { normalizeWebsiteMarkdown } from "../lib/websiteIngestion";
import schema from "../schema";
import { modules } from "../test.setup";

const { enqueueActionBatchMock, workflowStartMock } = vi.hoisted(() => ({
  enqueueActionBatchMock: vi.fn(async () => null),
  workflowStartMock: vi.fn(async () => null),
}));

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
      start: workflowStartMock,
    },
  };
});

type ConvexHarness = TestConvex<typeof schema>;

const convexModules = modules;
const originalCloudflareAccountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const originalCloudflareApiToken = process.env.CLOUDFLARE_API_TOKEN;

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

    workflowStartMock.mockReset();
    enqueueActionBatchMock.mockReset();
    workflowStartMock.mockResolvedValue(null);
    enqueueActionBatchMock.mockResolvedValue(null);

    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  afterAll(() => {
    process.env.CLOUDFLARE_ACCOUNT_ID = originalCloudflareAccountId;
    process.env.CLOUDFLARE_API_TOKEN = originalCloudflareApiToken;
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

    const result = await authed.mutation(api.onboarding.websites.submitOnboardingWebsite, {
      businessId,
      websiteUrl: "example.com/about/?utm_source=test#team",
    });

    expect(result.websiteUrl).toBe("https://example.com/about");
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
    expect(business?.websiteUrl).toBe("https://example.com/about");
    expect(business?.onboardingStage).toBe("phone_number");

    const jobs = await listWebsiteIngestionJobs(t, businessId);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      businessId,
      websiteUrl: "https://example.com/about",
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
        websiteUrl: "https://example.com",
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
      url: "https://example.com",
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
    expect(body.options).toMatchObject({
      includePatterns: ["https://example.com/**"],
    });
    expect(Array.isArray(body.options?.excludePatterns)).toBe(true);
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
});
