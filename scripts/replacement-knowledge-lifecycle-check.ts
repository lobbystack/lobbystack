import { createHash, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { businesses, businessMemberships, createDatabaseClient, knowledgeDocuments, storageObjects, users, websiteIngestionJobs, withBusinessTransaction } from "@lobbystack/db";
import { createKnowledgeDocument, createUpload, finalizeUpload, cancelKnowledgeDocument, deleteKnowledgeDocument, getKnowledgeDocumentContent, indexCrawledWebsitePage, markKnowledgeDocumentFailed, retryKnowledgeDocument, searchKnowledge, setKnowledgeDocumentActive } from "@lobbystack/domain";
import { handleJob } from "../apps/worker/src/handlers";
import type { JobEnvelope } from "@lobbystack/contracts";
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
const auth = createDatabaseClient("lobbystack_auth"), worker = createDatabaseClient("lobbystack_worker"), app = createDatabaseClient("lobbystack_app");
const userId = randomUUID(), viewerId = randomUUID(), businessId = randomUUID(), foreignBusinessId = randomUUID();
let documentId = "";
try {
  for (const id of [userId, viewerId]) await auth.db.insert(users).values({ id, email: `${id}@knowledge.invalid`, normalizedEmail: `${id}@knowledge.invalid` });
  for (const tenant of [businessId, foreignBusinessId]) await withBusinessTransaction(worker.db, { businessId: tenant, actorType: "worker" }, async (tx) => {
    await tx.insert(businesses).values({ id: tenant, slug: `knowledge-${tenant}`, name: "Knowledge certification", timezone: "UTC", businessType: "service_company" });
    await tx.insert(businessMemberships).values([{ businessId: tenant, userId, role: "business_owner", status: "active" }, { businessId: tenant, userId: viewerId, role: "viewer", status: "active" }]);
  });
  const bytes = Buffer.from("Clinic hours");
  const checksum = createHash("sha256").update(bytes).digest("base64");
  const storage = {
    createUpload: async () => ({ url: "https://storage.example.invalid/upload" }),
    headObject: async () => ({ length: bytes.length, contentType: "text/plain", checksum }),
    deleteObject: async () => {},
    createDownloadUrl: async () => "https://storage.example.invalid/download",
  };
  const uploadInput = { userId, businessId, purpose: "knowledge", fileName: "hours.txt", contentType: "text/plain", length: bytes.length, checksum };
  const upload = await createUpload({ db: app.db }, uploadInput, storage);
  await finalizeUpload({ db: app.db }, { userId, businessId, objectId: upload.objectId, length: bytes.length, contentType: "text/plain", checksum, title: "Clinic policy", tags: ["clinic", "hours"] }, storage);
  const concurrentUpload = await createUpload({ db: app.db }, { ...uploadInput, fileName: "concurrent.txt" }, storage);
  const completions = await Promise.allSettled(Array.from({ length: 2 }, () => finalizeUpload({ db: app.db }, { userId, businessId, objectId: concurrentUpload.objectId, length: bytes.length, contentType: "text/plain", checksum }, storage)));
  assert(completions.filter(result => result.status === "fulfilled").length === 1, "Concurrent finalization created duplicate knowledge documents.");
  const changedUpload = await createUpload({ db: app.db }, { ...uploadInput, fileName: "changed.txt" }, storage);
  let changedLengthBlocked = false;
  try { await finalizeUpload({ db: app.db }, { userId, businessId, objectId: changedUpload.objectId, length: bytes.length + 1, contentType: "text/plain", checksum }, { ...storage, headObject: async () => ({ length: bytes.length + 1, contentType: "text/plain", checksum }) }); } catch { changedLengthBlocked = true; }
  assert(changedLengthBlocked, "Finalization accepted an object larger than its reserved upload.");
  const [uploaded] = await withBusinessTransaction(app.db, { businessId, userId, actorType: "operator" }, async tx => tx.select().from(knowledgeDocuments).where(eq(knowledgeDocuments.storageObjectId, upload.objectId)));
  assert(uploaded?.title === "Clinic policy" && JSON.stringify(uploaded.tags) === '["clinic","hours"]', "Upload lost its title or tags.");
  for (const invalidInput of [{ ...uploadInput, userId: viewerId }, { ...uploadInput, length: 10 * 1024 * 1024 + 1 }]) {
    let blocked = false;
    try { await createUpload({ db: app.db }, invalidInput, storage); } catch { blocked = true; }
    assert(blocked, "Read-only or oversized knowledge upload was accepted.");
  }
  documentId = await createKnowledgeDocument({ db: app.db }, { businessId, userId, sourceType: "website", sourceUrl: "https://example.com/", title: "Root" });
  const readImport = () => withBusinessTransaction(worker.db, { businessId, actorType: "worker" }, async tx => (await tx.select().from(websiteIngestionJobs).where(and(eq(websiteIngestionJobs.businessId, businessId), eq(websiteIngestionJobs.rootDocumentId, documentId))))[0]);
  const initialImport = await readImport();
  assert(initialImport?.status === "queued", "Website import has no durable queued job.");
  const prepared = { businessId, documentId, text: "Business hours: 9–5.", embeddings: [Array<number>(1536).fill(0)], title: "Hours", sourceUrl: "https://example.com/hours", sourceRevision: 0 };
  assert((await indexCrawledWebsitePage({ db: worker.db }, prepared)).chunkCount === 1, "Active website import did not index its page.");
  await cancelKnowledgeDocument({ db: app.db }, { businessId, userId, documentId });
  assert((await readImport())?.status === "cancelled", "Cancellation left the website job running.");
  assert((await indexCrawledWebsitePage({ db: worker.db }, { ...prepared, sourceUrl: "https://example.com/cancelled-result" })).chunkCount === 0, "Late crawl result overwrote cancellation.");
  assert(!await markKnowledgeDocumentFailed({ db: worker.db }, { businessId, documentId, expectedRevision: 0 }), "Late worker failure overwrote cancellation.");
  await retryKnowledgeDocument({ db: app.db }, { businessId, userId, documentId });
  assert((await readImport())?.status === "queued" && (await readImport())?.id === initialImport.id, "Retry did not reset the existing import job.");
  assert((await indexCrawledWebsitePage({ db: worker.db }, prepared)).chunkCount === 0, "Old crawl result was accepted after retry.");
  assert((await indexCrawledWebsitePage({ db: worker.db }, { ...prepared, sourceRevision: 2 })).chunkCount === 1, "Current retry could not index its page.");
  const [page] = await withBusinessTransaction(worker.db, { businessId, actorType: "worker" }, async (tx) => tx.select().from(knowledgeDocuments).where(and(eq(knowledgeDocuments.businessId, businessId), eq(knowledgeDocuments.sourceUrl, prepared.sourceUrl))));
  assert(page, "Indexed page was not stored.");
  const preview = await getKnowledgeDocumentContent({ db: app.db }, { businessId, userId: viewerId, documentId: page.id });
  assert(preview?.content === prepared.text, "Viewer could not read extracted document text.");
  assert(await getKnowledgeDocumentContent({ db: app.db }, { businessId: foreignBusinessId, userId, documentId: page.id }) === null, "Knowledge content crossed tenant boundaries.");
  assert((await searchKnowledge({ db: app.db }, { businessId, userId, query: "Business hours" })).some(result => result.title === "Hours"), "Enabled knowledge was not available to retrieval.");
  await setKnowledgeDocumentActive({ db: app.db }, { businessId, userId, documentId: page.id, active: false });
  assert((await searchKnowledge({ db: app.db }, { businessId, userId, query: "Business hours" })).length === 0, "Disabled knowledge still reached keyword retrieval.");
  assert((await searchKnowledge({ db: app.db, embeddings: { embed: async () => [Array<number>(1536).fill(0)] } }, { businessId, userId, query: "Business hours" })).length === 0, "Disabled knowledge still reached semantic retrieval.");
  assert((await getKnowledgeDocumentContent({ db: app.db }, { businessId, userId: viewerId, documentId: page.id }))?.content === prepared.text, "Disabling knowledge hid the operator's document preview.");
  for (const actor of [{ businessId, userId: viewerId }, { businessId: foreignBusinessId, userId }]) {
    let blocked = false;
    try { await setKnowledgeDocumentActive({ db: app.db }, { ...actor, documentId: page.id, active: true }); } catch { blocked = true; }
    assert(blocked, "A read-only or foreign tenant operator changed document activity.");
  }
  await setKnowledgeDocumentActive({ db: app.db }, { businessId, userId, documentId: page.id, active: true });
  assert((await searchKnowledge({ db: app.db }, { businessId, userId, query: "Business hours" })).length === 1, "Re-enabled knowledge did not return to retrieval.");
  let denied = false;
  try { await retryKnowledgeDocument({ db: app.db }, { businessId, userId: viewerId, documentId }); } catch { denied = true; }
  assert(denied, "Read-only member could retry an import.");
  await deleteKnowledgeDocument({ db: app.db }, { businessId, userId, documentId });
  assert((await indexCrawledWebsitePage({ db: worker.db }, { ...prepared, sourceRevision: 2 })).chunkCount === 0, "Late worker recreated a deleted import.");
  const capacityUpload = await createUpload({ db: app.db }, { ...uploadInput, fileName: "over-capacity.txt" }, storage);
  await withBusinessTransaction(worker.db, { businessId, actorType: "worker" }, async tx => {
    await tx.update(storageObjects).set({ contentLength: 25 * 1024 * 1024 }).where(eq(storageObjects.id, upload.objectId));
  });
  let capacityDenied = false;
  try { await finalizeUpload({ db: app.db }, { userId, businessId, objectId: capacityUpload.objectId, length: bytes.length, contentType: "text/plain", checksum }, storage); } catch (error) { capacityDenied = error instanceof Error && error.message.startsWith("Knowledge storage limit reached."); }
  assert(capacityDenied, "Knowledge uploads ignored the plan storage limit.");
  const workerRoot = await createKnowledgeDocument({ db: app.db }, { businessId, userId, sourceType: "website", sourceUrl: "https://worker.example.invalid/", title: "Worker lifecycle" });
  const workerImport = () => withBusinessTransaction(worker.db, { businessId, actorType: "worker" }, async tx => (await tx.select().from(websiteIngestionJobs).where(eq(websiteIngestionJobs.rootDocumentId, workerRoot)))[0]!);
  const queuedImport = await workerImport();
  const crawlJob = (revision: number): JobEnvelope => ({ jobId: randomUUID(), type: "knowledge.crawlWebsite", queue: "default", businessId, payload: { url: "https://worker.example.invalid/", documentId: workerRoot, revision, websiteIngestionJobId: queuedImport.id }, trace: {}, idempotencyKey: `website-worker:${workerRoot}:${revision}`, scheduled: false });
  const crawledPages = [{ url: "https://worker.example.invalid/", title: "Worker root", markdown: "Unique worker lifecycle root knowledge." }, { url: "https://worker.example.invalid/policy", title: "Worker policy", markdown: "Unique worker lifecycle policy knowledge." }];
  const interrupted = await handleJob(crawlJob(0), { domain: { db: worker.db }, crawler: { crawl: async () => {
    assert((await workerImport()).status === "crawling", "Worker did not persist the crawling state.");
    await cancelKnowledgeDocument({ db: app.db }, { userId, businessId, documentId: workerRoot });
    return crawledPages;
  } } });
  assert(interrupted.status === "skipped" && (await workerImport()).status === "cancelled", "A late crawl overwrote the cancelled job.");
  assert(await createKnowledgeDocument({ db: app.db }, { userId, businessId, sourceType: "website", sourceUrl: "https://worker.example.invalid/", title: "Retry worker lifecycle" }) === workerRoot, "Reimport after cancellation created a duplicate root.");
  assert((await workerImport()).status === "queued", "Reimport after cancellation did not restart the job.");
  let embeddedPages = 0;
  const completed = await handleJob(crawlJob(2), { domain: { db: worker.db }, crawler: { crawl: async () => crawledPages }, embeddings: { embed: async values => {
    const importing = await workerImport();
    assert(importing.status === "indexing" && importing.importedCount === 2 && importing.indexedCount === embeddedPages, "Indexing progress did not persist between pages.");
    embeddedPages += 1;
    return values.map(() => Array<number>(1536).fill(0));
  } } });
  assert(completed.status === "completed" && (await workerImport()).status === "completed" && (await workerImport()).indexedCount === 2, "Worker did not complete the linked job.");
  let staleCrawlCalled = false;
  const stale = await handleJob(crawlJob(0), { domain: { db: worker.db }, crawler: { crawl: async () => { staleCrawlCalled = true; return crawledPages; } } });
  assert(stale.status === "skipped" && !staleCrawlCalled, "A completed import accepted an old worker delivery.");
  console.log(JSON.stringify({ workerCrawlAndIndexProgress: true, cancellationDuringCrawl: true, staleWorkerDeliveryRejected: true, durableImportJob: true, importCancellationAndRetry: true, documentActivityPersists: true, disabledExcludedFromKeywordAndSemanticSearch: true, disabledPreviewReadable: true, activityMutationAccessControl: true, uploadMetadataPersisted: true, planStorageLimitEnforced: true, concurrentFinalizeDeduplicated: true, reservedLengthEnforced: true, viewerUploadDenied: true, oversizedUploadDenied: true, indexing: true, cancellationPreserved: true, staleRetryRejected: true, retryIndexes: true, viewerPreview: true, viewerMutationDenied: true, tenantIsolation: true, deletionPreserved: true }));
} finally {
  for (const tenant of [businessId, foreignBusinessId]) await withBusinessTransaction(worker.db, { businessId: tenant, actorType: "worker" }, async (tx) => tx.delete(businesses).where(eq(businesses.id, tenant)));
  for (const id of [userId, viewerId]) await auth.db.delete(users).where(eq(users.id, id));
  await Promise.all([auth.pool.end(), worker.pool.end(), app.pool.end()]);
}
