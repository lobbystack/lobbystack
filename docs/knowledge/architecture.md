# Knowledge Architecture

LobbyStack separates authoritative business facts from retrieved long-form knowledge.

- Structured facts live in PostgreSQL tables for businesses, services, staff, hours, policies, and routing rules.
- Documents, FAQs, and imported website pages live in PostgreSQL with pgvector embeddings and object-storage references.
- `packages/domain` applies tenant boundaries and compiles both sources into versioned business context snapshots.

## Ingestion Flow

1. An operator submits a URL, text entry, or uploaded document through `apps/admin`.
2. The API stores durable metadata and enqueues an outbox job in the same PostgreSQL transaction.
3. `apps/worker` fetches or extracts content, chunks it, creates Gemini embeddings, and writes tenant-scoped vectors.
4. The worker refreshes the business context snapshot after indexing succeeds.

## Voice Use

The voice gateway fetches one snapshot at call start. Structured facts stay authoritative; retrieval augments documents and FAQs. Booking and other state-changing operations still call the backend through signed service requests.

## Provider Boundaries

- Gemini handles non-realtime text generation and embeddings behind `packages/providers`.
- Firecrawl optionally imports public website content.
- S3-compatible storage holds original uploads and generated artifacts.
- PostgreSQL RLS and business-scoped transactions enforce tenant isolation.
