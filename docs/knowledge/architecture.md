# Understand knowledge ingestion and retrieval

LobbyStack separates authoritative business facts from retrieved long-form knowledge.

- Structured facts live in PostgreSQL tables for businesses, services, staff, hours, policies, and routing rules.
- Documents, FAQs, and imported website pages live in PostgreSQL with pgvector embeddings and object-storage references.
- `packages/domain` applies tenant boundaries and compiles both sources into versioned business context snapshots.

## Follow the ingestion flow

1. An operator submits a URL, text entry, or uploaded document through `apps/admin`.
2. The API stores durable metadata and enqueues an outbox job in the same PostgreSQL transaction.
3. `apps/worker` fetches or extracts content, chunks it, creates embeddings through the configured OpenAI-compatible endpoint, and writes tenant-scoped vectors.
4. The worker refreshes the business context snapshot after indexing succeeds.

Embedding vectors are stored at the fixed `vector(1536)` dimension together with a fingerprint of the configured endpoint, model, provider name, dimensions, and revision. Semantic retrieval only compares matching fingerprints; keyword retrieval fills gaps while `knowledge.reembedBusiness` regenerates existing chunk text after a provider change.

## Spot a website read that stalled

Nothing marks a crawl as stuck, because the worker that would mark it is often the part that's down. Each read of a crawl's status works it out from the timestamps the worker already writes, in `packages/domain/src/server/websiteImportHealth.ts`. A crawl counts as stalled when it still says it's running and:

| Status | Stalled after | Why |
| --- | --- | --- |
| `queued`, outbox message not yet sent | 1 minute | The dispatcher runs in the worker and sends messages within seconds. |
| `queued`, outbox message sent | 15 minutes | Every business shares the `bulk` queue, two jobs per worker. A crawl ahead can take five minutes in Firecrawl and then index up to 50 pages. |
| `crawling` | 15 minutes | Firecrawl gets five minutes, and a provider outage defers the crawl up to two minutes between tries. |
| `indexing` | 5 minutes | The worker writes progress after each page. |

Getting started, the onboarding reading step and the knowledge list then say the site couldn't be read in full and offer Try again, which queues a new crawl. Onboarding's crawl keeps its sample page limit. A crawl that starts moving again reads as running, with nothing to reset. The v1 API keeps reporting the source as `processing`: cancel it, then retry it.

If you self-host and see this message, check that the worker is running and can reach Redis and the crawl provider.

## Use knowledge during voice calls

The admin loads one snapshot when a call starts. Structured facts stay authoritative; retrieval augments documents and FAQs. The worker answers booking and other state-changing requests through the agent core and `packages/domain`.

## Keep provider boundaries

- Configured OpenAI-compatible adapters handle non-realtime text generation and embeddings behind `packages/providers`. Chat and embedding models/endpoints are deployment-wide and independently configurable.
- Firecrawl optionally imports public website content.
- S3-compatible storage holds original uploads and generated artifacts.
- PostgreSQL RLS and business-scoped transactions enforce tenant isolation.
