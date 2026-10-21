# Move LobbyStack from Railway to Dokploy

This plan moves production and staging from Railway to the Dokploy instance at `deploy.lobbystack.com`. Production keeps `app.lobbystack.com`, so Twilio, Polar, OpenAI and Google keep their webhook and redirect URLs. The cutover takes one maintenance window of about 30 minutes, and phone calls fail during it. Railway stays frozen for 14 days as the rollback target.

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

Dokploy v0.30.8 runs on one host with no remote servers. Its `LobbyStack` project already holds the `openseo` Compose stack.

## Decisions

The plan assumes the recommended option for each decision:

| Decision | Recommended | Alternative | Reason |
| --- | --- | --- | --- |
| Where production runs | A dedicated server that Dokploy manages as a remote server | The Dokploy panel host | Dokploy upgrades, `openseo` and staging stay off the machine that takes calls. |
| Server size and region | 4 vCPU, 8 GB RAM, 80 GB NVMe, US East (Virginia) | A smaller server | Two workers run side by side during a drain. Virginia matches us-east4 and the iad bucket, so the worker's OpenAI requests during a call take as long as today. |
| Where images build | GitHub Actions, pushed to GitHub Container Registry (GHCR) | Dokploy builds from the `production` branch | Builds stay off the production server, CI deploys the image it tested, and a rollback redeploys an earlier tag. |
| Object storage | Cloudflare R2 | MinIO on the production server | Files survive the loss of the server, and Cloudflare already runs the DNS. |
| Staging | The panel host, stopped when idle | A server of its own | Staging adds no cost. Dokploy can't sleep services, so scripts start and stop it. |
| Railway self-hosting template | Keep | Retire | Self-hosters deploy it from Docker Hub images, and it doesn't touch the LobbyStack Railway project. |

## Phase 1: Code and CI

Ship these changes in one pull request before you touch infrastructure. None of them changes how Railway deploys:

1. **Release target.** Add a repository variable `RELEASE_TARGET` set to `railway`. The `migrate-production` job runs only when it reads `railway`, and a new `release-dokploy` job runs only when it reads `dokploy`. You flip it during the cutover.
2. **Images in GHCR.** On pushes to `main`, make `.github/workflows/runtime-images.yml` push `ghcr.io/lobbystack/lobbystack-{admin,worker,migrator}` tagged with the commit SHA. The workflow already builds them with `SERVICE_VERSION` set to the SHA. Build the admin once per environment: Next.js writes the Turnstile site key, the PostHog token and host, `DEPLOYMENT_MODE` and the brand links into the bundle. Store those values as GitHub environment variables and `POSTHOG_SOURCEMAP_API_KEY` as an environment secret.
3. **Release script.** Add `scripts/dokploy-release.ts` and call it from `release-dokploy` with `DOKPLOY_URL` and `DOKPLOY_API_KEY` from the GitHub `production` environment. Keep the two "release is current" checks from `migrate-production`. The script runs these steps and stops at the first failure:
   1. Point the `migrator` application at the new tag with `application.saveDockerProvider`, deploy it, and poll `deployment.all` until the deployment finishes.
   2. Start the `migrate` schedule with `schedule.runManually`, then poll `deployment.allByType` with type `schedule` for its result.
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

The Docker API measures health check and grace periods in nanoseconds. Confirm Dokploy's units on staging before you trust the numbers below.

Set these Swarm settings on the worker:

- **Update config:** `Order: "start-first"`, `FailureAction: "rollback"`, `Parallelism: 1`. The new worker starts before the old one gets SIGTERM, which matches Railway.
- **Stop grace period:** 31 minutes (`1860000000000` ns). Docker sends SIGKILL when it runs out.
- **Health check:** `/health/live` on port 3002. Docker keeps checking after the deploy and replaces an unhealthy task, so a readiness check would restart the worker and end its calls during a short Redis or Postgres outage. Railway checks health only while it deploys.
- **Environment:** `LIVE_DRAIN_TIMEOUT_MS=1825000`, which is 31 minutes minus the worker's 35-second margin.

Set these on the admin:

- **Update config:** `Order: "start-first"`, `FailureAction: "rollback"`.
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
| `DATABASE_URL` and each `LOBBYSTACK_*_DATABASE_URL` | admin, worker, migrator | Replace the host with the Dokploy Postgres service name. The migrator's URL also takes the new superuser password. |
| `REDIS_URL` | admin, worker | Replace the host. Give Dokploy Redis the Railway `REDIS_PASSWORD`, so the password stays the same. |
| `WORKER_INTERNAL_URL` | admin | `http://<worker service name>:3002` |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE` | admin, worker | Use the R2 values, with `S3_REGION=auto`. |
| `TRUSTED_CLIENT_IP_HEADER` | admin | `cf-connecting-ip`. Set it only once the firewall admits Cloudflare alone, or a client that reaches the server directly can claim any address. |
| `RAILWAY_DEPLOYMENT_DRAINING_SECONDS` | worker | Remove it. `LIVE_DRAIN_TIMEOUT_MS` replaces it. |
| `SERVICE_VERSION` | all | Remove it. A runtime value overrides the commit SHA in the image. |
| `HOSTNAME` | admin | `0.0.0.0` |
| `LOBBYSTACK_MAINTENANCE_MODE` | admin, worker | `true` until the cutover. |

**Keep `ENCRYPTION_KEY` unchanged.** The app can't read its encrypted columns under a different key. The same goes for `BETTER_AUTH_SECRET`, `OTP_HASH_SECRET` and the `LOBBYSTACK_*_PASSWORD` values.

## Phase 2: Production server

Prepare the server before the staging rehearsal, so you test the same Cloudflare and firewall setup:

1. Create the server in US East and add it to Dokploy under **Remote Servers**. Dokploy installs Docker and Traefik on it.
2. In your provider's firewall, admit ports 80 and 443 from Cloudflare's published IP ranges only, and SSH from your own address. Docker opens Traefik's ports through its own iptables rules, so `ufw` on the server can't block them.
3. Create a Cloudflare origin certificate for `app.lobbystack.com`, add it in Dokploy under **Certificates**, and set the `lobbystack.com` zone's SSL mode to Full (strict).
4. Cap container logs in `/etc/docker/daemon.json` with `"log-opts": {"max-size": "50m", "max-file": "3"}`, and turn on Dokploy's daily Docker cleanup for the server.
5. Turn on Dokploy monitoring with CPU and memory thresholds and a notification channel. Dokploy can't alert on disk usage, so add an 80% disk alert in your OpenTelemetry (OTLP) backend or your provider's monitoring. Add an external uptime check on `/api/health/ready` too.
6. Add GHCR under **Registries** with a token that can only read packages.
7. Create a Dokploy user for CI with access to the `LobbyStack` project alone. Store its API key as `DOKPLOY_API_KEY` in the GitHub `production` environment, next to `DOKPLOY_URL`.
8. Create the R2 bucket and its API token. Let the token edit the bucket's cross-origin (CORS) rules, or add the `PUT` rule from `docs/deployment/railway.md` yourself. Create a second bucket for Dokploy's database backups.

## Phase 3: Staging rehearsal

Build staging on the panel host and run the whole cutover against Railway staging. Time each step, and use those times to plan the production window:

1. Create a `staging` environment in the `LobbyStack` project with the five services.
2. Move Railway staging's data with steps 2 to 7 of the cutover.
3. Run the checks in `docs/validation/certification-runbook.md`, then `pnpm voice:call` against staging.
4. Start a browser test call, deploy the worker, and confirm the call carries on while the new worker takes the next call. Read the stop grace period from `docker service inspect` to confirm the units.
5. Upload a document from the dashboard to test the R2 credentials, the CORS rule and the Content Security Policy.
6. Text the staging number and resend a Polar sandbox event to test webhook signatures behind Traefik.
7. Restore a Dokploy Postgres backup into a scratch database and run `pnpm db:check` against it.
8. Release a commit to staging with `scripts/dokploy-release.ts`, and break a migration on purpose to watch the job stop.

## Phase 4: Production setup

Finish this setup in the days before the window:

1. Create the five services on the production server. Set `LOBBYSTACK_MAINTENANCE_MODE=true` on the admin and worker: the worker then starts without consuming jobs, and the admin answers 503.
2. Schedule daily Postgres backups to the R2 backup bucket and keep 14.
3. Copy the Railway bucket to R2 with `rclone sync`, and repeat the sync each day until the window.
4. Add a proxied temporary hostname such as `app-next.lobbystack.com` to the admin, so you can check `/api/health/ready` before the DNS switch.
5. Check whether any provider, such as your SMTP relay, allows only Railway's outbound addresses.

## Phase 5: Cutover window

Choose the hour with the fewest calls. For the provider side, follow section 3 of the [provider event ingress plan](provider-ingress-plan.md): Polar and Twilio retry webhooks that get a 503, and phone calls fail until step 8. Run these steps:

1. Set `RELEASE_TARGET` to `dokploy`, and turn off **Auto Deploy** on Railway's admin and worker, so no release lands during the window.
2. Wait until no call is in progress, then set `LOBBYSTACK_MAINTENANCE_MODE=true` on Railway's admin and worker. Wait for the old worker to exit, which it does when its last call ends.
3. Inside Railway's Postgres service, run `pg_dumpall --roles-only` and `pg_dump --format=custom`. The roles file keeps the passwords the services use. Copy both files to the production server and compare SHA-256 checksums.
4. Save Redis with `redis-cli --rdb` and copy `dump.rdb` the same way. Redis holds delayed BullMQ jobs, such as retries, that the app can't rebuild from Postgres.
5. Run `rclone sync` to R2 one last time.
6. Restore everything on the production server:
   1. Load the roles file with `psql`, and ignore the error for the superuser, which already exists.
   2. Restore the database with `pg_restore --exit-on-error`.
   3. Stop Redis, put `dump.rdb` in its volume, and start it with `--appendonly no` so it loads the snapshot. Compare `DBSIZE` with Railway's, run `CONFIG SET appendonly yes`, and restore the normal command.
   4. Run the `migrate` schedule. It should apply nothing and pass `check` and `verify-rls`.
7. Set `LOBBYSTACK_MAINTENANCE_MODE=false` on the Dokploy admin and worker, and check `/api/health/ready` on the temporary hostname.
8. In Cloudflare, point `app.lobbystack.com` at the production server and keep it proxied. Cloudflare applies the change within seconds.
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

- Watch memory and disk, check each daily backup, and deploy the worker once during a production test call.
- On day 14, put a final Railway `pg_dump` in the R2 backup bucket. Then delete Railway's production services, volumes and bucket, the `app.lobbystack.com` custom domain on Railway, and the `RAILWAY_PRODUCTION_TOKEN` secret. Remove the `migrate-production` job and the `RELEASE_TARGET` variable.
- Delete Railway staging and `.railway/railway.ts`, and remove both from `scripts/check-drift.ts`. Trim `docs/deployment/railway.md` to the self-hosting template. Keep `.railway/template.ts`, `scripts/publish-images.sh` and the `railway` package, which the template needs.
- To get config as code back, declare the Dokploy settings in a `.dokploy/` file and add a drift check that compares it with the API, in place of `railway config plan`.

## Open questions

Answer these during the staging rehearsal:

- Does Dokploy's `stopGracePeriodSwarm` take nanoseconds? `docker service inspect` shows the value Docker received.
- Does a manual schedule run record a failed deployment when its command exits non-zero? If it doesn't, give CI an SSH key whose `authorized_keys` entry forces one `docker run` of the migrator image, so the exit code reaches CI.
- Does `railway ssh` pass binary output through intact? Compare checksums. If it doesn't, pipe the dumps through `base64`. Don't send them over a Railway TCP proxy: the plain Postgres and Redis images don't encrypt connections.
- Which address does `x-real-ip` hold on Railway today? Behind Cloudflare it may hold a Cloudflare edge address, which would mean today's per-client rate limits lump visitors together.
