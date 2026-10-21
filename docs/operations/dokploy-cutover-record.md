# Dokploy cutover record, 2026-10-21

Production moved from Railway to Dokploy on the OVH VPS behind `deploy.lobbystack.com`, and staging followed the same day. This record lists what moved, how, what changed from the [migration plan](dokploy-migration-plan.md), and what still points at Railway. Times are UTC.

## Source and target

- **Source:** Railway project `lobbystack`, environment `production`, region us-east4. Admin ran commit `911ca1f9` (the Polar portal hotfix); worker and migrator ran `55379a5f`. Both reached Railway through `railway up` from GitLab commits, not through the GitHub `production` branch the plan assumed.
- **Target:** Dokploy project `LobbyStack`, environment `production`, on the existing VPS-1 (2 vCores, 4 GB RAM). The services and their settings are in [Deploy LobbyStack on Dokploy](../deployment/dokploy.md).
- **Images:** built on a developer Mac for `linux/amd64` from those exact commits and pushed to a registry on the server. The production admin image carries R2 storage settings.

## Rehearsal

Before the window, a copy of production went into the Dokploy services with Railway still serving:

- the database dump (50 MB) restored in 9 seconds with matching SHA-256 checksums, holding 431 calls
- the `migrate` schedule found no new migrations, gave 6 roles their logins and verified RLS on 77 tables
- the Redis snapshot loaded 6,204 keys and kept them through a restart with the append-only file on
- `rclone` copied all 750 files (957 MiB) from the Railway bucket to R2 in 54 seconds

## Window

| Time | Step |
| --- | --- |
| 03:30 | No call in progress for 11 hours. Set `LOBBYSTACK_MAINTENANCE_MODE=true` on Railway's admin and worker. Railway saved the variables but didn't redeploy. |
| 03:41 | Redeployed both by hand. The admin went into maintenance and started answering webhooks with 503. |
| 03:48 | The worker's redeploy failed: in maintenance it reports "not ready", and Railway's `/health/ready` check rejects that, so the old worker kept running. |
| 03:50 | Stopped the worker with `railway down`. Only the maintenance-mode admin remained connected to Redis. |
| 03:51 | Took the final Postgres dump, roles and Redis snapshot, then synced the bucket to R2 once more. |
| 03:52 | Restored on Dokploy, loaded Redis, ran `migrate`, and started the worker and admin with maintenance off and R2 storage. |
| 03:54 | Pointed `app.lobbystack.com` at the server through Cloudflare. Webhooks reached Dokploy right away. |

Webhooks and new calls failed from 03:41 to 03:54. Polar and Twilio retry webhooks that get a 503.

## Verification

- `/api/health/ready` returned `ok` for the database, R2 storage and Redis through Cloudflare, and the login page loaded.
- The worker published 14 outbox messages in its first 15 minutes, none dead-lettered, with consumers on all five queues.
- A production test call at 03:58 completed and landed in the Dokploy database. Railway's database recorded no calls after the cutover.
- Backups ran once by hand: a 49 MB Postgres dump and a Dokploy settings archive landed in the R2 bucket `dokploy-backup`.

## Differences from the plan

- **One server.** The plan's second server became the existing VPS. A 1 GB memory cap on `openseo` and caps on every staging service keep production's headroom; see [Memory on the shared server](../deployment/dokploy.md#memory-on-the-shared-server).
- **Release path after the cutover.** Phase 1 didn't ship first, so the cutover images went to a registry on the server by hand. GitLab CI took over releases with `80d48885` later on 2026-10-21: staging runs its images, and production moves to them with its first `release-production` run. See [Release a commit to Dokploy](../deployment/dokploy-release.md).
- **No GitHub access.** `lobbystack/lobbystack` on GitHub no longer resolves from the developer machine, and production releases came from GitLab.
- **Railway worker stopped instead of paused.** Railway can't run the worker in maintenance mode, because the mode fails its health check.
- **Worker Google redirect fixed.** Production's worker had `GOOGLE_REDIRECT_URI` pointing at the staging admin. It now uses `https://app.lobbystack.com/api/calendar/google/callback`.

## After the window

- Turned on the Cloudflare proxy for `deploy.lobbystack.com` and `seo.lobbystack.com`, and limited ports 80 and 443 on the server to Cloudflare's ranges. Requests straight to `40.160.96.129` now time out.
- Switched the admin's `TRUSTED_CLIENT_IP_HEADER` from `x-real-ip` to `cf-connecting-ip`. Behind Cloudflare, `x-real-ip` held a Cloudflare edge address, so per-client rate limits grouped visitors by edge.
- Created the Dokploy `staging` environment from Railway staging's data. Railway staging's database had migrations up to `0117`, ahead of production's `0108`, so staging runs `main` (`f537edf6`). Staging's Twilio numbers and Turnstile widget now point at `staging.lobbystack.com`.

## Still on Railway

The Railway project stays frozen as a rollback until 2026-11-04. Its production admin runs in maintenance mode, its worker and staging deployments are stopped, and its databases and buckets still hold the data from 03:51. Staging's files also stay in the Railway bucket `parity-certification-ec5lxi` until staging gets an R2 key. [Roll back to Railway](../deployment/dokploy.md#roll-back-to-railway) lists the steps.
