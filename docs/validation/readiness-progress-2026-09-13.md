# Production readiness progress — 2026-09-13

**Not approved for production traffic.** This extends the [initial implementation record](./readiness-implementation-2026-09-12.md). All evidence refers to the modified working tree based on `141f174c`, not an immutable release commit.

## Verified

- Two fresh, isolated local imports of the same production snapshot: 5,296 mapped rows and 564 objects per run. Source identity accounting, explicit rehearsal policy, private target markers, mapped-field readback, lineage verification, and object checksums are enforced. Repeat verification does not repair missing data.
- A separate backup/restore drill succeeded. Deliberate corruption of a restored object was detected; restoring that object from the backup returned the verification to green.
- The approved temporary Railway environment has separate database/Redis services and volumes, admin/worker/voice/migrator services, and a private bucket. Migrator completed; the other services started. Worker and gateway remain intentionally unready under maintenance, while liveness stays available. No production DNS, webhook destinations, or legacy application state was changed.
- All 564 migrated objects were uploaded to the private rehearsal bucket and downloaded again for size/SHA-256 verification. The cloud snapshot database matched the prepared local database across 64 table-level content/count checks. It is separate from the database configured on the publicly reachable rehearsal app.
- All 104 business snapshots rebuilt and passed the transport schema in a separate derived-data database. Business type, legal name, active contact numbers, localized service names, and analytics preference now survive rebuilding.
- Real SMTP and SMS transport checks were accepted by their providers. The user explicitly confirmed receipt of both. These used allowlisted test recipients and app provider adapters; this is not a claim that deployed email/SMS outbox delivery has been recertified.

## Real-provider and isolated-environment checks

- **Live browser voice call passed** through the isolated Railway gateway using a real OpenAI Realtime session: WebRTC connected, data channel opened, 119 inbound audio packets received, response completed without errors, and the call ended cleanly. This used a fake microphone (not PSTN or a real phone call) and a disposable synthetic business; the fixture was removed afterward.
- **Deployed worker outbox email passed.** A row inserted into the isolated database outbox was dispatched by the running worker to the allowlisted test address on its first attempt (`published_at` set, no dead-letter). This exercises the full `outbox -> worker -> SMTP` deployment path, which the earlier direct-provider test did not.
- **Health/readiness performance passed**: admin-ready p95 153 ms (< 500 ms target), voice-ready p95 179 ms (< 300 ms target), worker-ready p95 3 ms from the private network (< 500 ms target). This is endpoint latency only; an authenticated workflow soak is still outstanding.
- The user confirmed receipt of the controlled email and SMS.
- The isolated runtime was returned to maintenance mode after testing to reduce idle exposure of its real provider credentials. `LOBBYSTACK_MAINTENANCE_MODE=false` can be re-applied for a live test window (admin/worker/voice), then reverted.

## Latest automated gate

Run `9a813b2e-6a72-4692-bb08-55c6f99f81dc`, UTC `2026-09-13T20:06:37Z`–`20:09:46Z`:

| Gate | Result |
| --- | --- |
| Lint | Passed, existing warnings remain |
| Typecheck | Passed; new migration/release scripts are now included in strict script checking |
| Unit/component suites | Passed |
| Workspace build | Passed |
| PostgreSQL calendar/booking regression | Passed, 12 checks, fake providers only |
| Functional Playwright suite | 24 passed; 0 skipped, 0 flaky, 0 failed |

The functional profile now runs the full default non-visual suite and the PostgreSQL calendar/booking check. It requires an explicit `parity_cert_` database, matching runtime-role URLs, fixed test secrets, two seeded operator sessions, and a paused worker. Visual baselines and live-provider tests remain separate gates.

## Defects fixed during execution

- Standalone asset preparation no longer nests `public/public` when the embed build has pre-created `public/embed`. This had made lazy translation files unavailable during browser tests.
- Lazy French namespace failures now load English fallback explicitly; failure of both languages remains retryable. Server-provided French auth copy remains usable without client translation downloads.
- OAuth state has an unpredictable nonce, bounded issuance time, and one-use database consumption. Calendar callbacks use the UI's success/error contract without reflecting arbitrary provider/URL messages.
- Google identity discovery requests the necessary identity scopes. Expired tokens can refresh under a connection lock without discarding retained refresh tokens.
- Calendar cancellation now deletes the provider event; delayed jobs use current appointment state. Deterministic create retries update an existing event rather than accepting stale times blindly.
- Google per-calendar availability failures no longer erase known busy windows. Reconciliation continues with independent connections after one failure, and stale selection responses cannot overwrite a newly selected calendar.
- Booking and rescheduling enforce business hours, explicit staff assignments, calendar busy windows, and mirror freshness. Selected calendars that are syncing, errored, older than 20 minutes, or outside their 90-day synchronization window do not advertise availability. Internal concurrent booking protection remains in place. This does not promise atomic exclusion against independent external Google Calendar writers.
- Errored calendar connections remain visible. The UI offers recovery, rejects read-only calendar selection, and displays actual successful sync time using migration `0052`.
- Voice tenant PostHog exports require affirmative call-context consent. Raw exception objects/causes are no longer handed to that external SDK. Consent is captured at context acquisition; active-session revocation behavior remains a separate privacy gate.
- Certification mode restricts email/SMS/transfer recipients and calendar targets, blocks phone inventory/routing mutations, and rejects live Polar endpoints. Billing portal configuration now respects the configured sandbox URL.
- The Twilio status webhook no longer acknowledges durable-update failures with `200`; it returns `503` with `Retry-After` and no provider text. It also gained regression coverage. Twilio retry behavior for non-2xx status callbacks must still be confirmed before cutover.
- `replacement:security` was reading CSP from a stale file after an earlier refactor and failed even though the policy was correct. The check now reads `security-headers.ts` (the actual source of truth) and verifies the proxy applies it. All security sub-checks pass.

## Remaining before switch-over

1. Rebuild and verify production-snapshot embeddings with a bounded provider budget, then verify retrieval and derived-data results.
2. Complete real Google OAuth and dedicated-calendar lifecycle tests, real voice/recording checks, deployed outbox delivery, and Polar sandbox lifecycle. Never copy a live Polar key into the sandbox test configuration.
3. Deploy and verify the latest tested candidate in the isolated environment; earlier cloud deployments predate the latest calendar/privacy fixes.
4. Complete authenticated load/soak, alert firing and recovery, visual/browser coverage, and current security/privacy certification.
5. Rehearse the legacy admission freeze, call/job drain, provider ingress accounting, traffic switch, and rollback. Native Convex pause is a candidate control, not yet tested or approved; it does not prove in-flight work has drained or buffer provider webhooks.
6. Review the production transformation policy. Current execution is deliberately local-rehearsal-only, disconnects migrated Google credentials, and retains legacy-only metadata privately. The final write-frozen export and production credential policy still require approval.
7. Approve an immutable release candidate, production resources/configuration, operator window, rollback boundary, and switch-over. Keep `releaseCertified: false` until the remaining evidence exists.

## Evidence handling

Detailed reports, snapshots, credentials, recipient allowlists, and source/target hashes are retained in restricted local artifacts. Do not copy them into public CI reports or tracked files. Temporary cloud resources incur usage charges and need explicit retention/cleanup decisions after certification.
