# LobbyStack for Zapier

This folder holds the LobbyStack integration for Zapier, built with the Zapier Platform CLI. It uses the public REST API v1 (`/api/v1`) and an API key.

The package stays outside the pnpm workspace. Zapier builds it with npm and runs it on Node.js 22, so it has its own `package.json` and `package-lock.json`.

## What it includes

| Type | Name | API |
| --- | --- | --- |
| Trigger | New Call | `call.completed` webhook, sample from `GET /calls` |
| Trigger | New Appointment | `appointment.booked` webhook, sample from `GET /appointments` |
| Trigger | Appointment Rescheduled | `appointment.rescheduled` webhook |
| Trigger | Appointment Cancelled | `appointment.cancelled` webhook |
| Trigger | New Message | `message.taken` webhook, sample from `GET /messages` |
| Trigger | New Contact | `contact.created` webhook, sample from `GET /contacts` |
| Action | Create Contact | `POST /contacts` |
| Action | Update Contact | `PATCH /contacts/{id}` |
| Action | Book Appointment | `POST /appointments` |
| Action | Cancel Appointment | `POST /appointments/{id}/cancel` |
| Action | Reschedule Appointment | `POST /appointments/{id}/reschedule` |
| Action | Add Knowledge | `POST /knowledge` |
| Search | Find Contact (with Find or Create Contact) | `GET /contacts?phone=&email=` |
| Search | Find Appointment | `GET /appointments?contact_id=` |
| Search | Check Availability | `GET /availability` |

Triggers are REST hooks. Turning on a Zap calls `POST /webhooks` for one event, and turning it off calls `DELETE /webhooks/{id}`. Hidden triggers fill the service, staff, contact and appointment dropdowns. Each trigger checks the Standard Webhooks signature on every delivery with the secret LobbyStack returned when the Zap subscribed. If Zapier ever stops passing the raw request, run `zapier-platform env:set 1.0.0 LOBBYSTACK_SKIP_WEBHOOK_SIGNATURE=1` to turn the check off while you ship a fix.

Users connect with an API key and an optional LobbyStack URL for self-hosted installs. The connection test calls `GET /me`, so a key with any scopes connects. The URL must use HTTPS. Plain HTTP works only for `localhost`, for local testing.

## Develop

```bash
cd integrations/zapier
npm install
npm test                    # Jest with nock; no network access
zapier-platform validate    # schema and publishing checks
zapier-platform build       # builds build/build.zip without uploading it
```

Run the tests on Node.js 22 before a push, since Zapier runs that version: `npx -p node@22 node node_modules/.bin/jest`.

## Test against a local stack

1. Start PostgreSQL and Redis, apply migrations, and run the admin and worker apps (see `AGENTS.md`).
2. From the repository root, seed a test business and API key into the local database. Use the same `ENCRYPTION_KEY` as the admin app, because the API hashes keys with it. The script refuses any database outside localhost.

   ```bash
   ENCRYPTION_KEY=your_admin_encryption_key \
   DATABASE_URL=postgres://postgres:your_local_password@127.0.0.1:15433/lobbystack \
   pnpm zapier:seed-local
   ```

3. Run the checks. Copy the key from `.env.example`; it only works against a database this script seeded.

   ```bash
   cd integrations/zapier
   LOBBYSTACK_BASE_URL=http://localhost:3000 \
   LOBBYSTACK_API_KEY=key_from_env_example \
   npm run e2e:local
   ```

   Add `ZAPIER_E2E_EVENTS_FROM_DB=1` and the same `DATABASE_URL` to also run each appointment and contact trigger on a delivery that the server's own code signed with the endpoint's secret. It checks that a valid signature passes and an altered body fails.

The script tests the connection, subscribes and unsubscribes all six triggers, loads samples, and runs every action and search. Test subscriptions point at a `.invalid` host, so the worker's delivery attempts fail at DNS and no data leaves your machine.

## Register and publish

The account owner has to accept the Zapier Developer Platform Agreement first. Nobody has run any of these commands yet.

1. Sign in: `zapier-platform login`.
2. From this folder, register the integration: `zapier-platform register "LobbyStack"`. This creates the app in Zapier and writes `.zapierapprc`. Commit that file.
3. Upload version 1.0.0: `zapier-platform push`.
4. In the Zapier developer dashboard, fill in the details the CLI can't set: logo (256×256 PNG), category, homepage and the app description. Start the description with "LobbyStack is a...".
5. Build and turn on a test Zap for each trigger, action and search, and let each one run once. Keep those Zaps and their history for review.
6. Submit the integration for review from the dashboard. After approval, promote each new version with `zapier-platform promote 1.0.0`, and move existing users with `zapier-platform migrate`.

### Publishing checklist

- [ ] Accept the Zapier Developer Platform Agreement.
- [ ] Create a LobbyStack test account for `integration-testing@zapier.com` that never expires. It needs instant booking turned on, at least one service with staff and hours, and an API key with every scope. Zapier support must be able to reset its password.
- [ ] Add a team member to the Zapier integration who has an `@lobbystack.com` email address.
- [ ] Upload a logo and set the category and homepage.
- [ ] Write the app description, starting with "LobbyStack is a...". Leave out links and sales language.
- [ ] Check that `https://docs.lobbystack.com/api/authentication` is live, since the API key help text links to it.
- [ ] Publish the API v1 docs (PR #211) before submission. Zapier requires public API documentation.
- [ ] Run a test Zap for each trigger, action and search, and keep them turned on.
- [ ] Record a short demo or write steps for booking, since it depends on business settings.
