# Deploy LobbyStack on Railway

Manage the project with Railway Infrastructure as Code in `.railway/railway.ts`. The definition adopts the isolated parity staging environment: admin, worker, voice gateway, a separate migrator, PostgreSQL 16 with pgvector, Redis 7, two persistent volumes, and a private bucket. See `.railway/README.md` for explicit environment selection and plan/apply commands.

Legacy `apps/*/railway.json` files have been removed. Do not reintroduce per-service Config as Code. Review every IaC plan before applying, and preserve existing credentials with `preserve()`; never export secrets into source.

The voice gateway uses the admin's private hostname for `BACKEND_INTERNAL_URL`. Only admin and voice gateway require public domains.

## Configure shared variables

- Database role URLs: `LOBBYSTACK_MIGRATOR_DATABASE_URL`, `LOBBYSTACK_AUTH_DATABASE_URL`, `LOBBYSTACK_APP_DATABASE_URL`, `LOBBYSTACK_WORKER_DATABASE_URL`, and `LOBBYSTACK_DISPATCHER_DATABASE_URL`.
- Redis: `REDIS_URL` and an environment-specific `REDIS_PREFIX`.
- Security: `BETTER_AUTH_SECRET`, `INTERNAL_SERVICE_SECRET`, `INTERNAL_SERVICE_TOKEN`, `ENCRYPTION_KEY`, and `OTP_HASH_SECRET`.
- Storage: set `STORAGE_PROVIDER=s3`, add Railway bucket references for `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, and `S3_BUCKET`, and set `S3_FORCE_PATH_STYLE=false`.
- Telemetry: set `OTEL_EXPORTER_OTLP_ENDPOINT` and `OTEL_EXPORTER_OTLP_HEADERS` on each application service, and set `SERVICE_VERSION` to the release SHA.

Provider credentials belong only on the services that use them. Follow `.env.example` for the complete variable names without copying development placeholder values.

## Deploy services in order

1. Provision PostgreSQL, Redis, and the bucket.
2. Configure Redis AOF persistence and `noeviction`.
3. Bootstrap the least-privilege database roles with `docker/postgres/init/roles.sh` using the managed PostgreSQL administrator connection. This is a privileged, user-run operation.
4. Run the separate migrator, applying migrations twice and checking database consistency and RLS. Deploy worker with only worker/dispatcher database credentials after migration succeeds.
5. Deploy admin.
6. Deploy voice gateway when provider credentials are available.
7. Run the smoke, RLS, telemetry, webhook, storage, realtime, privacy, and Playwright certification checks.

Telemetry exporter failure must not affect readiness. Configure retention and sampling in the OTLP backend.

## Twilio callback signatures

Set `TWILIO_SMS_WEBHOOK_URL` and `TWILIO_STATUS_CALLBACK_URL` on admin to their public HTTPS endpoints. Set the same status callback endpoint on worker so delivery updates are requested. These non-secret URLs are declared in `.railway/railway.ts`. Railway may present an internal request URL to Next.js, so signature validation reconstructs the public endpoint while retaining the incoming query string, including `notificationId`, `messageId`, or `operatorDeliveryId`. Query values remain covered by signature verification.

Keep disposable Twilio credentials in Railway and declare them with `preserve()` for admin, worker, and voice gateway. An authenticated Media Streams upgrade returning 503 with no AI key is an expected configuration failure, not a successful voice certification.
