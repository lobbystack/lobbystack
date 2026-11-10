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
- Verify the partner base domain (`PARTNER_BASE_DOMAIN`) in Resend too. Partner emails send from `no-reply@` that domain, so the SMTP key needs sending access to every domain it sends from; a key scoped to the host's domain only gets a 550 for partner mail.
- Keep SMTP credentials on admin/worker server runtimes only.
- Monitor outbox retries and dead-letter jobs.
- Store feedback before attempting delivery so provider outages do not lose submissions.

## Send the welcome email

The worker emails each new owner a welcome two minutes after they finish onboarding. It goes out from `EMAIL_FROM` in the owner's dashboard language, and replies go to `EMAIL_REPLY_TO`. Its button opens Home on the phone step: the forwarding steps for the number the owner took, or the number picker. A partner's businesses and businesses a platform key onboarded never get it. It needs no settings of its own beyond SMTP.

## Send call summaries

The worker emails a business's team after each call the agent answers, unless a team member turned **Call answered** off in their notification settings. It goes out under the business's brand, with the caller, time, length, outcome and summary, and a link to the call. It needs no settings of its own beyond SMTP.
