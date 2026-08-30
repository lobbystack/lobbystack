# Railway Deployment

Create separate Railway services for `admin`, `worker`, `voice-gateway`, `otel-collector`, PostgreSQL 16 with pgvector, Redis 7, and a bucket. Configure each source service to use its repository config file under `apps/*/railway.json` or `docker/otel-collector/railway.json`.

Keep the collector private. Admin, worker, and voice gateway send OTLP to its private hostname on port 4318. The voice gateway uses the admin's private hostname for `BACKEND_INTERNAL_URL`. Only admin and voice gateway require public domains.

## Shared Variables

- Database role URLs: `LOBBYSTACK_MIGRATOR_DATABASE_URL`, `LOBBYSTACK_AUTH_DATABASE_URL`, `LOBBYSTACK_APP_DATABASE_URL`, `LOBBYSTACK_WORKER_DATABASE_URL`, and `LOBBYSTACK_DISPATCHER_DATABASE_URL`.
- Redis: `REDIS_URL` and an environment-specific `REDIS_PREFIX`.
- Security: `BETTER_AUTH_SECRET`, `INTERNAL_SERVICE_SECRET`, `INTERNAL_SERVICE_TOKEN`, `ENCRYPTION_KEY`, and `OTP_HASH_SECRET`.
- Storage: set `STORAGE_PROVIDER=s3`, add Railway bucket references for `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, and `S3_BUCKET`, and set `S3_FORCE_PATH_STYLE=false`.
- Telemetry: `OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector.railway.internal:4318`, `SERVICE_VERSION` set to the release SHA, and PostHog OTLP endpoints and authorization on the collector only.

Provider credentials belong only on the services that use them. Follow `.env.example` for the complete variable names without copying development placeholder values.

## Deployment Order

1. Provision PostgreSQL, Redis, and the bucket.
2. Configure Redis AOF persistence and `noeviction`.
3. Bootstrap the least-privilege database roles with `docker/postgres/init/roles.sh` using the managed PostgreSQL administrator connection. This is a privileged, user-run operation.
4. Deploy the private collector.
5. Deploy worker; its pre-deploy command applies migrations using the configured migrator URL.
6. Deploy admin.
7. Deploy voice gateway when provider credentials are available.
8. Run the smoke, RLS, telemetry, webhook, storage, realtime, privacy, and Playwright certification checks.

Telemetry exporter failure must not affect readiness. Keep staging trace sampling at 100%; production retains errors, traces slower than 500 ms, and voice traces independently of the baseline sample rate.
