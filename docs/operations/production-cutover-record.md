# Production cutover record — 2026-09-16

Legacy Convex production was migrated to the Railway replacement (Next.js admin, worker, voice gateway, PostgreSQL, Redis, bucket). This record describes what was executed and the rollback posture. It contains no secrets, customer data, or private paths.

## Source

- Source deployment: `prod:determined-reindeer-80`.
- Final frozen export: `final2.zip`, 954 unpacked files, SHA-256 `f31f146a46dd75d0fa42730502602a07b16f167817160ceea8e32def99f3da4e`.
- Snapshot manifest SHA-256: `b2a8034c61c37e003562d35f4923396203d8064a351ee688df76bd219e1723e4`.
- Policy SHA-256: `54afecad39276cb83a18bf760a778543572618749457d11859716143bf0f6fe1`.

## Target

- Railway project `lobbystack`, environment `production` (`17162691-75e0-494a-8318-0233cbecf2e0`).
- Services: `admin`, `worker`, `voice-gateway`, `migrator`, `Postgres`, `Redis-production`, bucket `lobbystack-production`.

## Execution

1. Frozen legacy writes (Convex deployment pause; later resumed once during preparation, then re-frozen for the final import).
2. Took the final export with file storage; recorded archive size and SHA-256.
3. Wiped the production database (all `public` tables) and the production bucket.
4. Uploaded 569 storage objects and verified each by size and SHA-256.
5. Ran the production importer: **5,366 rows committed and read back** (plan hash `474894634e33d60050f1179ff188b7bb98b1cf2141a316ac0b09b998e3431aca`).
6. Ran target reconciliation before rebuild: **5,366 expected = 5,366 actual**, no field, identity, storage, or referential issues (only the derived-table checks that the rebuild then satisfies).
7. Rebuilt derived data: 107 `business_context_snapshots`, 14 `unit_economics_rollups`, 5 `affiliate_profile_stats`.

## Traffic and provider changes

- DNS (`lobbystack.com` zone):
  - `app.lobbystack.com` CNAME → Railway admin (`pdpg2pbh.up.railway.app`), proxied.
  - `voice.lobbystack.com` CNAME → Railway voice gateway (`pk6kpy7i.up.railway.app`), proxied.
  - Added Railway verification TXT records for both.
- Twilio (production numbers `+12136686869`, `+18446562290`): SMS webhook → `https://app.lobbystack.com/api/webhooks/twilio/sms`; voice webhook remains `https://voice.lobbystack.com/twilio/voice/inbound` and now resolves to Railway. Development number `+15812027906` was left untouched.
- Verification: `https://app.lobbystack.com/api/health/ready` 200, `/login` 200; `https://voice.lobbystack.com/health/ready` 200; unsigned Twilio inbound 403.

## Rollback posture

Legacy Convex production remains **paused** (frozen). Before the no-return point, rollback is: restore the two DNS CNAMEs to the legacy targets (`lobbystack-app.pages.dev`, `lepk6x3.lobbystack-voice-prod.fly.dev`), restore the Twilio SMS webhook, and resume the Convex deployment. The imported replacement database is authoritative once writes are accepted there.

## Provider endpoints switched

- Twilio (production numbers `+12136686869`, `+18446562290`): SMS webhook now `https://app.lobbystack.com/api/webhooks/twilio/sms`; voice webhook remains `https://voice.lobbystack.com/twilio/voice/inbound`, which resolves to Railway.
- Polar: the production webhook endpoint ("Convex Polar Events") was repointed to `https://app.lobbystack.com/api/webhooks/polar` (confirmed "Webhook Endpoint Updated"); its secret is unchanged.
- Google Cloud OAuth client ("AI Receptionist Dev"): added authorized redirect URI `https://app.lobbystack.com/api/calendar/google/callback` (confirmed "OAuth client saved").
- Resend: only if a delivery webhook is configured; the current API key is send-only and no production delivery webhook was found, so no change was made.

## Outstanding

- Observe the replacement for the agreed window, then retire the legacy Convex deployment and close the rollback window.
- Confirm whether any Resend/Svix delivery webhook exists for production; if so, add `https://app.lobbystack.com/api/webhooks/resend`.

