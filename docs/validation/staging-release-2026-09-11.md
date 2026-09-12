# Staging release — September 11, 2026

Release base: `2c9df8c0`, plus the authentication verification UI correction made during live certification. Project: `af0a130e-7b02-4fc0-94ef-b0ac45a0a0a6`; environment: `22237215-5837-4754-842b-9306d43588ed` (`staging`). Production cutover is not certified.

## Deployed

- Migrator: `24ed81cb-4896-4740-90c7-1d1313158e08`, successful. Migrations applied twice, database check passed, RLS enabled and forced on 63 tables.
- Worker: `0fbf32dc-bf5e-495c-be4f-bf9888401ce2`, followed by configuration redeploy `3fb86238-0cff-49fe-abe6-b91deed8c68c`, successful.
- Admin: `5a25ad6b-1550-4bb3-9c23-b5a8860f5a42`, followed by auth correction `9b297767-708a-4669-9c7b-573b10b42fc7`, successful.
- Voice gateway: `509c9f82-bd3a-4bc6-8d0a-4e47c06ec508`, successful.

## Verified

- Deployed admin and voice readiness returned HTTP 200.
- French login HTML includes the email form, `lang="fr"`, and marketing-origin legal links.
- Widget document and loader returned 200 without X-Frame-Options DENY; regular pages retain DENY.
- A fresh staging PostgreSQL dump restored into a disposable database. All 63 RLS-enabled tables retained forced RLS. Temporary database and dump were removed. This verifies database restoration, not the complete traffic-switch rollback procedure or source-data reconciliation.
- Authentication regression tests: 13 passed; admin TypeScript check passed.

## Defects found during live certification

Staging requires email verification. A successful signup can return `token: null`; the UI previously treated this as an authenticated session and navigated to the dashboard, which redirected to login. The UI now presents generic verification instructions, preserving duplicate-account privacy. Unverified login now explains the verification requirement.

The configured Resend SMTP port 465 timed out from the worker, as did 587. Ports 2465 and 2587 were reachable. Staging now uses 2465 with TLS; the deployed provider accepted an authorized test email. The recent authentication email job completed on its second attempt after the port change (the first attempt timed out). The user confirmed receipt of the test email and SMS and progressed through account creation to phone verification. Resend documents 2465 as a supported implicit-TLS port: https://resend.com/docs/send-with-smtp.

An authorized SMS test was accepted by the configured alert sender. Its restricted credential could not read delivery status (401); recipient confirmation is still required. No broader credential access was granted.

## Outstanding release evidence

- User-confirmed reset email delivery, completed password recovery, and authenticated Safari checks.
- Google Calendar connection and appointment lifecycle using the authorized test account.
- Real call/recording and full SMS workflow checks.
- Polar sandbox billing lifecycle: current staging API configuration is not sandbox; no real charge was attempted.
- Current telemetry ingestion and replay exclusion evidence.
- Source snapshot import/reconciliation, full traffic-switch rollback rehearsal, and remaining performance/alert/provider gates in the certification runbook.

GitHub automatic deployment configuration and production resources were not changed.

## Phone verification navigation correction

The user received the verification SMS but was redirected from the code page to the number entry page. The shared query cache retained an earlier null attempt. Starting verification now invalidates that exact business query; the code page waits for the refreshed response before redirecting and displays fetch errors instead of treating them as a missing attempt. The regression reproduces cached-null state with a delayed successful response. Both phone component suites passed (15 tests), and admin TypeScript passed. Staging deployment `1edfd892-6a49-43c0-9254-19199a379536` succeeded. A fresh Safari send-code request navigated to `/onboarding/verify-phone/code` and remained there with the six-digit input visible. Code submission is left to the user.

## Repeated-send persistence and silent code entry

A delivered verification SMS was followed by a worker database update failure. The latest local attempt became `failed` with zero code-check attempts, while the prior attempt remained pending. The table uniquely constrained provider verification IDs even though repeated sends can reuse the same provider verification. Migration 0050 removes that uniqueness while retaining local attempt IDs, business/user scoping, expiry and attempt limits. A PostgreSQL regression successfully records the same provider ID on two local attempts and preserves the existing approval and cross-tenant checks. Migration was applied twice locally.

The UI now disables code entry for failed/canceled/expired states, explains the problem and offers Resend. Resend clears the previously entered code and submission guard. Phone tests passed (18 total across both suites); admin deployment `a6836ae7-68d5-4802-a7fa-a4d90eefc4da` succeeded. Migrator `96ec0b59-7c85-4eda-a9d9-6f1010d79b1e` applied migrations twice and passed database checks with forced RLS on 63 tables. The fresh live resend/code submission remains to be confirmed by the user; Safari was being used for another task during attempted validation.
