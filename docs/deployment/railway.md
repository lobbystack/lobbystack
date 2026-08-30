# Railway Deployment

Create separate Railway services for `admin`, `worker`, `voice-gateway`, PostgreSQL 16 with pgvector, Redis 7, and a bucket. Configure each application service with its repository config under `apps/*/railway.json`.

The voice gateway uses the admin's private hostname for `BACKEND_INTERNAL_URL`. Only admin and voice gateway require public domains.

## Shared Variables

- Database role URLs: `LOBBYSTACK_MIGRATOR_DATABASE_URL`, `LOBBYSTACK_AUTH_DATABASE_URL`, `LOBBYSTACK_APP_DATABASE_URL`, `LOBBYSTACK_WORKER_DATABASE_URL`, and `LOBBYSTACK_DISPATCHER_DATABASE_URL`.
- Redis: `REDIS_URL` and an environment-specific `REDIS_PREFIX`.
- Security: `BETTER_AUTH_SECRET`, `INTERNAL_SERVICE_SECRET`, `INTERNAL_SERVICE_TOKEN`, `ENCRYPTION_KEY`, and `OTP_HASH_SECRET`.
- Storage: set `STORAGE_PROVIDER=s3`, add Railway bucket references for `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, and `S3_BUCKET`, and set `S3_FORCE_PATH_STYLE=false`.
- Telemetry: set `OTEL_EXPORTER_OTLP_ENDPOINT` and `OTEL_EXPORTER_OTLP_HEADERS` on each application service, and set `SERVICE_VERSION` to the release SHA.

Provider credentials belong only on the services that use them. Follow `.env.example` for the complete variable names without copying development placeholder values.

## Deployment Order

1. Provision PostgreSQL, Redis, and the bucket.
2. Configure Redis AOF persistence and `noeviction`.
3. Bootstrap the least-privilege database roles with `docker/postgres/init/roles.sh` using the managed PostgreSQL administrator connection. This is a privileged, user-run operation.
4. Deploy worker; its pre-deploy command applies migrations using the configured migrator URL.
5. Deploy admin.
6. Deploy voice gateway when provider credentials are available.
7. Run the smoke, RLS, telemetry, webhook, storage, realtime, privacy, and Playwright certification checks.

Telemetry exporter failure must not affect readiness. Configure retention and sampling in the OTLP backend.
