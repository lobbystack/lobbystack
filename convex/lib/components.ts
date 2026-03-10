import { google } from "@ai-sdk/google";
import { ActionRetrier } from "@convex-dev/action-retrier";
import { Agent } from "@convex-dev/agent";
import { Crons } from "@convex-dev/crons";
import { PersistentTextStreaming } from "@convex-dev/persistent-text-streaming";
import { RAG } from "@convex-dev/rag";
import { WorkflowManager } from "@convex-dev/workflow";
import { Workpool } from "@convex-dev/workpool";

import { components } from "../_generated/api";

type KnowledgeFilters = {
  businessId: string;
  sourceType: string;
  businessAndSource: {
    businessId: string;
    sourceType: string;
  };
};

export const KNOWLEDGE_INDEX_VERSION = "gemini-embedding-001-v1";

export function getKnowledgeNamespace(businessId: string): string {
  return `knowledge:${KNOWLEDGE_INDEX_VERSION}:business:${businessId}`;
}

export const receptionistAgent = new Agent(components.agent, {
  name: "Receptionist Preview Agent",
  // Keep non-realtime text work on Gemini. OpenAI stays reserved for live voice.
  languageModel: google("gemini-3.1-flash-lite-preview"),
  instructions:
    "You are the admin-side receptionist preview agent. Use the supplied snapshot and retrieved knowledge. Never invent hours, bookings, or transfer policy.",
  maxSteps: 4,
});

export const rag = new RAG<KnowledgeFilters>(components.rag, {
  textEmbeddingModel: google.embedding("gemini-embedding-001"),
  embeddingDimension: 3072,
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
