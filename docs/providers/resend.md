# Configure transactional email

LobbyStack sends authentication and operational email through the worker's SMTP provider. The current flows include verification, password reset, email changes, notifications, and feedback delivery.

## Configure the environment

- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USERNAME`
- `SMTP_PASSWORD`
- `EMAIL_FROM`
- `EMAIL_REPLY_TO` when replies should go elsewhere
- `APP_BASE_URL` for links in email
- `FEEDBACK_TO_EMAIL` for dashboard feedback delivery
- `ONBOARDING_FOLLOWUP_FROM` and `ONBOARDING_FOLLOWUP_SENDER_NAME` for the founder check-in email (worker only)

For local development, start Mailpit with `docker compose --env-file .env --profile development up -d mailpit` and point SMTP at port `1025`.

## Verification

1. Start PostgreSQL, Redis, admin, worker, and the SMTP provider.
2. Open `/forgot-password` and request a reset.
3. Confirm the worker consumes the email outbox job.
4. Open the message and complete the reset flow.
5. Repeat with signup verification and email change.
6. Submit dashboard feedback and confirm asynchronous delivery to `FEEDBACK_TO_EMAIL`.

## Operate email in production

- Use a verified sender domain with SPF and DKIM.
- Keep SMTP credentials on admin/worker server runtimes only.
- Monitor outbox retries and dead-letter jobs.
- Store feedback before attempting delivery so provider outages do not lose submissions.

## Send the onboarding check-in email

The worker emails each new owner 24 hours after they finish onboarding and asks what they thought of LobbyStack. It skips owners who came back: a sign-in or any call more than an hour after onboarding counts as a return. It also skips owners whose email domain matches the sender's, so your team's test accounts don't get it.

Set both variables on the worker to turn it on:

- **`ONBOARDING_FOLLOWUP_FROM`**: the sender, such as `Raphael from LobbyStack <raphael@lobbystack.com>`. Replies go to this address, so use an inbox you read. The domain must be verified in Resend.
- **`ONBOARDING_FOLLOWUP_SENDER_NAME`**: the first name used in the email body and signature, such as `Raphael`.

Leave either one empty to turn the email off. Each workspace gets the email at most once, and workspaces that finished onboarding before this feature shipped never get it.
