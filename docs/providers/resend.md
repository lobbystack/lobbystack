# Transactional Email Setup

LobbyStack sends authentication and operational email through the worker's SMTP provider. The current flows include verification, password reset, email changes, notifications, and feedback delivery.

## Required Environment

- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USERNAME`
- `SMTP_PASSWORD`
- `EMAIL_FROM`
- `EMAIL_REPLY_TO` when replies should go elsewhere
- `APP_BASE_URL` for links in email
- `FEEDBACK_TO_EMAIL` for dashboard feedback delivery

For local development, start Mailpit with `docker compose --env-file .env --profile development up -d mailpit` and point SMTP at port `1025`.

## Verification

1. Start PostgreSQL, Redis, admin, worker, and the SMTP provider.
2. Open `/forgot-password` and request a reset.
3. Confirm the worker consumes the email outbox job.
4. Open the message and complete the reset flow.
5. Repeat with signup verification and email change.
6. Submit dashboard feedback and confirm asynchronous delivery to `FEEDBACK_TO_EMAIL`.

## Production Notes

- Use a verified sender domain with SPF and DKIM.
- Keep SMTP credentials on admin/worker server runtimes only.
- Monitor outbox retries and dead-letter jobs.
- Store feedback before attempting delivery so provider outages do not lose submissions.
