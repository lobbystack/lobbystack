---
meta:
  title: Review staging environment repairs
  navLabel: Staging Environment Report
  contentType: Reference
  category: Deployment
---

<!-- Content plan: Give the project owner a dated record of staging configuration repairs, retained variables, deployment evidence, and validation limits. Audience: operators and maintainers. Open question: complete a real signup to confirm SMS delivery. -->

# Review staging environment repairs

The September 8, 2026 UTC repair covers Railway project `lobbystack-parity-20260907`, environment `staging`. You can use the table below to check the configuration without exposing secret values. Production phone numbers, existing callbacks, and Polar prices remain unchanged.

## Configuration changes

The application services now use these settings:

| Area | Services | Variables and result |
| --- | --- | --- |
| Signup verification | Admin, worker | Set `TWILIO_VERIFY_SERVICE_SID` to a service in the staging Twilio subaccount. The signup flow uses Twilio Verify; the application generates its own appointment-change codes. |
| Existing alert number | Admin, worker | Set `TWILIO_ALERT_ACCOUNT_SID` and `TWILIO_ALERT_SMS_FROM` to the main account’s existing alert sender. No number purchase or transfer. |
| Restricted SMS access | Worker | Added `TWILIO_ALERT_API_KEY_SID` and `TWILIO_ALERT_API_KEY_SECRET`. The key allows `/twilio/messaging/messages/create`; it grants no number-management or Voice permissions. |
| Alert delivery signatures | Admin | Added `TWILIO_ALERT_WEBHOOK_KEY_ID` and `TWILIO_ALERT_WEBHOOK_SECRET`. A Twilio rule applies the signing key to the staging status-callback URL. The main account auth token stays outside staging. |
| Number claims | Admin | Generated `NUMBER_CLAIM_TOKEN_SECRET`. |
| Turnstile | Admin | Replaced test credentials with `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` from the existing signup widget. Added the staging hostname; retained `lobbystack.com` and `localhost`. |
| Outgoing email | Worker | Configured `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USERNAME`, `SMTP_PASSWORD`, and `EMAIL_FROM` for Resend’s Simple Mail Transfer Protocol (SMTP) service. Created a domain-scoped sending key. |
| Email verification | Admin | Enabled `REQUIRE_EMAIL_VERIFICATION` and `SEND_VERIFICATION_EMAIL_ON_SIGNUP`. |
| Feedback email | Admin, worker | Set `FEEDBACK_TO_EMAIL` from main. |
| Google Calendar | Admin, worker | Copied `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. Set `GOOGLE_REDIRECT_URI` to the staging callback and registered it in Google Cloud. Retained both existing redirect URIs. |
| Live Polar checkout | Admin, worker | Set `POLAR_ACCESS_TOKEN`, `POLAR_ORGANIZATION_ID`, `POLAR_API_BASE_URL`, and the four `POLAR_*_PRODUCT_ID` variables to the existing live organization and products. Completing checkout takes a real payment. |
| Polar webhooks | Admin | Created a separate staging endpoint and set `POLAR_WEBHOOK_SECRET`. Kept the existing production endpoint. Corrected signature handling and tenant mapping. |
| Usage billing | Worker | Restored named event ingestion through `/v1/events/ingest`, matching the historical Convex implementation. No meter-ID variables, new meters, or price changes. |
| Website crawling | Worker | Set `FIRECRAWL_API_KEY`. |
| Product analytics | Admin | Set `NEXT_PUBLIC_POSTHOG_KEY` and `NEXT_PUBLIC_POSTHOG_HOST`, including Docker build arguments. |
| Product analytics | Worker | Set `POSTHOG_API_KEY` and `POSTHOG_HOST`. |
| Voice analytics | Voice gateway | Set `POSTHOG_KEY`, `POSTHOG_HOST`, and `POSTHOG_PRIVACY_MODE`. |
| Logs, traces, and metrics | Admin, worker, voice gateway | Set `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_HEADERS`, and `SERVICE_VERSION`. Verified empty OpenTelemetry Protocol (OTLP) batches against the PostHog ingestion endpoints. |
| Demo routing | Admin | Set `PROSPECT_DEMO_OPERATOR_EMAIL` and `SITE_URL`. |

Twilio restricts the API key by operation, not by sender number. The worker limits its alert provider to `TWILIO_ALERT_SMS_FROM`. Keep the restricted key in the worker; the admin needs the separate signing secret.

## Retained and removed variables

Keep the following settings for the PostgreSQL runtime:

| Variables | Reason |
| --- | --- |
| `DEPLOYMENT_MODE=cloud` | Controls hosted business behavior and development-only guards. It is not a Convex setting. |
| `DATABASE_URL`, `LOBBYSTACK_APP_DATABASE_URL`, `LOBBYSTACK_AUTH_DATABASE_URL`, `LOBBYSTACK_WORKER_DATABASE_URL`, `LOBBYSTACK_DISPATCHER_DATABASE_URL`, `LOBBYSTACK_MIGRATOR_DATABASE_URL` | Preserve authentication, runtime-role isolation, worker dispatch, and migrations. Each service keeps its existing subset. |
| `BETTER_AUTH_SECRET`, `BETTER_AUTH_USE_SECURE_COOKIES`, `AUTH_TRUSTED_ORIGINS` | Protect authentication and session cookies. |
| `ENCRYPTION_KEY`, `OTP_HASH_SECRET`, `WIDGET_SESSION_SECRET` | Protect stored credentials, one-time passwords (OTPs), and widget sessions. |
| `INTERNAL_SERVICE_SECRET`, `INTERNAL_SERVICE_TOKEN` | Authenticate requests between services. |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` | Keep staging’s own Twilio subaccount for verification and telephony. These are not the main account credentials. |
| `TWILIO_SMS_WEBHOOK_URL`, `TWILIO_STATUS_CALLBACK_URL` | Resolve public URLs during webhook signature verification and callback creation. |
| `STORAGE_PROVIDER`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET`, `S3_ENDPOINT`, `S3_REGION`, `S3_FORCE_PATH_STYLE` | Keep the existing S3-compatible object store. |
| `REDIS_URL`, `REDIS_PREFIX` | Keep job queues, cached data, and deployment namespacing. |
| `OPENAI_API_KEY` | Keep model-provider access. Optional `AI_CHAT_*` and `AI_EMBEDDING_*` overrides can remain unset with the default provider. |
| `APP_BASE_URL`, `BACKEND_INTERNAL_URL`, `VOICE_GATEWAY_BASE_URL`, `NEXT_PUBLIC_WEB_CALL_ENDPOINT`, `WEB_CALL_ALLOWED_ORIGINS` | Keep public and internal routing plus browser-origin checks. |
| `NODE_ENV`, `PORT`, `HOSTNAME`, platform-generated `RAILWAY_*` variables | Keep process startup and Railway networking settings. |

I removed the ignored `OTEL_ENABLED` variable from all four application services and the infrastructure definition. I removed obsolete `POLAR_*METER_ID` examples after restoring event ingestion. Those variables were absent from staging and main.

S3 deployments no longer require `LOCAL_STORAGE_SIGNING_SECRET` at startup. Local-storage deployments retain the strong-secret check. The infrastructure definition preserves the repaired secrets; `railway config plan` reports no drift.

## Validation evidence

The final releases are:

| Service | Deployment | Result |
| --- | --- | --- |
| Admin | `ee837b4d-990b-487a-a4b3-027d9db420e2` | Railway success |
| Worker | `a41d7fb5-a370-4501-82e9-3b8c433bb908` | Railway success |
| Voice gateway | `c9be60f8-e4d4-4177-81f2-996cf6a7aa71` | Railway success |

Checks completed:

- 552 tests passed across admin, worker, providers, and domain; two added S3 startup tests passed.
- Typechecks passed for the affected workspaces.
- Admin `/api/health/ready` and voice gateway `/health/ready` returned HTTP 200. The worker passed Railway’s `/health/ready` check.
- Resend SMTP passed transport encryption and authentication checks without sending email.
- Firecrawl credentials and Polar checkout-read access returned HTTP 200.
- Polar accepted an empty usage-event batch: zero insertions, zero duplicates.
- Staging accepted signed Twilio alert callbacks and rejected unknown signing keys with HTTP 401.
- Staging accepted a signed, unmapped Polar event without writing business data and rejected an invalid signature with HTTP 401.
- The restricted Twilio key received HTTP 401 for a number-inventory request.

## Validation limits

You still need to complete a signup to confirm delivery to your phone. I did not send SMS or email, complete checkout, or record billable usage during the checks.

Auto-review blocked a direct Turnstile validation request because it would transmit the configured secret to Cloudflare. Widget credentials and the hostname allowlist match; server-side validation remains untested.

Resend delivery-event tracking remains unconfigured. Outgoing email uses SMTP, and its message identifiers do not match the provider IDs expected by the current webhook handler. Adding `RESEND_WEBHOOK_SECRET` alone would not restore delivery tracking.

I removed the failed local standalone build output to recover disk space. You can regenerate that output with a build; source files remain intact.
