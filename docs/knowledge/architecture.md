# Knowledge Architecture

## Purpose

The AI receptionist is customized from two sources:

- Structured business facts in Convex tables.
- Unstructured docs and FAQs indexed through Convex RAG.

Structured facts remain authoritative for hours, services, booking rules, and transfer policy.

## Flow

1. Admins update receptionist profile, hours, services, closures, and transfer settings.
2. Admins add FAQs or upload text-backed documents from the dashboard knowledge manager.
3. Convex indexes the long-form content into a tenant-scoped RAG namespace.
4. Convex compiles a `business_context_snapshot` containing:
   - greeting and tone instructions
   - booking and transfer policy
   - hours and closures
   - active services
   - priority FAQs
   - a compact `knowledgeDigest` distilled from indexed documents
5. SMS and admin preview use the same structured context plus RAG search wrappers.
6. Voice fetches the snapshot once at call start and keeps it in memory for the rest of the call.

## Why The Snapshot Exists

The voice path cannot depend on repeated backend round-trips without hurting call smoothness.

The snapshot keeps the common receptionist context close to the live voice runtime while still letting Convex remain the source of truth.

## Component Usage

- `@convex-dev/rag` stores tenant-scoped knowledge chunks.
- `@convex-dev/agent` powers SMS and admin preview threads.
- `@convex-dev/persistent-text-streaming` is reserved for streamed preview/test flows.
- `@convex-dev/workflow` and `@convex-dev/workpool` handle ingestion and follow-up work.
- `convex/lib/components.ts` is the Convex composition root for those orchestration primitives.
- `convex/lib/providers/*` chooses the concrete vendor/model implementation that each Convex component uses.

## Provider Split

- `OpenAI Realtime` is reserved for the live voice runtime in `apps/voice-gateway`.
- `Gemini` handles non-realtime text generation and embeddings in Convex for SMS, preview, summaries, and knowledge retrieval.
- The provider choice lives behind internal Convex provider adapters, so component wiring stays separate from vendor SDK selection.

This keeps the expensive low-latency voice path separate from the cheaper async text path.

## Current Admin Surface

The web dashboard already exposes:

- receptionist profile editing
- business hours editing
- service creation
- FAQ creation
- manual long-form document entry
- snapshot inspection
- receptionist preview testing

## Current MVP Limits

- Uploaded knowledge is text-backed in MVP.
- Supported upload formats are `pdf`, `txt`, and `md`.
- Live voice uses the precomputed snapshot by default; live RAG lookup is fallback-only.
