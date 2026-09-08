import { randomUUID, createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { businesses, knowledgeDocuments, knowledgeChunks, createDatabaseClient, withBusinessTransaction } from "@lobbystack/db";
import { searchKnowledgeEvidence } from "@lobbystack/domain";
import { createEmbeddingProvider } from "@lobbystack/providers";
import { evaluationSources, voiceKnowledgeCases, voiceKnowledgeEvaluationVersion } from "../packages/domain/src/evals/voiceKnowledge.v1";
import { evaluateRealtimeKnowledge, type EvaluationKnowledgeMode } from "../apps/voice-gateway/src/evals/realtimeKnowledge";

// Deliberately refuses remote databases: these fixtures never belong in customer data.
const databaseUrl = process.env.LOBBYSTACK_WORKER_DATABASE_URL ?? process.env.DATABASE_URL;
if (!databaseUrl || !["localhost", "127.0.0.1"].includes(new URL(databaseUrl).hostname)) throw new Error("A local evaluation database is required.");
const embeddings = createEmbeddingProvider();
if (!embeddings) throw new Error("The configured embedding provider is required.");
const database = createDatabaseClient("lobbystack_worker");
const tenants = new Map(["hec", "maple", "birch"].map(name => [name, randomUUID()]));
const sourceIds = new Map<string, string>(evaluationSources.map(source => [source.id, randomUUID()]));
const rows: Array<{ id: string; evidenceCovered: boolean | null; tenantIsolation: boolean; durationMs: number; mode: string; outcome: string }> = [];
const answers: Array<Awaited<ReturnType<typeof evaluateRealtimeKnowledge>> & { id: string; design: EvaluationKnowledgeMode }> = [];
try {
  const vectors = await embeddings.embed(evaluationSources.map(source => source.text));
  for (const [tenant, businessId] of tenants) {
    await withBusinessTransaction(database.db, { businessId, actorType: "worker" }, async tx => {
      await tx.insert(businesses).values({ id: businessId, name: `Voice evaluation ${tenant}`, slug: `voice-eval-${businessId}`, timezone: "America/Toronto", businessType: "service_company" });
      for (const [index, source] of evaluationSources.entries()) {
        if (source.tenant !== tenant) continue;
        const documentId = sourceIds.get(source.id)!;
        const contentHash = createHash("sha256").update(source.text).digest("hex");
        await tx.insert(knowledgeDocuments).values({ id: documentId, businessId, title: source.title, sourceType: "website", sourceUrl: source.url, status: "indexed", active: true, revision: source.revision, contentHash });
        await tx.insert(knowledgeChunks).values({ businessId, documentId, sequence: 0, content: source.text, contentHash, embedding: vectors[index]!, embeddingStatus: "completed", embeddingFingerprint: embeddings.fingerprint });
      }
    });
  }
  const repeatedHec = Array.from({ length: 4 }, (_, index) => ({ ...voiceKnowledgeCases[0]!, id: `hec-repeat-${index + 2}` }));
  for (const test of [...voiceKnowledgeCases, ...repeatedHec]) {
    const businessId = tenants.get(test.tenant)!;
    const result = await searchKnowledgeEvidence({ db: database.db, embeddings }, { businessId, query: [test.history, test.question].filter(Boolean).join(" "), turnId: test.id });
    const expectedDocuments = test.sourceIds.map(id => sourceIds.get(id as typeof evaluationSources[number]["id"]));
    const allowedDocuments = evaluationSources.filter(source => source.tenant === test.tenant).map(source => sourceIds.get(source.id));
    rows.push({ id: test.id, evidenceCovered: expectedDocuments.length ? expectedDocuments.every(id => result.matches.some(match => match.documentId === id)) : null, tenantIsolation: result.matches.every(match => allowedDocuments.includes(match.documentId)), durationMs: result.durationMs, mode: result.mode, outcome: result.outcome });
    if (process.env.VOICE_EVAL_ANSWERS === "1") {
      if (!process.env.OPENAI_API_KEY || !process.env.OPENAI_REALTIME_MODEL) throw new Error("Explicit Realtime model and API key required for answer evaluation.");
      const designs: EvaluationKnowledgeMode[] = test.id.startsWith("hec-repeat") ? ["hybrid"] : ["full", "retrieval", "hybrid"];
      for (const design of designs) {
        const answer = await evaluateRealtimeKnowledge({ apiKey: process.env.OPENAI_API_KEY, model: process.env.OPENAI_REALTIME_MODEL, mode: design, test, lookup: query => searchKnowledgeEvidence({ db: database.db, embeddings }, { businessId, query, turnId: test.id }) });
        answers.push({ ...answer, id: test.id, design });
      }
      console.log(JSON.stringify({ completedCase: test.id, answerRuns: answers.length }));
    }
  }
  const answerable = rows.filter(row => row.evidenceCovered !== null);
  const sorted = rows.map(row => row.durationMs).sort((a, b) => a - b);
  const report = { version: voiceKnowledgeEvaluationVersion, embeddingFingerprint: embeddings.fingerprint, caseCount: rows.length, evidenceCoverage: answerable.filter(row => row.evidenceCovered).length / answerable.length, tenantIsolationFailures: rows.filter(row => !row.tenantIsolation).length, p95LookupMs: sorted[Math.ceil(sorted.length * .95) - 1], answerQualityMeasured: false, audioMeasured: false, rows };
  if (process.argv[2]) await writeFile(process.argv[2], JSON.stringify({ ...report, model: process.env.OPENAI_REALTIME_MODEL, answerGrading: "pending", answers }, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ ...report, rows: undefined }));
  if (report.evidenceCoverage < .95 || report.tenantIsolationFailures) process.exitCode = 1;
} finally {
  for (const businessId of tenants.values()) await withBusinessTransaction(database.db, { businessId, actorType: "worker" }, tx => tx.delete(businesses).where(eq(businesses.id, businessId)));
  await database.pool.end();
}
