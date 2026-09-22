# Query plan remediation validation

This phase measured the query plans behind the retention sweeps, booking availability, and dashboard period counts on an isolated PostgreSQL 16/pgvector database at 10k-50k rows per table, then added five indexes where the evidence showed a repeatable plan or scan-buffer improvement. Migration `0057_query_plan_indexes.sql` adds those indexes and removes no data. All other candidates are deferred with the measurements below. These are single-node local medians, not production capacity claims.

## Method

The harness `scripts/query-plan-check.ts` seeds three reserved tenants (`qp-fixture-a`, `qp-fixture-b`, `qp-fixture-c`) with fixed UUIDs, runs `ANALYZE`, then runs `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` for each production predicate. Timed statements run through the `lobbystack_app` and `lobbystack_worker` logins with the same `app.business_id`/`app.user_id`/`app.actor_type` settings the runtimes set, so the planner sees the RLS policy predicates.

Each predicate runs seven times and the harness reports the median. The sweep statements are `UPDATE`/`DELETE`, so the harness rolls back each run and vacuums the touched table before the next run. Without that, aborted tuple versions inflate index scans and the buffer counts drift upward. Buffers come from the plan root (cumulative) and from the outermost scan node, which captures the scan subtree.

The harness refuses any non-loopback host and requires `ALLOW_QUERY_PLAN_CHECK=true`. It never reads `.env` files and never touches existing tenants.

Fixture sizes, business A / B / C:

| Table | A | B | C | Total |
| --- | ---: | ---: | ---: | ---: |
| `messages` | 40,000 | 9,000 | 1,000 | 50,000 |
| `transcripts` | 40,000 | 9,000 | 1,000 | 50,000 |
| `storage_objects` | 42,000 | 9,450 | 1,050 | 52,500 |
| `appointments` | 16,000 | 4,000 | 600 | 20,600 |
| `calendar_busy_blocks` | 30,000 | 6,000 | 800 | 36,800 |
| `inbox_items` | 40,000 | 9,000 | 1,000 | 50,000 |
| `operator_notification_deliveries` | 40,000 | 9,000 | 1,000 | 50,000 |

Sweep predicates match 10-20% of rows, dashboard windows cover 30 days of a 720-day range (about 4%), and booking windows are one hour inside the generated ranges.

## Results

Business A, seven-run median, app role for booking/dashboard and worker role for sweeps:

| Predicate | Before scan rows | After scan rows | Before scan buffers | After scan buffers | Before root buffers | After root buffers | Before ms | After ms | After plan |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| `sweep.messages` | 3945 | 3945 | 1257 | 1257 | 61455 | 61455 | 41.25 | 42.64 | Bitmap Heap Scan on messages |
| `sweep.transcripts` | 8000 | 8000 | 878 | 878 | 17580 | 17580 | 21.02 | 21.29 | Seq Scan on transcripts |
| `sweep.inbox_items` | 4000 | 4000 | 753 | 753 | 62037 | 62037 | 44.99 | 45.46 | Bitmap Heap Scan on inbox_items |
| `sweep.operator_deliveries` | 4000 | 4000 | 1088 | 1088 | 70869 | 70869 | 85.33 | 87.61 | Bitmap Heap Scan on operator_notification_deliveries |
| `sweep.recordings` | 40000 | 1826 | 1022 | 1836 | 5122 | 1825 | 86.97 | 4.21 | Index Scan on calls |
| `sweep.storage_upload` | 1600 | 1600 | 939 | 939 | 1945 | 1942 | 4.22 | 4.09 | Index Scan on storage_objects |
| `sweep.storage_retained` | 4000 | 4000 | 1041 | 935 | 2041 | 1933 | 13.98 | 9.68 | Index Scan on storage_objects |
| `booking.appointments_overlap` | 340 | 340 | 881 | 873 | 888 | 862 | 3.58 | 3.68 | Bitmap Heap Scan on appointments |
| `booking.calendar_busy` | 525 | 525 | 1780 | 1049 | 1780 | 1007 | 6.05 | 5.17 | Bitmap Heap Scan on calendar_busy_blocks |
| `dashboard.appointments_created` | 689 | 689 | 1088 | 692 | 1088 | 692 | 6.43 | 5.32 | Index Only Scan on appointments |
| `dashboard.appointments_previous_window` | 690 | 690 | 1089 | 694 | 1089 | 694 | 6.38 | 5.29 | Index Only Scan on appointments |
| `dashboard.messages_created` | 1679 | 1679 | 1704 | 1704 | 1704 | 1704 | 12.70 | 12.82 | Index Only Scan on messages |

Rows that show no change are either controls or deferred candidates. `dashboard.messages_created` already used `messages_business_idx` and stays an index-only scan. For `sweep.recordings`, the outer-scan number rose because the plan reordered into a merge join; the root buffer count fell 64% and the median fell 95%, which is the comparable figure. The `ModifyTable` write node dominates the root buffers for `sweep.messages`, `sweep.inbox_items`, and `sweep.operator_deliveries`, so scan-level index changes there do not move the root.

## Indexes added

Migration `0057_query_plan_indexes.sql` creates five indexes, each tied to the predicate above.

| Index | Table and columns | Predicate |
| --- | --- | --- |
| `appointments_business_created_idx` | `appointments (business_id, created_at)` | dashboard period counts |
| `calls_business_recording_idx` | `calls (business_id, recording_object_id)` | `recording_object_id IS NOT NULL` |
| `storage_objects_business_retention_idx` | `storage_objects (business_id, retention_until)` | `retention_until IS NOT NULL AND purpose <> 'recording'` |
| `storage_objects_recording_retention_idx` | `storage_objects (business_id, retention_until, id)` | `purpose = 'recording' AND status = 'ready' AND retention_until IS NOT NULL` |
| `calendar_busy_blocks_connection_start_idx` | `calendar_busy_blocks (connection_id, starts_at)` | booking availability |

The recording sweep needs both the `calls` and the `storage_objects` recording index to reach the measured plan. With the `calls` index alone the predicate runs in 5.93 ms; the storage covering index takes it to 4.21 ms. The retained and recording storage sweeps use different predicates, so they need separate partial indexes on the same table.

## Candidates deferred

We built and measured every other candidate on the same fixture, then removed it.

| Candidate | Predicate | Measured with index | Verdict |
| --- | --- | --- | --- |
| `messages (business_id, content_expires_at)` | message content sweep | scan buffers 1257 to 3950, root and median unchanged | Rejected: matched rows are scattered, so the heap reads more pages than the existing bitmap scan on `business_id` |
| `transcripts (business_id, expires_at)` | transcript retention delete | Seq Scan 878 to bitmap 710 buffers, 21.02 to 19.81 ms | Deferred: 19% scan-buffer and 6% time change is below the 25%/20% bar and the root is unchanged |
| `inbox_items (business_id, content_expires_at)` | follow-up content sweep | 753 to 695 buffers, 44.99 to 43.13 ms | Deferred: 8% and 4%, below the bar |
| `operator_notification_deliveries (business_id, content_expires_at)` | operator delivery sweep | 1088 to 1030 scan buffers, root 70869 to 78814, 85.33 to 84.51 ms | Rejected: root buffers rose and time did not improve |
| `storage_objects (business_id, expires_at)` for pending uploads | expired upload sweep | 939 to 933 buffers, 4.22 to 4.50 ms | Rejected: no change |
| `calendar_busy_blocks (business_id, starts_at)` | booking availability | 1780 to 1603 buffers, 6.05 to 6.33 ms | Rejected in favor of the `connection_id` variant, which wins more |
| `appointments (staff_id, starts_at, status)` | booking overlap | 881 to 873 buffers, 3.58 to 3.68 ms | Deferred: `appointments_staff_start_idx` and the calendar-external unique index already serve the overlap |
| `product_events (business_id, sent_at)` | sent-event deletion | not added | Deferred: `0055` already added `product_events_business_sent_idx` |

We reviewed the `outbox_messages` dispatcher claim and the `notifications` schedule sweep but did not re-measure them. Their predicates map to `outbox_available_idx (published_at, available_at)` and `notifications_status_schedule_idx (status, scheduled_for)`, and they run under the dispatcher role, outside the worker/app scope of this phase.

## Migration safety

`0057` deletes no data and creates only indexes. The migration loader applies a file as one query string. That string cannot contain several `CREATE INDEX CONCURRENTLY` statements, because Postgres wraps multiple statements in one implicit transaction and rejects a concurrent build inside a transaction. The loader already builds a single concurrent index outside a transaction through the `-- lobbystack:concurrent-index` directive, which is how `0055` works; one file can carry only one such index.

This migration uses transactional `CREATE INDEX IF NOT EXISTS` for all five indexes, matching the `0048` precedent, and sets `lock_timeout = '5s'` and `statement_timeout = '120s'` for the build window. A build that cannot take its lock fails and rolls back instead of blocking writers past the lock window, and the loader records the migration only after the whole file commits. If a production build of any single index cannot meet the lock window, split that index into its own `00NN` file with the concurrent directive so the loader builds it outside a transaction.

Validation on the test database: the migration applied, a second `pnpm db:migrate` skipped it, and `pnpm db:verify-rls` reported RLS enabled and forced on 63 tables. `pnpm --filter @lobbystack/db typecheck`, the raw-migration manifest test, and `pnpm typecheck:scripts` passed.

## Reproduction

```sh
docker run -d --name lobbystack-qp-pg \
  --tmpfs /var/lib/postgresql/data:rw,size=4g \
  -p 127.0.0.1:55432:5432 \
  -e POSTGRES_PASSWORD="$PGPASSWORD" -e POSTGRES_USER=lobbystack -e POSTGRES_DB=lobbystack \
  pgvector/pgvector:pg16 postgres -c shared_buffers=1GB -c fsync=off

pnpm db:migrate
pnpm --filter @lobbystack/db exec tsx src/cli.ts bootstrap
ALLOW_QUERY_PLAN_CHECK=true \
  QUERY_PLAN_CHECK_DATABASE_URL=postgres://lobbystack@127.0.0.1:55432/lobbystack \
  QUERY_PLAN_CHECK_APP_DATABASE_URL=postgres://lobbystack_app:$APP_PASSWORD@127.0.0.1:55432/lobbystack \
  QUERY_PLAN_CHECK_WORKER_DATABASE_URL=postgres://lobbystack_worker:$WORKER_PASSWORD@127.0.0.1:55432/lobbystack \
  pnpm exec tsx --tsconfig tsconfig.base.json scripts/query-plan-check.ts \
    --reseed --label=before --out=/tmp/query-plan-before.json
```

Apply `0057`, then rerun with `--label=after` and no `--reseed` to compare the same rows.

## Measurement limits

The fixture is synthetic and single-node with `fsync=off` and a 1 GB shared buffer, so warm-cache plans dominate after the first read. These medians do not predict production latency or throughput. The recordings result depends on both partial indexes; removing either changes the plan. The deferred candidates may earn an index at higher row counts where the sequential scans exceed the index break-even point, so revisit them with production-shaped data before closing the phase.
