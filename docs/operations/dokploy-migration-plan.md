# Move LobbyStack from Railway to Dokploy

**Status:** done on 2026-10-21. The [Dokploy cutover record](dokploy-cutover-record.md) lists what happened and how it differed from this plan, and [Deploy LobbyStack on Dokploy](../deployment/dokploy.md) describes the running setup. Phase 1, the release path, is done: releases ran on GitLab CI from 2026-10-21 and moved back to GitHub Actions on 2026-10-22, when the GitHub account was recovered. Moving staging's files to R2 is still open.

This plan moves production and staging from Railway to the Dokploy host at `deploy.lobbystack.com`, which also keeps running the Dokploy panel and `openseo`. Production keeps `app.lobbystack.com`, so Twilio, Polar, OpenAI and Google keep their webhook and redirect URLs. The cutover takes one maintenance window of about 30 minutes, and phone calls fail during it. Railway stays frozen for 14 days as the rollback target.

## Starting point

Railway's 7-day metrics on 2026-10-20 show this production stack:

| Resource | On Railway | Size |
| --- | --- | --- |
| `admin` | Dockerfile build from the `production` branch | 306 MB memory |
| `worker` | Dockerfile build from the `production` branch, 31-minute drain | 289 MB memory |
| `migrator` | Run-once service that CI deploys with `railway up` | 182 MB memory |
| `Postgres` | `pgvector/pgvector:pg16` on a volume | 406 MB of 4.88 GB |
| `Redis-production` | `redis:7-alpine`, append-only file (AOF) on, `noeviction` | 238 MB of 4.88 GB |
| `lobbystack-production` bucket | Railway object storage in iad | 1.0 GB, 750 objects |

Every service averages under 0.01 vCPU, and all of them run in us-east4. Cloudflare proxies `app.lobbystack.com` to the Railway admin.

Dokploy v0.30.8 runs on an OVH VPS in Virginia (`vps-569f1528.vps.ovh.us`, `40.160.96.129`) with no remote servers. Its `LobbyStack` project already holds the `openseo` Compose stack. DNS sends `deploy.lobbystack.com` and `seo.lobbystack.com` straight to the VPS, without the Cloudflare proxy, and both use Let's Encrypt certificates.

## Decisions

| Decision | Choice | Reason |
| --- | --- | --- |
| Where production runs | The existing Dokploy host, next to the panel, `openseo` and staging | One box to pay for and run. Phase 2 lists the guards that keep the other tenants from interrupting calls. |
| Host size | Keep the current VPS-1 (2 vCores, 4 GB RAM, 40 GB disk) | Production plus the panel and `openseo` need about 2.3 GB, and about 2.8 GB while a deploy runs two admins and two workers. Calls use little CPU because OpenAI does the speech work, and CI does the builds. Staging adds about 0.8 GB, so run it only when no production deploy is under way. The VPS sits in Virginia, close to us-east4 and the iad bucket, so the worker's OpenAI requests during a call take as long as today. |
| Where images build | GitHub Actions, pushed to GitHub Container Registry (GHCR) | A Next.js build on the box would compete with live calls for CPU and memory. CI also deploys the image it tested, and a rollback redeploys an earlier tag. |
| Object storage | Cloudflare R2 | Files survive the loss of the box, Cloudflare already runs the DNS, and 1 GB fits in R2's free tier. |
| Staging | The same host, stopped when idle | Dokploy can't sleep services, so scripts start and stop it. |
| Railway self-hosting template | Keep | Self-hosters deploy it from Docker Hub images, and it doesn't touch the LobbyStack Railway project. |

## Phase 1: Code and CI

While the GitHub remote was unreachable, releases ran on GitLab CI and pushed to GitLab's container registry. They now run on GitHub Actions and push to GHCR. [The Dokploy release guide](../deployment/dokploy-release.md) describes them.

Ship these changes in one pull request before you touch infrastructure. None of them changes how Railway deploys:

1. **Release target.** Add a repository variable `RELEASE_TARGET` set to `railway`. The `migrate-production` job runs only when it reads `railway`, and a new `release-dokploy` job runs only when it reads `dokploy`. You flip it during the cutover.
2. **Images in GHCR.** On pushes to `main`, make `.github/workflows/runtime-images.yml` push `ghcr.io/lobbystack/lobbystack-{admin,worker,migrator}` tagged with the commit SHA. The workflow already builds them with `SERVICE_VERSION` set to the SHA. Build the admin once per environment: Next.js writes the Turnstile site key, the PostHog token and host, `DEPLOYMENT_MODE` and the brand links into the bundle. Store those values as GitHub environment variables and `POSTHOG_SOURCEMAP_API_KEY` as an environment secret.
3. **Release script.** Add `scripts/dokploy-release.ts` and call it from `release-dokploy` with `DOKPLOY_URL` and `DOKPLOY_API_KEY` from the GitHub `production` environment. Keep the two "release is current" checks from `migrate-production`. The script runs these steps and stops at the first failure:
   1. Point the `migrator` application at the new tag with `application.saveDockerProvider`, deploy it, and poll `deployment.all` until the deployment finishes.
   2. Run the `migrate` schedule with `schedule.runManually`. The call returns once the command ends, with `status: "error"` when it exits non-zero, so the script needs no polling here.
   3. Deploy `worker`, then `admin`, the same way as step 1.
   4. Request `https://app.lobbystack.com/api/health/ready` and fail on any status other than 200.
4. **Environment label.** `apps/admin/next.config.ts` and `apps/admin/src/lib/error-reporting.ts` read `RAILWAY_ENVIRONMENT_NAME` and fall back to `NODE_ENV`, so Dokploy staging would report itself as `production`. Read a new `DEPLOYMENT_ENVIRONMENT` first, pass it as an admin build argument, and keep the Railway fallback for template users. The release version needs no change: without the Railway variables, `release-version.ts` and `packages/telemetry` use the `SERVICE_VERSION` baked into the image.
5. **Staging scripts.** Rewrite `scripts/staging-start.sh` and `scripts/staging-stop.sh` to call Dokploy's `start` and `stop` endpoints for each service, in today's order.
6. **Docs.** Add `docs/deployment/dokploy.md` with the settings in the next two sections. Point `docs/platform.md`, the drain section of `docs/voice/runtime.md` and `docs/operations/backup-restore.md` at it.

## Service settings

Create these five services in each Dokploy environment:

| Service | Dokploy type | Image | Settings |
| --- | --- | --- | --- |
| `postgres` | PostgreSQL database | `pgvector/pgvector:pg16` | Use Railway's `POSTGRES_DB` and `POSTGRES_USER` names. Stay on version 16 for the move. |
| `redis` | Redis database | `redis:7-alpine` | Set the command to `redis-server --appendonly yes --maxmemory-policy noeviction --requirepass <password>`. BullMQ needs `noeviction`. |
| `migrator` | Application, Docker source | `lobbystack-migrator` | Command `sleep infinity`, no domain. Add a disabled schedule named `migrate` that runs the production `preDeploy` command from `.railway/railway.ts`. |
| `worker` | Application, Docker source | `lobbystack-worker` | No domain. Apply the worker settings below. |
| `admin` | Application, Docker source | `lobbystack-admin` | Domain `app.lobbystack.com` on the container's `PORT`, with the Cloudflare origin certificate. Apply the admin settings below. |

Dokploy hands the stop grace period and health check durations to Docker unchanged, so enter them in nanoseconds. Its form labels the field "Stop Grace Period (nanoseconds)".

Set these Swarm settings on the worker:

- **Update config:** keep Dokploy's default, `Order: "start-first"` with `FailureAction: "rollback"` and `Parallelism: 1`. The new worker starts before the old one gets SIGTERM, which matches Railway.
- **Stop grace period:** 31 minutes (`1860000000000` ns). Docker sends SIGKILL when it runs out.
- **Health check:** `/health/live` on port 3002. Docker keeps checking after the deploy and replaces an unhealthy task, so a readiness check would restart the worker and end its calls during a short Redis or Postgres outage. Railway checks health only while it deploys.
- **Environment:** `LIVE_DRAIN_TIMEOUT_MS=1825000`, which is 31 minutes minus the worker's 35-second margin.

Set these on the admin:

- **Update config:** keep Dokploy's start-first default.
- **Health check:** `/api/health/ready`, a 10-second interval, a 60-second start period and 6 retries.
- **Environment:** `HOSTNAME=0.0.0.0`. Docker sets `HOSTNAME` to the container ID, and the Next.js standalone server binds to whatever `HOSTNAME` holds.

Neither image ships `curl`, so run each check with Node. The admin's check:

```json
["CMD", "node", "-e", "fetch('http://127.0.0.1:' + process.env.PORT + '/api/health/ready').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
```

## Environment variables

Export each Railway service's variables with `railway variables --json --service <name> --environment <environment>` to a file outside the repository. Import them into the matching Dokploy service, then delete the file. Copy every value unchanged except these:

| Variable | Services | Change |
| --- | --- | --- |
| `DATABASE_URL` and each `LOBBYSTACK_*_DATABASE_URL` | admin, worker, migrator | Replace the host with the Postgres app name. The migrator's URL also takes the new superuser password. |
| `REDIS_URL` | admin, worker | Replace the host with the Redis app name. Give Dokploy Redis the Railway `REDIS_PASSWORD`, so the password stays the same. |
| `WORKER_INTERNAL_URL` | admin | `http://<worker app name>:3002` |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE` | admin, worker | Use the R2 values, with `S3_REGION=auto`. |
| `TRUSTED_CLIENT_IP_HEADER` | admin | `cf-connecting-ip`. Set it only once the firewall admits Cloudflare alone, or a client that reaches the box directly can claim any address. |
| `RAILWAY_DEPLOYMENT_DRAINING_SECONDS` | worker | Remove it. `LIVE_DRAIN_TIMEOUT_MS` replaces it. |
| `SERVICE_VERSION` | all | Remove it. A runtime value overrides the commit SHA in the image. |
| `HOSTNAME` | admin | `0.0.0.0` |
| `LOBBYSTACK_MAINTENANCE_MODE` | admin, worker | `true` until the cutover. |

**Keep `ENCRYPTION_KEY` unchanged.** The app can't read its encrypted columns under a different key. The same goes for `BETTER_AUTH_SECRET`, `OTP_HASH_SECRET` and the `LOBBYSTACK_*_PASSWORD` values.

Use the app name Dokploy shows for each service, which ends in a random suffix. Staging and production share one Docker network on this box, so a bare name such as `postgres` could reach the other environment's database.

## Phase 2: Prepare the Dokploy host

Production will share the box with the panel, `openseo` and staging. Set up these guards before the staging rehearsal, so the rehearsal runs on the final setup:

1. Add a 4 GB swap file. Without swap, a memory spike makes the kernel kill a process, and it could pick the worker in the middle of a call. With swap, the box slows down instead. Upgrade the VPS in the OVH control panel once the memory alert fires or swap stays in use.
2. Turn on the Cloudflare proxy for `deploy.lobbystack.com` and `seo.lobbystack.com`. Then, in OVH's network firewall, admit ports 80 and 443 from Cloudflare's published IP ranges only, and SSH from your own address. Docker opens Traefik's ports through its own iptables rules, so `ufw` on the box can't block them.
3. Create a Cloudflare origin certificate for `lobbystack.com` and `*.lobbystack.com`, and add it in Dokploy under **Certificates**. Set the certificate type to None on the `app`, `seo` and `deploy` domains so Traefik serves the origin certificate, and Let's Encrypt renewals stop depending on reaching the box through Cloudflare. Set the zone's SSL mode to Full (strict) after you check that every other proxied hostname has a valid certificate at its origin.
4. Give `openseo` and every staging service a memory limit, sized from its current use, so none of them can starve production. Leave production without limits.
5. Cap container logs in `/etc/docker/daemon.json` with `"log-opts": {"max-size": "50m", "max-file": "3"}`, and turn on Dokploy's daily Docker cleanup.
6. Turn on Dokploy monitoring with CPU and memory thresholds and a notification channel. Dokploy can't alert on disk usage, so add an 80% disk alert in your OpenTelemetry (OTLP) backend or OVH's monitoring. Add an external uptime check on `/api/health/ready` too.
7. Add GHCR under **Registries** with a token that can only read packages.
8. Create a Dokploy user for CI with access to the `LobbyStack` project alone. Store its API key as `DOKPLOY_API_KEY` in the GitHub `production` environment, next to `DOKPLOY_URL`.
9. Create the R2 bucket and its API token. Let the token edit the bucket's cross-origin (CORS) rules, or add the `PUT` rule from `docs/deployment/railway.md` yourself. Create a second bucket for backups, add it in Dokploy as a backup destination, and back up Dokploy itself to it each day (the **Web Server** backup). That backup holds every service's settings and variables, which you need to rebuild the box.

## Phase 3: Staging rehearsal

Build staging on the same host and run the whole cutover against Railway staging. Time each step, and use those times to plan the production window:

1. Create a `staging` environment in the `LobbyStack` project with the five services.
2. Start Railway staging with `scripts/staging-start.sh`, because `railway ssh` can't reach a stopped service. Then move its data with steps 2 to 7 of the cutover.
3. Run the checks in `docs/validation/certification-runbook.md`, then `pnpm voice:call` against staging.
4. Start a browser test call, deploy the worker, and confirm the call carries on while the new worker takes the next call.
5. Upload a document from the dashboard to test the R2 credentials, the CORS rule and the Content Security Policy.
6. Text the staging number and resend a Polar sandbox event to test webhook signatures behind Traefik.
7. Restore a Dokploy Postgres backup into a scratch database and run `pnpm db:check` against it.
8. Release a commit to staging with `scripts/dokploy-release.ts`, and break a migration on purpose to watch the job stop.

## Phase 4: Production setup

Finish this setup in the days before the window:

1. Create the five services in the `production` environment of the `LobbyStack` project. Set `LOBBYSTACK_MAINTENANCE_MODE=true` on the admin and worker: the worker then starts without consuming jobs, and the admin answers 503.
2. Back up production Postgres to the R2 backup bucket every 6 hours and keep 28 copies. With one box, these backups are the only copy of the database off the machine.
3. Copy the Railway bucket to R2 with `rclone sync`, and repeat the sync each day until the window.
4. Add a proxied temporary hostname such as `app-next.lobbystack.com` to the admin, so you can check `/api/health/ready` before the DNS switch.
5. Check whether any provider, such as your SMTP relay, allows only Railway's outbound addresses.

## Phase 5: Cutover window

Choose the hour with the fewest calls. For the provider side, follow section 3 of the [provider event ingress plan](provider-ingress-plan.md): Polar and Twilio retry webhooks that get a 503, and phone calls fail until step 8. Run these steps:

1. Set `RELEASE_TARGET` to `dokploy`, and turn off **Auto Deploy** on Railway's admin and worker, so no release lands during the window.
2. Wait until no call is in progress, then set `LOBBYSTACK_MAINTENANCE_MODE=true` on Railway's admin and worker. Wait for the old worker to exit, which it does when its last call ends.
3. Stream the Postgres roles and database to your machine over `railway ssh`. The roles file keeps the passwords the services use. Don't use a Railway TCP proxy instead: the plain Postgres image doesn't encrypt connections.
   ```bash
   railway ssh --service Postgres --environment production -- sh -c 'pg_dumpall --roles-only -U "$POSTGRES_USER"' > roles.sql
   railway ssh --service Postgres --environment production -- sh -c 'pg_dump --format=custom -U "$POSTGRES_USER" "$POSTGRES_DB"' > lobbystack.dump
   ```
4. Save Redis the same way. Redis holds delayed BullMQ jobs, such as retries, that the app can't rebuild from Postgres.
   ```bash
   railway ssh --service Redis-production --environment production -- sh -c 'redis-cli -a "$REDIS_PASSWORD" --no-auth-warning --rdb /tmp/dump.rdb > /dev/null && cat /tmp/dump.rdb && rm /tmp/dump.rdb' > dump.rdb
   ```
   Copy the three files to the Dokploy host with `scp` and compare SHA-256 checksums.
5. Run `rclone sync` to R2 one last time.
6. Restore everything on the Dokploy host:
   1. Load the roles file with `psql`, and ignore the error for the superuser, which already exists.
   2. Restore the database with `pg_restore --exit-on-error`.
   3. Stop Redis, put `dump.rdb` in its volume, and start it with `--appendonly no` so it loads the snapshot. Compare `DBSIZE` with Railway's, run `CONFIG SET appendonly yes`, and restore the normal command.
   4. Run the `migrate` schedule. It should apply nothing and pass `check` and `verify-rls`.
7. Set `LOBBYSTACK_MAINTENANCE_MODE=false` on the Dokploy admin and worker, and check `/api/health/ready` on the temporary hostname.
8. In Cloudflare, point `app.lobbystack.com` at `40.160.96.129` and keep it proxied. Cloudflare applies the change within seconds.
9. Test production by hand:
   - Sign in, open the dashboard and upload a document.
   - Chat through the website widget and make a browser test call.
   - Call and text a production number.
   - Resend a recent event from Polar's webhook log.
   - Sync a Google Calendar.
   - Confirm the outbox drains with no dead-lettered messages.

Leave Railway's worker in maintenance mode from now on. It would run the same schedules against its stale copy of the data and send duplicate reminders.

## Rollback

Before step 7, roll back by setting `LOBBYSTACK_MAINTENANCE_MODE=false` on Railway and pointing DNS back at it. From step 7 on, Dokploy holds writes that Railway lacks. Put Dokploy in maintenance mode, run steps 3 to 6 in the other direction, then switch DNS back. The data is small, so the reverse move fits in a window of the same length.

## Phase 6: After the cutover

Close out the move over the next 14 days:

- Watch memory and disk, check that the backups land in R2, and deploy the worker once during a production test call.
- Rebuild the box once on a throwaway VPS: install Dokploy, restore the Web Server backup, then restore Postgres from R2. If the OVH VPS dies, you recover the same way.
- On day 14, put a final Railway `pg_dump` in the R2 backup bucket. Then delete Railway's production services, volumes and bucket, the `app.lobbystack.com` custom domain on Railway, and the `RAILWAY_PRODUCTION_TOKEN` secret. Remove the `migrate-production` job and the `RELEASE_TARGET` variable.
- Delete Railway staging and `.railway/railway.ts`, and remove both from `scripts/check-drift.ts`. Trim `docs/deployment/railway.md` to the self-hosting template. Keep `.railway/template.ts`, `scripts/publish-images.sh` and the `railway` package, which the template needs.
- To get config as code back, declare the Dokploy settings in a `.dokploy/` file and add a drift check that compares it with the API, in place of `railway config plan`.

## Rules for the shared box

Follow these rules for as long as production shares the box:

- Upgrade Dokploy, Docker or the kernel, and reboot the VPS, only in the quiet hour with no call in progress. Each of these can restart Traefik or every container on the box.
- Stop staging when you finish with it, and don't release to production while it runs. Both together push a 4 GB box close to its limit.
- Give any new service on the box a memory limit before you deploy it.

## Checked facts

These answers come from Dokploy's v0.30.8 source and a test against Railway production on 2026-10-20:

- Dokploy copies `stopGracePeriodSwarm` and the health check fields into the Docker service spec unchanged (`packages/server/src/utils/builders/index.ts`), so they take nanoseconds.
- `schedule.runManually` waits for the command and marks the run `error` when it exits non-zero (`packages/server/src/utils/schedules/utils.ts`).
- `railway ssh` copied the 9.57 MB `postgres` binary out of the production Postgres container in 2 seconds with a matching SHA-256 checksum. The containers ship `pg_dump` 16.15 and `redis-cli` 7.4.11.

## Open question

Which address does `x-real-ip` hold on Railway today? Behind Cloudflare it may hold a Cloudflare edge address, which would mean today's per-client rate limits lump visitors together.
