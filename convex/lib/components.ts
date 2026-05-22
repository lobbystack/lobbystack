import { ActionRetrier } from "@convex-dev/action-retrier";
import { Agent } from "@convex-dev/agent";
import { Crons } from "@convex-dev/crons";
import { PersistentTextStreaming } from "@convex-dev/persistent-text-streaming";
import { RAG } from "@convex-dev/rag";
import { DAY, HOUR, MINUTE, RateLimiter } from "@convex-dev/rate-limiter";
import { WorkflowManager } from "@convex-dev/workflow";
import { Workpool } from "@convex-dev/workpool";
import { FirecrawlScrape } from "convex-firecrawl-scrape";

import { components } from "../_generated/api";
import {
  createEmbeddingModel,
  getEmbeddingConfig,
} from "./providers/embeddings";
import { createNonRealtimeTextModel } from "./providers/nonRealtimeText";

type KnowledgeFilters = {
  businessId: string;
  sourceType: string;
  businessAndSource: {
    businessId: string;
    sourceType: string;
  };
};

const embeddingConfig = getEmbeddingConfig();

export const KNOWLEDGE_INDEX_VERSION = `${embeddingConfig.modelId}-v1`;

export function getKnowledgeNamespace(businessId: string): string {
  return `knowledge:${KNOWLEDGE_INDEX_VERSION}:business:${businessId}`;
}

export const receptionistAgent = new Agent(components.agent, {
  name: "Receptionist Preview Agent",
  // Keep non-realtime text work on Gemini. OpenAI stays reserved for live voice.
  languageModel: createNonRealtimeTextModel(),
  instructions:
    "You are the admin-side receptionist preview agent. Use the supplied snapshot and retrieved knowledge. Never invent hours, bookings, or transfer policy.",
  maxSteps: 4,
});

export const rag = new RAG<KnowledgeFilters>(components.rag, {
  textEmbeddingModel: createEmbeddingModel(embeddingConfig.modelId),
  embeddingDimension: embeddingConfig.dimension,
  filterNames: ["businessId", "sourceType", "businessAndSource"],
});

export const persistentTextStreaming = new PersistentTextStreaming(
  components.persistentTextStreaming,
);

export const workflowManager = new WorkflowManager(components.workflow);

export const highPriorityWorkpool = new Workpool(components.highPriorityWorkpool, {
  maxParallelism: 10,
});

export const bulkWorkpool = new Workpool(components.bulkWorkpool, {
  maxParallelism: 2,
});

export const retrier = new ActionRetrier(components.actionRetrier);

export const runtimeCrons = new Crons(components.crons);

export const firecrawlScrape = new FirecrawlScrape(components.firecrawlScrape);

export const onboardingRateLimiter = new RateLimiter(components.rateLimiter, {
  onboardingBusinessBootstrapPerHour: {
    kind: "fixed window",
    rate: 3,
    period: HOUR,
  },
  onboardingBusinessBootstrapPerDay: {
    kind: "fixed window",
    rate: 10,
    period: DAY,
  },
  onboardingVerificationSendPerUserPerHour: {
    kind: "fixed window",
    rate: 5,
    period: HOUR,
  },
  onboardingVerificationSendPerPhonePerHour: {
    kind: "fixed window",
    rate: 3,
    period: HOUR,
  },
  onboardingInventorySearchPerTenMinutes: {
    kind: "fixed window",
    rate: 20,
    period: 10 * MINUTE,
  },
  onboardingInitialSuggestionPerTenMinutes: {
    kind: "fixed window",
    rate: 10,
    period: 10 * MINUTE,
  },
  onboardingClaimAttemptPerHour: {
    kind: "fixed window",
    rate: 3,
    period: HOUR,
  },
});

export const dashboardAbuseRateLimiter = new RateLimiter(components.rateLimiter, {
  dashboardFeedbackSubmissionPerUserPerHour: {
    kind: "fixed window",
    rate: 5,
    period: HOUR,
  },
  dashboardFeedbackSubmissionPerBusinessPerHour: {
    kind: "fixed window",
    rate: 25,
    period: HOUR,
  },
  dashboardTestNotificationPerUserPerHour: {
    kind: "fixed window",
    rate: 5,
    period: HOUR,
  },
});

export const webVoiceAbuseRateLimiter = new RateLimiter(components.rateLimiter, {
  webVoiceStartGlobalPerMinute: {
    kind: "fixed window",
    rate: 120,
    period: MINUTE,
  },
  webVoiceStartPerBusinessPerHour: {
    kind: "fixed window",
    rate: 60,
    period: HOUR,
  },
  webVoiceStartPerBusinessPerDay: {
    kind: "fixed window",
    rate: 300,
    period: DAY,
  },
  webVoiceStartPerOriginPerTenMinutes: {
    kind: "fixed window",
    rate: 30,
    period: 10 * MINUTE,
  },
  webVoiceStartPerIpPerHour: {
    kind: "fixed window",
    rate: 5,
    period: HOUR,
  },
  webVoiceStartPerIpPerDay: {
    kind: "fixed window",
    rate: 10,
    period: DAY,
  },
  webVoiceStartPerVisitorPerHour: {
    kind: "fixed window",
    rate: 5,
    period: HOUR,
  },
  webVoiceStartPerVisitorPerDay: {
    kind: "fixed window",
    rate: 10,
    period: DAY,
  },
});
