---
meta:
  title: Roll out the reliability fixes
  contentType: How-to
  category: Operations
---

# Roll out the reliability fixes

Use this runbook to validate and deploy the booking, voice, authentication, and packaging changes. Content retention now runs from the business plan, so review the schedule and backfill decision in the retention section. Keep new widget-key issuance disabled while chat remains restricted.

## Deployment scope and prerequisites

This runbook is for the release operator. Complete the checks, drain active work, deploy matching runtime versions, and verify the supported customer flows. Record the retention decision and any provider-recovery evidence in your change record.

You need access to the release checks, runtime-role credentials, and a staging environment. Do not use production database credentials for the test suites. Retention follows the plan schedule; the only remaining retention decision is whether to backfill existing content, and any exception to restricted widget access.

## Check the release before deployment

Run the workspace checks from the repository root:

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
pnpm test:build-config
docker compose --env-file .env.example config --quiet
```

Require the CI `validate` job before release. It depends on workspace checks, a PostgreSQL role suite, a browser end-to-end job, and four production-image builds. The database job migrates and bootstraps twice, verifies row-level security (RLS), and runs `pnpm test:reliability` against a test database. The browser job runs `bash scripts/e2e-local.sh`, which builds the admin standalone server and exercises the supported EN/FR journeys against disposable PostgreSQL, Redis, and Mailpit containers.

The local reliability suite requires `LOBBYSTACK_RELIABILITY_TEST_DATABASE_URL`, a loopback host, and a test-named database. Set explicit role URLs for the application, authentication, worker, and dispatcher. Set `LOBBYSTACK_SKIP_ENV_FILES=true` to prevent the database CLI from loading local environment files. Run the browser gate with `pnpm e2e:local`; it needs Docker Compose and a Playwright Chromium install.

## Review runtime settings

Configure the following settings before replacing the runtimes:

| Setting | Action |
| --- | --- |
| `NODE_ENV` | Use `production` for deployed runtimes |
| Role database URLs | Connect each runtime client with its named SQL role; do not fall back to a superuser |
| `NEXT_PUBLIC_*` | Supply browser-facing values during the admin image build; runtime changes need a rebuild |
| `WIDGET_KEY_ISSUANCE_ENABLED` | Leave unset or `false`; existing keys continue working |
| `TRUSTED_CLIENT_IP_HEADER` | Set to `x-real-ip` or `cf-connecting-ip`, and only after verifying that ingress overwrites that header. The admin and gateway share this setting |
| `VOICE_GATEWAY_TRUST_PROXY` | Leave `false`. The gateway reads the configured single-value header instead of trusting the full forwarding chain |
| `CONTENT_RETENTION_ENABLED` | On by default. Free keeps 30 days, paid keeps the longer periods in the retention section |
| `CONTENT_RETENTION_POLICY_JSON` | Optional. Overrides the paid periods only; leave empty for the defaults |

Remove `SEND_VERIFICATION_EMAIL_ON_SIGNUP` from deployment configuration. Signup and unverified sign-in use the shared verification-code issuer; that retired variable no longer controls delivery.

Migration `0056` marks phone-verified accounts as email-verified so they keep access. That flag proves phone ownership, not mailbox ownership. Before you add a feature that treats `email_verified` as proof of mailbox control, treat those grandfathered accounts as unverified.

Admin startup checks the application, authentication, worker, and dispatcher roles. Worker startup checks its worker and dispatcher roles. Startup retries a transient role-check failure on the next request instead of caching it. Maintenance mode skips those checks to preserve maintenance health endpoints; restart outside maintenance mode before accepting traffic.

When `TRUSTED_CLIENT_IP_HEADER` is unset in production, the admin logs one warning and falls back to shared per-path limits instead of trusting a client-supplied header. Set the variable so IP limits stay per-client.

## Replace the runtimes together

Drain voice calls and pause incoming work before replacing the gateway and admin. The gateway now reserves allowance before provider allocation, then binds the provider ID through an internal admin route. Deploy the admin before the new gateway, and avoid running the new gateway against an old admin.

Drain dispatchers before replacing workers. An old dispatcher does not enforce claim-token fencing and can still overwrite a reclaimed message. A queued reminder from before deployment can run, but the replacement reminder has a separate delivery ID.

Use a short admin replacement window for the OAuth-state format change. Pending Google Calendar authorizations from the old version fail validation; ask affected operators to restart authorization. Do not restore public synchronous scrypt verification as a fallback.

After deployment, verify these flows:

1. Sign up, enter the email code, and sign in; test resend cooldowns and an invalid code
2. Connect Google Calendar, then repeat a callback to confirm one-use state handling
3. Book and reschedule an appointment; confirm that the old reminder cannot send
4. Start and end a browser call; confirm completion and allowance reconciliation use the same call ID
5. Verify that restricted chat navigation stays hidden, the widget settings surface shows the restricted notice without a create action, and new widget-key creation returns `403` without its flag
6. Check worker errors, failed admissions, and outbox backlog before reopening traffic

The Google Calendar authorization routes now rate-limit by user, business, and trusted IP. The callback rejects over-limit requests before state or provider work. A missing or invalid trusted header collapses those requests into one shared bucket instead of bypassing the limit.

## Apply the new indexes

Migration `0057_query_plan_indexes.sql` adds five indexes chosen from local `EXPLAIN (ANALYZE, BUFFERS)` evidence under the real application and worker roles. The indexes cover dashboard period counts, the recording retention sweep, retained-object cleanup, and the booking busy-block lookup. The migration uses bounded lock and statement timeouts and builds transactionally.

Each `CREATE INDEX` takes a write lock while it builds. Production starts from an empty schema, so the build is short. Before you run this migration against a large table, move that index into its own file with a `-- lobbystack:concurrent-index <index_name>` header. The loader builds concurrent indexes outside a transaction and repairs an invalid index before it retries.

See [query-plan remediation](../validation/query-plan-remediation.md) for the measured before-and-after plans, rejected candidates, and deferred list. Re-run `scripts/query-plan-check.ts` after a large data change before adding more indexes.

## Confirm content retention

Content retention runs by default and follows the business plan. Free content expires 30 days after creation. Paid and self-host plans keep the longer periods below.

| Plan | messages | transcripts | recordings | follow-ups |
| --- | ---: | ---: | ---: | ---: |
| free_cloud | 30 | 30 | 30 | 30 |
| starter, pro, enterprise, self_host | 365 | 90 | 90 | 365 |

Writers set each row's expiry from the business plan at creation time, and the sweep acts only on rows whose expiry has passed. `CONTENT_RETENTION_ENABLED=false` disables content deletion deployment-wide. `CONTENT_RETENTION_POLICY_JSON` overrides the paid periods per category; free stays capped at 30 days and cannot be raised. Operator notification deliveries keep their separate 30-day policy.

Message scrubbing removes body text and media references. It does not delete provider-hosted media or storage objects. Recordings expire through their own storage retention.

Existing rows carry no expiry until you backfill them, so a plan change alone does not purge old content. Preview before you apply. Set `CONTENT_RETENTION_DATABASE_URL` to an explicit worker-role connection, then run a bounded dry-run with your cutoff:

```sh
pnpm exec tsx --tsconfig scripts/tsconfig.json \
  scripts/content-retention-backfill.ts \
  --business-id "$business_id" --category messages \
  --before "$historical_cutoff" --limit 100
```

The command resolves the business plan, reports counts, records already due, and a resume cursor without printing customer content. Keep the cutoff fixed when resuming with `--after`. Apply requires `--apply`, `--historical-approval-id`, and `--historical-basis created-at`; review the already-due count before using those flags.

Disabling the gate stops future sweeps. It cannot restore scrubbed or deleted content.

## Resolve uncertain voice allocations

Keep allowance reserved when a provider timeout leaves allocation uncertain. A placeholder provider ID does not prove that the provider consumed nothing. Do not infer billable duration from elapsed wall-clock time.

Set `VOICE_RECOVERY_DATABASE_URL` to an explicit worker-role connection and inspect one business at a time:

```sh
pnpm exec tsx --tsconfig scripts/tsconfig.json \
  scripts/operations/voice-recovery.ts \
  --business-id "$business_id" --limit 100
```

The dry-run lists call IDs, state, timing, and the required operator action. Check the provider before applying a resolution. Supply the real provider ID and reported duration for `provider-terminal` evidence; use `operator-attestation` only after proving that an unknown allocation consumed nothing. Both paths require an evidence reference and an explicit call ID.

The tool refuses recent calls and unknown provider duration. Retrying a completed resolution does not bill the call twice. The tool does not look up provider usage or release unknown allocations on its own.

## Scale the voice gateway

The gateway holds active and completed call state in process memory. The end, recording, and sideband routes must reach the replica that owns the session.

Run one replica, or route each session to the same replica, until that state moves to shared storage. Durable admission, allowance, and completion are stored in the admin database, so billing survives a restart and a redeploy. Only the live call lifecycle is process-local.

Before you scale past one replica, add shared session state or session-affinity routing, then test the end and recording routes against more than one replica.

## Roll back without discarding data

Drain calls and dispatchers before reverting runtime versions. Revert the gateway with a compatible admin version, and avoid mixing old dispatchers with new claim-token processing. Restart pending OAuth authorizations after either direction of the rollout.

Disable the new content-retention gate if policy validation fails. Preserve evidence and investigate before running another backfill. Do not remove migration lineage columns, delete customer configuration, or prune local recovery refs as part of rollback. Storage cleanup needs forward recovery: only this release’s deletion sweep reclaims a row left in `deleting_expired_upload`, and an older worker matches `pending` uploads only. Redeploy the worker from this release so the sweep retries those rows before you treat cleanup as complete.

## Compare build measurements

The local Linux ARM64 validation produced these measurements on Docker Desktop with 12 CPUs and 7.7 GiB of memory. Cold runs disabled layer reuse but could reuse the package-store cache; warm runs used cached layers. These figures compare cache behavior, not savings against the previous release.

| Runtime | Cold build | Cached build | Docker-reported image bytes |
| --- | ---: | ---: | ---: |
| Admin | 156.83s | 8.82s | 124802843 |
| Worker | 99.17s | 4.37s | 194297968 |
| Voice gateway | 68.29s | 3.73s | 181853940 |
| Migrator | 66.31s | 3.46s | 176401277 |

The timings describe the packaging validation run. The byte counts describe the rebuilt images on both architectures. All four images passed runtime source-map checks. Admin, worker, and gateway loaded the tokenizer; the migrator passed repeated migrations, bootstrap, and RLS verification.

We also built the images for Linux AMD64 and ran them as genuine `x86_64` under emulation. CI validates AMD64 natively on `ubuntu-latest`.

| Runtime | ARM64 bytes | AMD64 bytes |
| --- | ---: | ---: |
| Admin | 124802843 | 124863880 |
| Worker | 194297968 | 197504328 |
| Voice gateway | 181853940 | 184159377 |
| Migrator | 176401277 | 179602941 |

Repeat measurements after a code, dependency, or base-image change; the byte counts move with each.

The images exclude documentation and editor tooling during installation. `.github/build/prepare-image-workspace.mjs` drops the `mintlify` workspace project and the root `next-devtools-mcp` and `railway` development tools because they pull large optional agent binaries and none of them run at runtime. Keep them in the developer manifests. Keep private build source maps for debugging; runtime images omit them. The migrator still uses `tsx` because its emitted imports do not support plain Node execution. No speculative indexes or public Git-history rewrite accompany this release.

The embedded widget iframe still mounts the admin providers. Splitting it into a lean shell needs a measured comparison of transferred JavaScript and main-thread time before any restructure. This release defers that step and keeps the restricted widget scope unchanged.
