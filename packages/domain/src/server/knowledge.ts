import { createHash } from "node:crypto";

import { businesses, knowledgeChunks, knowledgeDocuments, storageObjects } from "@lobbystack/db";
import type { CreateKnowledgeDocumentRequest } from "@lobbystack/contracts";
import { and, desc, eq, sql } from "drizzle-orm";

import {
  enqueueSideEffect,
  getAppPool,
  getWorkerPool,
  withDomainTransaction,
  type DomainDb,
  type TransactionContext,
} from "./context";

export function hasMeaningfulDocumentText(text: string): boolean {
  return text.replace(/\s+/g, "").length >= 80;
}

const DEFAULT_CHUNK_SIZE = 1_200;
const DEFAULT_CHUNK_OVERLAP = 120;

export function chunkKnowledgeText(
  text: string,
  options: { maxCharacters?: number; overlapCharacters?: number } = {},
): string[] {
  const maxCharacters = options.maxCharacters ?? DEFAULT_CHUNK_SIZE;
  const overlapCharacters = Math.min(
    options.overlapCharacters ?? DEFAULT_CHUNK_OVERLAP,
    Math.floor(maxCharacters / 2),
  );

  const normalized = text.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").trim();
  if (!normalized) {
    return [];
  }

  const chunks: string[] = [];
  let cursor = 0;

  while (cursor < normalized.length) {
    let end = Math.min(normalized.length, cursor + maxCharacters);
    if (end < normalized.length) {
      const paragraphBreak = normalized.lastIndexOf("\n\n", end);
      const sentenceBreak = normalized.lastIndexOf(". ", end);
      const softBreak = normalized.lastIndexOf(" ", end);
      end =
        paragraphBreak > cursor + maxCharacters / 2
          ? paragraphBreak
          : sentenceBreak > cursor + maxCharacters / 2
            ? sentenceBreak + 1
            : softBreak > cursor + maxCharacters / 2
              ? softBreak
              : end;
    }

    const chunk = normalized.slice(cursor, end).trim();
    if (chunk) {
      chunks.push(chunk);
    }

    if (end >= normalized.length) {
      break;
    }

    cursor = Math.max(cursor + 1, end - overlapCharacters);
  }

  return chunks;
}

export async function createKnowledgeDocument(input: {
  businessId: string;
  userId: string;
  values: CreateKnowledgeDocumentRequest;
  pool?: TransactionContext["pool"];
}) {
  const contentHash = createHash("sha256").update(input.values.textContent).digest("hex");

  return withDomainTransaction(
    {
      businessId: input.businessId,
      userId: input.userId,
      actorType: "user",
      pool: input.pool ?? getAppPool(),
    },
    async (db) => persistKnowledgeDocument(db, input.businessId, {
      title: input.values.title,
      sourceType: input.values.sourceType,
      textContent: input.values.textContent,
      contentHash,
      ...(input.values.sourceUri ? { sourceUrl: input.values.sourceUri } : {}),
    }),
  );
}

async function persistKnowledgeDocument(
  db: DomainDb,
  businessId: string,
  input: {
    title: string;
    sourceType: string;
    textContent: string;
    contentHash: string;
    sourceUrl?: string;
    storageObjectId?: string;
  },
) {
  const [existing] = await db
    .select({ id: knowledgeDocuments.id, status: knowledgeDocuments.status })
    .from(knowledgeDocuments)
    .where(
      and(
        eq(knowledgeDocuments.businessId, businessId),
        eq(knowledgeDocuments.contentHash, input.contentHash),
      ),
    )
    .limit(1);

  if (existing) {
    return existing;
  }

  const [document] = await db
    .insert(knowledgeDocuments)
    .values({
      businessId,
      title: input.title,
      sourceType: input.sourceType,
      ...(input.sourceUrl ? { sourceUrl: input.sourceUrl } : {}),
      ...(input.storageObjectId ? { storageObjectId: input.storageObjectId } : {}),
      contentHash: input.contentHash,
      status: "pending",
      metadataJson: { textContent: input.textContent },
    })
    .returning({ id: knowledgeDocuments.id, status: knowledgeDocuments.status });

  if (!document) {
    throw new Error("Knowledge document was not created");
  }

  await enqueueSideEffect(db, {
    businessId,
    topic: "knowledge.indexDocument",
    payload: { businessId, documentId: document.id },
    dedupeKey: `knowledge-document:${document.id}:index:${input.contentHash}`,
  });

  return document;
}

export async function listKnowledgeDocuments(input: {
  businessId: string;
  pool?: TransactionContext["pool"];
}) {
  return withDomainTransaction(
    { businessId: input.businessId, actorType: "user", pool: input.pool ?? getAppPool() },
    async (db) => {
      const documents = await db
        .select({
          id: knowledgeDocuments.id,
          title: knowledgeDocuments.title,
          sourceType: knowledgeDocuments.sourceType,
          status: knowledgeDocuments.status,
          createdAt: knowledgeDocuments.createdAt,
          updatedAt: knowledgeDocuments.updatedAt,
        })
        .from(knowledgeDocuments)
        .where(eq(knowledgeDocuments.businessId, input.businessId))
        .orderBy(desc(knowledgeDocuments.updatedAt));

      return documents.map((document) => ({
        ...document,
        createdAt: document.createdAt.toISOString(),
        updatedAt: document.updatedAt.toISOString(),
      }));
    },
  );
}

export async function indexKnowledgeDocument(input: {
  businessId: string;
  documentId: string;
  embeddingProvider?: { embed: (chunks: string[]) => Promise<number[][]> };
  pool?: TransactionContext["pool"];
}) {
  const pool = input.pool ?? getWorkerPool();

  const document = await withDomainTransaction(
    { businessId: input.businessId, actorType: "worker", pool },
    async (db) => {
      const [record] = await db
        .select({
          id: knowledgeDocuments.id,
          title: knowledgeDocuments.title,
          metadataJson: knowledgeDocuments.metadataJson,
        })
        .from(knowledgeDocuments)
        .where(
          and(
            eq(knowledgeDocuments.id, input.documentId),
            eq(knowledgeDocuments.businessId, input.businessId),
          ),
        )
        .limit(1);

      return record;
    },
  );

  const textContent =
    typeof document?.metadataJson === "object" &&
    document.metadataJson !== null &&
    "textContent" in document.metadataJson &&
    typeof document.metadataJson.textContent === "string"
      ? document.metadataJson.textContent
      : null;

  if (!document || !textContent) {
    throw new Error("Knowledge document content is unavailable");
  }

  const chunks = chunkKnowledgeText(textContent);
  const embeddings = input.embeddingProvider ? await input.embeddingProvider.embed(chunks) : [];

  return withDomainTransaction(
    { businessId: input.businessId, actorType: "worker", pool },
    async (db) => {
      await db.delete(knowledgeChunks).where(eq(knowledgeChunks.documentId, document.id));

      if (chunks.length > 0) {
        await db.insert(knowledgeChunks).values(
          chunks.map((content, chunkIndex) => ({
            businessId: input.businessId,
            documentId: document.id,
            chunkIndex,
            content,
            ...(embeddings[chunkIndex] ? { embedding: embeddings[chunkIndex] } : {}),
          })),
        );
      }

      await db
        .update(knowledgeDocuments)
        .set({ status: "ready", processedAt: new Date(), updatedAt: new Date() })
        .where(eq(knowledgeDocuments.id, document.id));

      const digest = chunks.slice(0, 4).join(" ").slice(0, 2_000);
      await db
        .update(businesses)
        .set({ updatedAt: new Date() })
        .where(eq(businesses.id, input.businessId));

      await enqueueSideEffect(db, {
        businessId: input.businessId,
        topic: "document.progressed",
        payload: { businessId: input.businessId, entityId: document.id },
        dedupeKey: `knowledge-document:${document.id}:ready`,
      });

      await enqueueSideEffect(db, {
        businessId: input.businessId,
        topic: "snapshot.refresh",
        payload: { businessId: input.businessId, digest },
        dedupeKey: `business:${input.businessId}:snapshot:knowledge:${document.id}`,
      });

      return { chunkCount: chunks.length };
    },
  );
}

export async function searchKnowledge(input: {
  businessId: string;
  embedding: number[];
  limit?: number;
  pool?: TransactionContext["pool"];
}) {
  if (input.embedding.length !== 1_536 || input.embedding.some((value) => !Number.isFinite(value))) {
    throw new Error("Knowledge search embeddings must contain 1536 finite values");
  }

  const vector = `[${input.embedding.map((value) => Number(value)).join(",")}]`;
  const limit = Math.max(1, Math.min(input.limit ?? 5, 20));

  return withDomainTransaction(
    { businessId: input.businessId, actorType: "worker", pool: input.pool ?? getWorkerPool() },
    async (_db, client) => {
      const result = await client.query<{
        id: string;
        document_id: string;
        title: string;
        content: string;
        score: number;
      }>(
        `SELECT
          chunks.id,
          chunks.document_id,
          documents.title,
          chunks.content,
          1 - (chunks.embedding <=> $1::vector) AS score
        FROM app.knowledge_chunks chunks
        JOIN app.knowledge_documents documents ON documents.id = chunks.document_id
        WHERE chunks.business_id = $2::uuid
          AND chunks.embedding IS NOT NULL
        ORDER BY chunks.embedding <=> $1::vector
        LIMIT $3`,
        [vector, input.businessId, limit],
      );

      return result.rows.map((row) => ({
        id: row.id,
        documentId: row.document_id,
        title: row.title,
        textContent: row.content,
        score: Number(row.score),
      }));
    },
  );
}

export async function extractKnowledgeDocument(input: {
  businessId: string;
  objectId: string;
  provider: { getObject: (args: { key: string }) => Promise<{ body: unknown }> };
  extractor?: (args: {
    contentType?: string | null;
    bytes: Buffer;
  }) => Promise<{ text: string }>;
  pool?: TransactionContext["pool"];
}) {
  const pool = input.pool ?? getWorkerPool();

  const object = await withDomainTransaction(
    { businessId: input.businessId, actorType: "worker", pool },
    async (db) => {
      const [record] = await db
        .select({
          id: storageObjects.id,
          objectKey: storageObjects.objectKey,
          mimeType: storageObjects.mimeType,
          metadataJson: storageObjects.metadataJson,
        })
        .from(storageObjects)
        .where(
          and(eq(storageObjects.id, input.objectId), eq(storageObjects.businessId, input.businessId)),
        )
        .limit(1);

      return record;
    },
  );

  if (!object) {
    throw new Error("Storage object is not available in the active business");
  }

  const stored = await input.provider.getObject({ key: object.objectKey });
  const bytes = await objectBodyToBuffer(stored.body);
  const filename =
    typeof object.metadataJson === "object" &&
    object.metadataJson !== null &&
    "filename" in object.metadataJson &&
    typeof object.metadataJson.filename === "string"
      ? object.metadataJson.filename
      : "upload";

  const extraction = input.extractor
    ? await input.extractor({ contentType: object.mimeType, bytes })
    : { text: bytes.toString("utf8") };

  if (!hasMeaningfulDocumentText(extraction.text)) {
    throw new Error("The uploaded document did not contain enough readable text");
  }

  const contentHash = createHash("sha256").update(extraction.text).digest("hex");

  return withDomainTransaction(
    { businessId: input.businessId, actorType: "worker", pool },
    async (db) => {
      const document = await persistKnowledgeDocument(db, input.businessId, {
        title: filename,
        sourceType: "upload",
        textContent: extraction.text,
        contentHash,
        sourceUrl: object.objectKey,
        storageObjectId: object.id,
      });

      await db
        .update(storageObjects)
        .set({ status: "active", updatedAt: new Date() })
        .where(eq(storageObjects.id, object.id));

      return { documentId: document.id };
    },
  );
}

async function objectBodyToBuffer(body: unknown): Promise<Buffer> {
  if (typeof body === "string") {
    return Buffer.from(body, "utf8");
  }
  if (body instanceof Uint8Array) {
    return Buffer.from(body);
  }
  if (typeof body === "object" && body !== null) {
    const candidate = body as {
      transformToByteArray?: () => Promise<Uint8Array>;
      transformToString?: () => Promise<string>;
      [Symbol.asyncIterator]?: () => AsyncIterator<Uint8Array>;
    };
    if (candidate.transformToByteArray) {
      return Buffer.from(await candidate.transformToByteArray());
    }
    if (candidate.transformToString) {
      return Buffer.from(await candidate.transformToString(), "utf8");
    }
    if (candidate[Symbol.asyncIterator]) {
      const chunks: Buffer[] = [];
      for await (const chunk of candidate as AsyncIterable<Uint8Array>) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      return Buffer.concat(chunks);
    }
  }
  throw new Error("Storage object body cannot be read as binary");
}
