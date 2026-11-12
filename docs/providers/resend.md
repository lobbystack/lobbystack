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

## Send the plan reminders

An owner who claims a trial number and meets their agent lands on the plans, and onboarding finishes when they choose one. The worker emails an owner who hasn't chosen twice: one hour after they reached the plans, and again 24 hours after, at any hour. Each names their number and links to the plans, and the second has its own subject and wording. Each goes out once per business, in the owner's dashboard language, and only if the business is still on the plans, its trial is active and it has no paid plan. A partner's businesses, self-hosted businesses and businesses a platform key onboarded never get them, and neither does an owner who unsubscribed from marketing emails. They need no settings of their own beyond SMTP.

## Let people unsubscribe from marketing emails

The welcome email and the plan reminders are marketing emails, so each one lets the recipient stop them, as CAN-SPAM, CASL, the EU rules and the Gmail and Yahoo bulk sender rules require. Every other email is transactional and always goes out. `MARKETING_EMAIL_TEMPLATES` in `packages/providers/src/email/smtp.ts` holds the list:

- **Marketing**: `welcome` and `plan_reminder`, which covers both reminders
- **Transactional**: the number trial emails (`day10`, `day13`, `ended`, `minutes_out`), `number_release`, verification, password reset, account setup, invitations, the new passkey alert, operator alerts, call summaries, feedback, the pool and allowance alerts, and the notices that a partner released or deleted a business

To make a new lifecycle email a marketing email, add its template to `MARKETING_EMAIL_TEMPLATES` and to `HOST_ONLY_EMAIL_TEMPLATES` in `packages/domain/src/server/hostEmails.ts`. The provider refuses to send a marketing email without its recipient's unsubscribe links.

Each marketing email carries two ways out:

- The headers `List-Unsubscribe: <APP_BASE_URL/api/email/unsubscribe?token=…>` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click`, from RFC 8058. A mail app POSTs to that URL and the person is unsubscribed at once, with no cookies. The proxy exempts that one path from its CSRF origin check, and the route rate-limits by client address and by token. There's no `mailto:` address, because the host has no inbound mailbox.
- An **Unsubscribe** link in the footer, in the recipient's language, to `/{locale}/unsubscribe/{token}`. Opening the page changes nothing, since link scanners open links too. Its one button unsubscribes, then offers to resubscribe.

The token is a v1 signed payload holding the user's ID, signed with HMAC-SHA256 under `ENCRYPTION_KEY` and its own domain, `email:marketing-unsubscribe`, so no other kind of token passes for it. It doesn't expire, and it needs no new setting. If you rotate `ENCRYPTION_KEY`, the links in emails already sent stop working, and people turn marketing emails off from the dashboard instead.

The choice belongs to the person, in `users.marketing_emails_unsubscribed_at`. When the worker sends a marketing email, it looks up the address the email was queued for through `app.marketing_email_recipient`. It skips the email when that person unsubscribed or no account has the address, logs `email.skipped`, and records the job as skipped, not failed. The welcome and plan reminder jobs also skip queueing one. A signed-in person turns marketing emails on or off under **Account > Notifications**, which a partner's pages don't show, since a partner's businesses get none of these emails.

## Send call summaries

The worker emails a business's team after each call the agent answers, unless a team member turned **Call answered** off in their notification settings. It goes out under the business's brand, with the caller, time, length, outcome and summary, and a link to the call. It needs no settings of its own beyond SMTP.
