import {
  boolean,
  index,
  integer,
  jsonb,
  pgSchema,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import {
  businessIdColumn,
  id,
  legacyConvexId,
  timestamps,
  vector1536,
} from "./_common";

export const knowledgeSchema = pgSchema("app");

export const knowledgeDocuments = knowledgeSchema.table(
  "knowledge_documents",
  {
    id: id(),
    businessId: businessIdColumn(),
    title: text("title").notNull(),
    sourceType: text("source_type").notNull(),
    sourceUrl: text("source_url"),
    storageObjectId: text("storage_object_id"),
    mimeType: text("mime_type"),
    status: text("status").notNull().default("pending"),
    section: text("section"),
    contentHash: text("content_hash"),
    metadataJson: jsonb("metadata_json"),
    processedAt: timestamp("processed_at", {
      withTimezone: true,
      mode: "date",
    }),
    legacyConvexId: legacyConvexId(),
    ...timestamps(),
  },
  (table) => [
    index("knowledge_documents_business_id_idx").on(table.businessId),
    index("knowledge_documents_status_idx").on(table.status),
  ],
);

export const knowledgeChunks = knowledgeSchema.table(
  "knowledge_chunks",
  {
    id: id(),
    businessId: businessIdColumn(),
    documentId: text("document_id").notNull(),
    chunkIndex: integer("chunk_index").notNull(),
    content: text("content").notNull(),
    tokenCount: integer("token_count"),
    embedding: vector1536("embedding"),
    metadataJson: jsonb("metadata_json"),
    legacyConvexId: legacyConvexId(),
    ...timestamps(),
  },
  (table) => [
    index("knowledge_chunks_document_id_idx").on(table.documentId),
    index("knowledge_chunks_business_id_idx").on(table.businessId),
  ],
);

export const knowledgeSnippets = knowledgeSchema.table(
  "knowledge_snippets",
  {
    id: id(),
    businessId: businessIdColumn(),
    title: text("title").notNull(),
    content: text("content").notNull(),
    tagsJson: jsonb("tags_json"),
    priority: integer("priority").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    legacyConvexId: legacyConvexId(),
    ...timestamps(),
  },
  (table) => [
    index("knowledge_snippets_business_id_idx").on(table.businessId),
  ],
);

export const agentRules = knowledgeSchema.table(
  "agent_rules",
  {
    id: id(),
    businessId: businessIdColumn(),
    title: text("title").notNull(),
    content: text("content").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    legacyConvexId: legacyConvexId(),
    ...timestamps(),
  },
  (table) => [index("agent_rules_business_id_idx").on(table.businessId)],
);

export const contextSnapshots = knowledgeSchema.table(
  "context_snapshots",
  {
    id: id(),
    businessId: businessIdColumn(),
    version: integer("version").notNull(),
    status: text("status").notNull().default("building"),
    payloadJson: jsonb("payload_json").notNull(),
    publishedAt: timestamp("published_at", {
      withTimezone: true,
      mode: "date",
    }),
    legacyConvexId: legacyConvexId(),
    ...timestamps(),
  },
  (table) => [
    index("context_snapshots_business_id_idx").on(table.businessId),
    index("context_snapshots_business_version_idx").on(
      table.businessId,
      table.version,
    ),
  ],
);

export const websiteScrapeJobs = knowledgeSchema.table(
  "website_scrape_jobs",
  {
    id: id(),
    businessId: businessIdColumn(),
    url: text("url").notNull(),
    status: text("status").notNull().default("queued"),
    provider: text("provider").notNull().default("firecrawl"),
    resultJson: jsonb("result_json"),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }),
    completedAt: timestamp("completed_at", {
      withTimezone: true,
      mode: "date",
    }),
    legacyConvexId: legacyConvexId(),
    ...timestamps(),
  },
  (table) => [
    index("website_scrape_jobs_business_id_idx").on(table.businessId),
    index("website_scrape_jobs_status_idx").on(table.status),
  ],
);
