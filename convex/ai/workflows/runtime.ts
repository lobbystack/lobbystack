import type { WorkflowCtx } from "@convex-dev/workflow";
import { v } from "convex/values";
import { internalMutation } from "../../_generated/server";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { CALENDAR_RECONCILIATION_INTERVAL_MS } from "../../integrations/calendar";
import { workflowManager, runtimeCrons } from "../../lib/components";
import {
  WEBSITE_CRAWL_FIRECRAWL_MODE,
  WEBSITE_INGESTION_PROVIDER,
} from "../../lib/websiteIngestion";
import { enqueuePostHogOutboxRecord, serializePostHogEvent } from "../../telemetry/posthog";
import {
  getPostHogBusinessGroupKey,
  getPostHogDistinctIdForBusinessSystem,
} from "../../telemetry/shared";

const WEBSITE_CRAWL_RESULTS_POLL_DELAY_MS = 5_000;

async function waitForFirecrawlWebsiteCrawlCompletion(
  step: WorkflowCtx,
  input: {
    websiteIngestionJobId: Id<"website_ingestion_jobs">;
    providerJobId: string;
  },
) {
  let crawlStatus = await step.runAction(
    internal.ai.context.websiteIngestionActions.getFirecrawlWebsiteCrawlJobStatus,
    input,
    { retry: true },
  );

  while (crawlStatus.status === "running") {
    crawlStatus = await step.runAction(
      internal.ai.context.websiteIngestionActions.getFirecrawlWebsiteCrawlJobStatus,
      input,
      { retry: true, runAfter: WEBSITE_CRAWL_RESULTS_POLL_DELAY_MS },
    );
  }

  return crawlStatus;
}

async function waitForFirecrawlImportSummary(
  step: WorkflowCtx,
  input: {
    websiteIngestionJobId: Id<"website_ingestion_jobs">;
    providerJobId: string;
    commitChanges: boolean;
  },
) {
  let importSummary = await step.runAction(
    internal.ai.context.websiteIngestionActions.importFirecrawlWebsiteCrawlResults,
    input,
    { retry: true },
  );

  while (importSummary.resultsReady === false) {
    importSummary = await step.runAction(
      internal.ai.context.websiteIngestionActions.importFirecrawlWebsiteCrawlResults,
      input,
      { retry: true, runAfter: WEBSITE_CRAWL_RESULTS_POLL_DELAY_MS },
    );
  }

  return importSummary;
}

export const refreshBusinessContextSnapshotWorkflow = workflowManager.define({
  args: {
    businessId: v.id("businesses"),
  },
  returns: v.null(),
  handler: async (step, args): Promise<null> => {
    await step.runMutation(internal.ai.context.snapshots.refreshSnapshot, {
      businessId: args.businessId,
    });
    return null;
  },
});

export const afterAppointmentBookedWorkflow = workflowManager.define({
  args: {
    appointmentId: v.id("appointments"),
  },
  returns: v.null(),
  handler: async (step, args): Promise<null> => {
    await step.runMutation(
      internal.notifications.reminders.createAppointmentNotifications,
      { appointmentId: args.appointmentId },
    );
    return null;
  },
});

export const appointmentCalendarSyncWorkflow = workflowManager.define({
  args: {
    appointmentId: v.id("appointments"),
  },
  returns: v.null(),
  handler: async (step, args): Promise<null> => {
    await step.runAction(
      internal.integrations.calendar.syncAppointmentToExternalCalendars,
      { appointmentId: args.appointmentId },
      { retry: true },
    );
    return null;
  },
});

export const importWebsiteKnowledgeWorkflow = workflowManager.define({
  args: {
    websiteIngestionJobId: v.id("website_ingestion_jobs"),
  },
  returns: v.null(),
  handler: async (step, args): Promise<null> => {
    try {
      const job = await step.runQuery(
        internal.ai.context.websiteIngestion.getWebsiteIngestionJobRecord,
        {
          websiteIngestionJobId: args.websiteIngestionJobId,
        },
      );

      if (!job) {
        throw new Error("Website ingestion job not found.");
      }

      if (job.provider === WEBSITE_INGESTION_PROVIDER) {
        const startedAt = new Date().toISOString();
        await step.runMutation(internal.ai.context.websiteIngestion.patchWebsiteIngestionJob, {
          websiteIngestionJobId: args.websiteIngestionJobId,
          status: "crawling",
          crawlMode: WEBSITE_CRAWL_FIRECRAWL_MODE,
          startedAt,
          lastProgressAt: startedAt,
          crawlFinishedCount: 8,
          crawlTotalCount: 100,
          lastError: null,
        });

        const crawl = await step.runAction(
          internal.ai.context.websiteIngestionActions.submitFirecrawlWebsiteCrawl,
          {
            websiteIngestionJobId: args.websiteIngestionJobId,
          },
          { retry: true },
        );

        await step.runMutation(internal.ai.context.websiteIngestion.patchWebsiteIngestionJob, {
          websiteIngestionJobId: args.websiteIngestionJobId,
          status: "crawling",
          providerJobId: crawl.providerJobId,
          crawlMode: crawl.crawlMode,
          lastError: null,
        });

        const crawlStatus = await waitForFirecrawlWebsiteCrawlCompletion(step, {
          websiteIngestionJobId: args.websiteIngestionJobId,
          providerJobId: crawl.providerJobId,
        });

        if (crawlStatus.status !== "completed") {
          await step.runMutation(internal.ai.context.websiteIngestion.patchWebsiteIngestionJob, {
            websiteIngestionJobId: args.websiteIngestionJobId,
            status: "failed",
            lastError: `Website crawl ended with status ${crawlStatus.status}.`,
            completedAt: new Date().toISOString(),
          });
          return null;
        }

        const importSummary = await waitForFirecrawlImportSummary(step, {
          websiteIngestionJobId: args.websiteIngestionJobId,
          providerJobId: crawl.providerJobId,
          commitChanges: true,
        });

        if (importSummary.aborted) {
          return null;
        }

        if (importSummary.importedDocumentCount === 0) {
          await step.runMutation(internal.ai.context.websiteIngestion.patchWebsiteIngestionJob, {
            websiteIngestionJobId: args.websiteIngestionJobId,
            status: "failed",
            lastError: "We couldn't import any public website pages from this site.",
            completedAt: new Date().toISOString(),
          });
          return null;
        }

        let indexingCounts = await step.runAction(
          internal.ai.context.websiteIngestionActions.waitForWebsiteIngestionDocuments,
          {
            websiteIngestionJobId: args.websiteIngestionJobId,
          },
          { retry: true },
        );

        while (indexingCounts.pending > 0) {
          indexingCounts = await step.runAction(
            internal.ai.context.websiteIngestionActions.waitForWebsiteIngestionDocuments,
            {
              websiteIngestionJobId: args.websiteIngestionJobId,
            },
            { retry: true, runAfter: 5_000 },
          );
        }

        await step.runMutation(internal.ai.context.snapshots.refreshSnapshot, {
          businessId: indexingCounts.businessId,
        });

        await step.runMutation(internal.ai.context.websiteIngestion.patchWebsiteIngestionJob, {
          websiteIngestionJobId: args.websiteIngestionJobId,
          status: indexingCounts.indexed > 0 ? "completed" : "failed",
          indexedCount: indexingCounts.indexed,
          errorCount: indexingCounts.error,
          lastError:
            indexingCounts.indexed > 0 ? null : "Website pages were imported but failed to index.",
          completedAt: new Date().toISOString(),
        });

        return null;
      }

      throw new Error(`Unsupported website ingestion provider: ${job.provider}.`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Website import failed unexpectedly.";

      await step.runMutation(internal.ai.context.websiteIngestion.patchWebsiteIngestionJob, {
        websiteIngestionJobId: args.websiteIngestionJobId,
        status: "failed",
        lastError: message,
        completedAt: new Date().toISOString(),
      });
    }
    return null;
  },
});

export const kickoffSnapshotRefresh = internalMutation({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    await workflowManager.start(
      ctx,
      internal.ai.workflows.runtime.refreshBusinessContextSnapshotWorkflow,
      { businessId: args.businessId },
    );
    await enqueuePostHogOutboxRecord(
      ctx,
      serializePostHogEvent({
        eventName: "workflow.started",
        businessId: args.businessId,
        distinctId: getPostHogDistinctIdForBusinessSystem(String(args.businessId)),
        groupKey: getPostHogBusinessGroupKey(String(args.businessId)),
        properties: {
          workflowName: "refreshBusinessContextSnapshotWorkflow",
        },
      }),
    );
    return null;
  },
});

export const registerCalendarReconciliationCron = internalMutation({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args): Promise<string> => {
    const name = `calendar-reconcile-${String(args.businessId)}`;
    const existing = await runtimeCrons.get(ctx, { name });
    if (existing !== null) {
      return name;
    }

    await runtimeCrons.register(
      ctx,
      { kind: "interval", ms: CALENDAR_RECONCILIATION_INTERVAL_MS },
      internal.integrations.calendar.runBusinessCalendarReconciliation,
      { businessId: args.businessId },
      name,
    );
    return name;
  },
});
