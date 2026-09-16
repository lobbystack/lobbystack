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

## Use knowledge during voice calls

The voice gateway fetches one snapshot at call start. Structured facts stay authoritative; retrieval augments documents and FAQs. Booking and other state-changing operations still call the backend through signed service requests.

## Keep provider boundaries

- Configured OpenAI-compatible adapters handle non-realtime text generation and embeddings behind `packages/providers`. Chat and embedding models/endpoints are deployment-wide and independently configurable.
- Firecrawl optionally imports public website content.
- S3-compatible storage holds original uploads and generated artifacts.
- PostgreSQL RLS and business-scoped transactions enforce tenant isolation.
