# Deploy LobbyStack on Dokploy

LobbyStack's production and staging run on Dokploy at `deploy.lobbystack.com`, on one OVH VPS in Virginia with 4 vCores and 8 GB of RAM. Cloudflare proxies every hostname, and the server accepts web traffic from Cloudflare only. Production moved here from Railway on 2026-10-21; the [Dokploy cutover record](../operations/dokploy-cutover-record.md) lists what changed.

## Hostnames

All four hostnames are proxied A records for `40.160.96.129`:

| Hostname | Serves |
| --- | --- |
| `app.lobbystack.com` | Production admin |
| `staging.lobbystack.com` | Staging admin |
| `deploy.lobbystack.com` | Dokploy panel and API |
| `seo.lobbystack.com` | `openseo`, stopped unless you start it |

Traefik on the server holds a Let's Encrypt certificate for each hostname, and the zone's SSL mode is Full. Let's Encrypt renews through Cloudflare with an HTTP challenge, so keep **Always Use HTTPS** off for the `lobbystack.com` zone. Turning it on stops the renewals.

Partners' hostnames reach the same server through the `receptionistportal.com` zone and Cloudflare for SaaS, and a catch-all Traefik route sends them to the production admin. [Serve partners' domains](partner-domains.md) covers that setup.

## Services

The `LobbyStack` Dokploy project has a `production` and a `staging` environment with the same five services. Dokploy adds a random suffix to each app name. Staging and production share one Docker network, so use the full app name in every connection string; a bare `postgres` could reach the other environment's database.

| Service | Production app name | Staging app name | Staging memory cap |
| --- | --- | --- | --- |
| Postgres (`pgvector/pgvector:pg16`) | `lobbystack-postgres-cxrhzf` | `lobbystack-staging-postgres-gkd1k6` | 256 MB |
| Redis (`redis:7-alpine`, append-only file, `noeviction`) | `lobbystack-redis-k1kp1n` | `lobbystack-staging-redis-ho5nys` | 128 MB |
| `migrator` | `lobbystack-migrator-algwj6` | `lobbystack-staging-migrator-xf7rgn` | 256 MB |
| `worker` | `lobbystack-worker-rbcwtj` | `lobbystack-staging-worker-fx5fgq` | 384 MB |
| `admin` | `lobbystack-admin-8oaiya` | `lobbystack-staging-admin-indrit` | 640 MB |

Production runs without memory caps. Uploaded files live in the Cloudflare R2 bucket `lobbystack-production`, whose CORS rule lets `https://app.lobbystack.com` send `PUT` requests.

The migrator container runs `sleep infinity`. Each environment's migrator has a disabled schedule named `migrate` that runs `migrate`, `bootstrap`, `check` and `verify-rls`. Run it from the schedule's **Run manually** button or the `schedule.runManually` API call, which waits for the command and returns `status: "error"` when a step fails.

## Service settings

Keep these settings when you change a service:

- **Worker drain:** production's worker has a 31-minute stop grace period and `LIVE_DRAIN_TIMEOUT_MS=1825000`, so a 30-minute call can finish during a deploy. Staging uses 2 minutes and `85000`. See [Deploy the worker during calls](../voice/runtime.md#deploy-the-worker-during-calls).
- **Update order:** Dokploy's default update config starts the new container before it stops the old one and rolls back a failed update. Leave it unset.
- **Health checks:** the worker checks `/health/live` on port 3002 and the admin checks `/api/health/ready` on port 3000, through `node -e "fetch(...)"`, because the images ship no `curl`. Docker keeps running health checks after a deploy and replaces an unhealthy task. A readiness check on the worker would restart it, and end its calls, during a short Redis or Postgres outage.
- **Durations:** Dokploy passes the stop grace period and health check timings to Docker unchanged, so enter them in nanoseconds. 31 minutes is `1860000000000`.
- **Admin variables:** set `HOSTNAME=0.0.0.0`, because Docker sets `HOSTNAME` to the container ID and the Next.js server binds to whatever it holds. Set `TRUSTED_CLIENT_IP_HEADER=cf-connecting-ip`, which is safe only while the firewall admits Cloudflare alone. Set `WORKER_INTERNAL_URL` to `http://<worker app name>:3002`.

## Images and releases

GitHub Actions builds the images on GitHub's runners and pushes them to public packages on ghcr.io, tagged with the commit's first 8 characters:

- `ghcr.io/lobbystack/lobbystack/migrator:<tag>` and `worker:<tag>`, shared by both environments
- `ghcr.io/lobbystack/lobbystack/admin:<tag>` for production and `admin:<tag>-staging` for staging

Each environment gets its own admin image because Next.js writes some settings into it at build time: the Turnstile and PostHog settings, `DEPLOYMENT_MODE`, the brand and link settings, and the `S3_*` settings, since the content security policy names the storage origin. The release reads these build arguments from the admin's environment in Dokploy, so change them there and release again.

[Release a commit to Dokploy](dokploy-release.md) covers the `release-production` and `release-staging` CI jobs and `pnpm release:dokploy`. Don't build images on the server: a Next.js build would compete with live calls for its 4 GB.

The server also runs a registry at `127.0.0.1:5000`, in the `lobbystack-registry` container, which only the server can reach. It holds the images from before CI. Production runs admin `911ca1f9-r2` and worker and migrator `55379a5f` from it until its first `release-production` run, so keep the registry as a rollback until then.

## Staging

Staging runs `main`, while production runs the commits it was last released at. Staging shares the server with production, so start it for a test and stop it afterwards. Both scripts need a Dokploy API key, which you create under **Settings > Profile > API keys**:

```bash
DOKPLOY_API_KEY=<key> scripts/staging-start.sh
```

```bash
DOKPLOY_API_KEY=<key> scripts/staging-stop.sh
```

`staging-start.sh` starts Postgres and Redis, runs the `migrate` schedule, then starts the worker and admin and waits for `https://staging.lobbystack.com/api/health/ready`. Don't release to production while staging runs: production at its 7-day peak plus staging at its peak needs about 4.25 GB.

These staging provider settings point at `staging.lobbystack.com`:

- the SMS and status webhooks of the three numbers on the staging Twilio account
- the allowed hostnames of the `lobbystack-signup` Turnstile widget
- `APP_BASE_URL`, `AUTH_TRUSTED_ORIGINS`, `SITE_URL`, `GOOGLE_REDIRECT_URI` and the Twilio callback variables

Staging's files stay in the Railway bucket `parity-certification-ec5lxi` until it gets an R2 bucket key. The R2 bucket `lobbystack-staging` already exists, with a CORS rule for `https://staging.lobbystack.com`.

## Firewall

Cloudflare proxies every hostname, and the server admits ports 80 and 443 from Cloudflare's published ranges only:

- **IPv4:** Docker publishes Traefik's ports through its own iptables rules, which bypass `ufw`. The `lobbystack-cf-firewall.service` unit runs `/usr/local/sbin/lobbystack-cf-firewall.sh` after Docker starts. The script sends new connections on ports 80 and 443 from `ens3` through the `LS-CF-ORIGIN` chain, which drops any source outside Cloudflare.
- **IPv6:** traffic reaches Traefik through `docker-proxy`, which `ufw` filters. For each Cloudflare range, IPv4 and IPv6, `ufw` allows TCP 80 and 443 and UDP 443, in rules commented `cloudflare`.
- **SSH** stays open on port 22.

When Cloudflare changes its ranges, which the [Cloudflare IP ranges API](https://api.cloudflare.com/client/v4/ips) lists, update both the script and the `ufw` rules, then run `sudo systemctl restart lobbystack-cf-firewall`.

## Backups

Dokploy backs up to the R2 bucket `dokploy-backup`:

- production Postgres every 6 hours, keeping the latest 28
- Dokploy's own database and settings every day at 04:30 UTC, keeping 14

[Back up the Dokploy deployment](../operations/backup-restore.md#back-up-the-dokploy-deployment) covers restoring them and rebuilding the server.

## Memory on the shared server

Memory decides what can run at once. Dokploy, Traefik, the registry and the operating system use about 1.47 GB. Production averaged 0.85 GB on Railway over 7 days and peaked at 1.6 GB; staging averaged 0.5 GB and peaked at 1.1 GB. `openseo` is stopped, with a 1 GB cap for when you start it: it builds its app on every start, and a 512 MB cap killed that build.

Follow these rules while everything shares the server:

- Stop staging when you finish with it, and don't release to production while it runs.
- Upgrade Dokploy, Docker or the kernel, or reboot, only in the quiet hour with no call in progress. Each can restart Traefik or every container.
- Give any new service a memory cap before you deploy it.

Upgrade the VPS once the memory alert fires or swap stays in use.

## Roll back to Railway

The Railway project stays frozen until 2026-11-04. Production's admin there runs in maintenance mode, its worker deployment is stopped, and its databases hold the data from the cutover at 03:51 UTC on 2026-10-21. To roll back:

1. Set `LOBBYSTACK_MAINTENANCE_MODE=true` on the Dokploy production admin and worker and redeploy both.
2. Copy Postgres and Redis back to Railway the way the cutover copied them over, and sync R2 back to the Railway bucket with `rclone`.
3. Set `LOBBYSTACK_MAINTENANCE_MODE=false` on Railway's admin and worker, then redeploy both with `railway service redeploy`.
4. Point `app.lobbystack.com` back to a proxied CNAME for `pdpg2pbh.up.railway.app`.
