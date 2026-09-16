---
meta:
  contentType: Reference
  title: Validate evidence-backed voice answers
---

# Validate evidence-backed voice answers

Use this record to review the staging knowledge changes against the approved voice-answer plan. Production rollout requires browser and telephone audio acceptance. Text probes cannot establish spoken-language behavior.

## Scope and test plan

The approved plan keeps PostgreSQL, the configured embedding provider, and the current speech-to-speech model. It compares full context, retrieval, and hybrid context on 40 versioned questions before staging acceptance. The evaluation includes 20 answerable questions, 10 follow-ups, and 10 ambiguous or unsupported questions.

You can inspect the cases in `packages/domain/src/evals/voiceKnowledge.v1.ts`. The HEC excerpt records the verified management identifier `MNGT 10407`; the other businesses are synthetic. Each answerable case references its supporting source.

## Implemented behavior

The voice prompt includes structured business facts outside a 2,000-token knowledge budget. Curated snippets and a source inventory use that budget. The tokenizer uses `o200k_base`; audio and protocol overhead do not count toward this text allowance.

Search runs semantic and keyword queries in parallel, with 12 candidates per query. Reciprocal-rank fusion merges their ordered results. Search returns at most six source-linked passages within 3,000 text tokens, including adjacent evidence when it fits.

Keyword search matches dotted and plain acronyms, such as `B.A.A.` and `BAA`. It ranks full-query matches before partial matches. Indexing starts a new chunk at each Markdown heading so adjacent course descriptions do not share a primary passage.

Search filters business ownership, active status, and indexed status before ranking. It checks revisions again before returning passages. An embedding failure preserves keyword search; a database failure returns an unavailable outcome. The gateway bounds lookup requests and permits one refinement per detected caller turn.

The agent must look up missing business facts, including payment methods and parking. Imported text cannot override operating rules. Browser and telephone calls share these rules; prospect-demo restrictions remain separate.

## Measured results

The old staging backend missed the verified identifier for the natural French HEC question and the short management query. An exact-code query found it.

The first context comparison exposed skipped lookups and invented payment and parking details. The revised prompt, `hybrid-v2`, triggered lookup for all 30 answerable questions and follow-ups in the hybrid text run. Five repeated HEC text answers returned `MNGT 10407`.

The revised retrieval run covered the expected source in 34 of 34 answerable probes, including four extra HEC repeats. It returned no cross-business passages. Its 95th-percentile lookup time was 541 ms against local PostgreSQL with the staging embedding provider. The small fixture corpus does not represent the full HEC website.

Manual review flagged three hybrid answers among the 30 answerable questions and follow-ups: a service labeled as a course, an unsupported suggestion to bring parts, and an ambiguous cancellation deadline. Treat 27 of 30 as the conservative grounded-answer result. No answer invented an identifier or disclosed the foreign tenant’s catalog.

Full context used fewer tokens and finished faster on this small corpus. This run does not demonstrate that hybrid context outperforms full context when the documents fit:

| Design | Mean input tokens | Mean output tokens | 95th-percentile text completion |
| --- | ---: | ---: | ---: |
| Full context | 1,133 | 36 | 1,764 ms |
| Retrieval | 2,153 | 60 | 2,332 ms |
| Hybrid | 2,253 | 64 | 2,763 ms |

The workspace typecheck and production build passed. The domain tests and local PostgreSQL lifecycle checks passed, including source activity, deletion, stale imports, and tenant isolation. The admin suite passed 389 tests on rerun after a timer error during the concurrent workspace run. Local database checks confirmed forced row-level security on 63 tables.

Raw comparison output stays in LobbyStack internal under `Reports/Voice/2026-09-08/`. The files `context-comparison-1.json` and `context-comparison-2.json` record model, token usage, timings, and answers. Do not commit recordings or personal transcripts.

## Full-corpus and audio regressions

The first staging run exposed a passage-budget error: expanded neighbors displaced later primary matches. Reserving primary matches before neighbors restored the correct HEC identifier in five staging lookups, taking 255–585 ms each. The snapshot refresh through **AI settings → Save** preserved the greeting and populated the source inventory.

Synthetic French speech exposed a separate answer-selection failure. The voice model sometimes chose “Management stratégique des organisations” instead of “Management,” even with both identifiers in its evidence. A stricter title-matching prompt did not fix this. A passage-diversity experiment weakened a short-query regression, so neither experiment remains in the implementation.

The `gpt-realtime-2.1` comparison also failed two of five HEC answers and exceeded the four-second answer-start target. The deployed model remains unchanged. [OpenAI’s model documentation](https://developers.openai.com/api/docs/models/gpt-realtime-2.1) guided this comparison; the application results do not support switching models.

Section-aware reindexing of a local copy of the 137 stored HEC chunks produced 426 chunks. All four query variants returned the correct identifier, and five synthetic audio answers led with `MNGT 10407`. Evidence-backed audio started 2.02–2.47 seconds after the test committed input audio. This bypasses browser microphones and turn detection; it is not end-to-end latency acceptance.

The stored-content reindex workflow preserves source URLs and refuses a changed, deleted, or inactive source. Tests cover edits during embedding and stale revision retries. The original HEC index remains in LobbyStack internal for recovery. No website recrawl is required.

The acronym-aware 44-probe retrieval run covered all expected sources, with no tenant-isolation failures and a 407 ms 95th-percentile lookup time. These figures measure the fixture corpus, not the live audio path.

Staging now uses the 426 rebuilt chunks. Five deployed lookups returned the correct code in 253–474 ms. Five synthetic French audio answers also led with `MNGT 10407`; independent transcription of the generated audio identified French in all five. Evidence-backed audio started in 2.12–3.09 seconds. Some answers added a related course, so brevity still needs review. The report is `staging-section-audio.json` in the internal reports folder.

## Remaining release gates

Before proposing production, complete these checks:

- Verify evidence-backed spoken answers through browser and telephone calls.
- Repeat French audio regressions, including interruptions, noise, short greetings, accents, and deliberate language switches.
- Measure answer-start latency from the end of caller speech; text completion time measures a different interval.

The existing recording mixes caller and assistant audio. Local inspection found a valid 117-second Opus recording without decoding errors. Sending it to an external transcription service requires explicit permission following the safety-review rejection.

## Staging rollback

Keep the previous admin, worker, and gateway deployments available. Restore those deployments together if acceptance fails. The additive keyword indexes remain compatible with the previous code; rollback does not require deleting them. Keep production, billing, business identity, greeting, and default language unchanged.

If the reindex itself needs rollback, restore the saved pre-section chunks and embeddings within the same business scope. A deployment rollback alone does not restore the previous index content.
