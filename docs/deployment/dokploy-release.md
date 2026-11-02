# Release a commit to Dokploy

GitHub Actions ships each merge to `main` to the `production` environment of the `LobbyStack` project on Dokploy (`https://deploy.lobbystack.com`). Staging and manual releases run from the **Release to Dokploy** workflow, or from your machine with `pnpm release:dokploy` for staging, a branch or a manual release. They replace the old `railway up` releases. Railway stays stopped as the rollback target until 2026-11-04, so a release sent there reaches no users.

[The Dokploy setup](dokploy.md) covers the host, the services and their settings.

## What a release does

`scripts/dokploy-release.ts` runs these steps and stops at the first failure:

1. Checks that the commit is the tip of GitHub `main`, for a production release.
2. Reads the environment's migrator, worker and admin applications from Dokploy.
3. Builds the images ghcr.io doesn't hold yet, for `linux/amd64`, and pushes them. The admin's build arguments come from the admin's environment in Dokploy.
4. Checks `main` again, since someone may have merged during the build.
5. Points the migrator at the new tag, deploys it, and waits for the old migrator container to stop. Dokploy runs a schedule in the first running container it finds, so the old one has to go first.
6. Runs the `migrate` schedule, which runs `migrate`, `bootstrap`, `check` and `verify-rls`, and prints the end of its log.
7. Deploys the worker and waits until Docker Swarm reports the new worker running, which it does once the health check passes. The old worker keeps its calls and exits when the last one ends, after 31 minutes at most in production.
8. Deploys the admin and waits until the new admin runs and the old one has stopped.
9. Requests the environment's `/api/health/ready` and expects a 200.
10. Purges Cloudflare's cache for the hosts in the admin's `MARKETING_HOSTS`, so visitors get the new marketing pages. Without `CLOUDFLARE_CACHE_PURGE_TOKEN`, or when Cloudflare refuses, it warns and the release still succeeds. [Serve lobbystack.com from the admin app](marketing-site.md#cache-pages-at-cloudflares-edge) explains the cache.

The script talks to Dokploy through its API alone, so it needs no SSH access to the host. Each Dokploy deployment gets the title `Release <tag>` and the commit subject, so the deployment list shows what shipped.

Don't build images on the host. A Next.js build would take CPU and memory from live calls.

## Images

The images live on ghcr.io, tagged with the commit's first 8 characters:

| Image | Used by |
| --- | --- |
| `ghcr.io/lobbystack/lobbystack/migrator:<tag>` | Production and staging |
| `ghcr.io/lobbystack/lobbystack/worker:<tag>` | Production and staging |
| `ghcr.io/lobbystack/lobbystack/admin:<tag>` | Production |
| `ghcr.io/lobbystack/lobbystack/admin:<tag>-staging` | Staging |

Each environment gets its own admin because Next.js writes some settings into the bundle at build time. The three packages are public, so Dokploy pulls without credentials. The images hold no secrets: the admin bundle carries only values a browser sees anyway, and the PostHog source map key stays in the build stage.

GitHub creates each package as private the first time a release pushes it. Make it public once, under the package's **Package settings → Change visibility**, before Dokploy needs to pull it. To keep the packages private instead, give each Dokploy application a GitHub token with the `read:packages` scope in its registry settings.

## Release from GitHub Actions

Two workflows run the release:

| Where | Runs | Does |
| --- | --- | --- |
| `release-production` job in `.github/workflows/ci.yml` | After every other CI job and the post-merge certification pass on a `main` push, when `DOKPLOY_AUTO_RELEASE` is `true` | Releases the commit to production |
| **Release to Dokploy** workflow (`.github/workflows/dokploy-release.yml`) | When you run it from the **Actions** tab | Releases a commit, or the tip of `main`, to staging or production. **Build only** stops after the push. |

One release at a time runs per environment. When a newer commit reaches `main` before an older run's release starts, the older release skips itself and the newer run ships both.

The release reads these settings in the `lobbystack/lobbystack` repository:

- `DOKPLOY_API_KEY`: a secret in the `production` and `staging` environments, under **Settings → Environments**. Create the key in Dokploy under **Settings → Profile**.
- `CLOUDFLARE_CACHE_PURGE_TOKEN`: an optional secret in the same environments. It's a Cloudflare API token with the **Zone → Cache Purge** permission for the `lobbystack.com` zone, created under **My Profile → API Tokens** in Cloudflare.
- `DOKPLOY_AUTO_RELEASE`: a repository variable, under **Settings → Secrets and variables → Actions → Variables**. Set it to `true` to release each merge to production. Remove it, or set anything else, to pause automatic releases.

To store the key without it landing in your shell history, copy it from Dokploy and run:

```bash
pbpaste | gh secret set DOKPLOY_API_KEY --env production -R lobbystack/lobbystack
```

The workflows push images with the run's own `GITHUB_TOKEN`, so they need no registry secret.

## Release from your machine

Run the release yourself to try a branch on staging, or when CI can't run. Set up your machine once:

1. Start Docker Desktop.
2. Log in to ghcr.io with a GitHub personal access token (classic) that has the `write:packages` scope:
   ```bash
   docker login ghcr.io -u your_github_username
   ```
3. Export a Dokploy API key in the shell you release from:
   ```bash
   export DOKPLOY_API_KEY=your_dokploy_api_key
   ```

Then release the tip of GitHub `main` to production:

```bash
pnpm release:dokploy
```

The script works from any checkout, because it builds in a temporary worktree and never touches your branch. When CI has already pushed the commit's images, it skips the build. A build on an Apple silicon Mac emulates `linux/amd64`, so it takes far longer than on GitHub's runners.

To ship a commit on `main` that isn't its tip, pass it with `--allow-older`:

```bash
pnpm release:dokploy 911ca1f9 --allow-older
```

The script refuses commits that aren't on GitHub `main`.

## Release to staging

Staging takes any commit, merged or not, so you can try a branch before you merge it. Start staging, release, then stop it when you finish:

```bash
scripts/staging-start.sh
pnpm release:dokploy --env staging HEAD
scripts/staging-stop.sh
```

Without a commit, `--env staging` releases the tip of GitHub `main`. To release from CI instead, run **Release to Dokploy** with the `staging` environment. The release checks `https://staging.lobbystack.com/api/health/ready` at the end.

## Change a build-time admin variable

Next.js writes some admin variables into the bundle when it builds, and `next.config.ts` bakes the storage origin into the Content Security Policy. The release takes these build arguments from the admin's environment in Dokploy, and refuses to build if any of the required ones are missing:

- `DEPLOYMENT_MODE`
- `NEXT_PUBLIC_POSTHOG_HOST` and `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN`
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
- `POSTHOG_SOURCEMAP_API_KEY`
- `STORAGE_PROVIDER`, `S3_BUCKET`, `S3_ENDPOINT` and `S3_REGION`

It also passes any other `ARG` in `Dockerfile.admin` that the admin's environment sets, such as `S3_FORCE_PATH_STYLE` or the `NEXT_PUBLIC_*` links.

After you change one of these in Dokploy, the running admin keeps the old value until you rebuild it. The registry already holds the commit's tag, so release from your machine with a new tag:

```bash
pnpm release:dokploy --tag 911ca1f9-r2
```

## Roll back to the previous release

The release never rolls back on its own, and migrations only move forward. The release prints each service's image before it changes anything, so you have the previous tags. To put the previous code back:

1. In Dokploy, open the admin's **General** tab and set the Docker image to the previous tag, such as `ghcr.io/lobbystack/lobbystack/admin:0e7bf9a2`. Save, then deploy.
2. Do the same for the worker.

The registry keeps every tag, so a rollback needs no build. Roll back only to code that works with the current database schema. Older releases came from GitLab's registry, up to `registry.gitlab.com/lobbystack-group/lobbystack/admin:dba0cc22`, and before that from the host's own registry, such as `127.0.0.1:5000/lobbystack-admin:911ca1f9-r2`. Both stay available for a rollback until they're removed.

## When a release fails

The release prints the image each Dokploy application points at, then the error.

| Where it stopped | State | What to do |
| --- | --- | --- |
| Staging or commit check | Nothing changed. | Stop staging, then release the tip of `main` or pass `--allow-older`. |
| Build or push | Nothing changed in Dokploy. | Fix the build and run the release again. A push error from your machine means you need `docker login ghcr.io`. |
| Migrator deploy | The migrator may run the new image. The worker and admin haven't changed. | Read the printed deployment log. |
| `migrate` schedule | The migrator runs the new image. The worker and admin haven't changed. | Read the printed log, fix the migration in a new commit, and release that. The full log is on the migrator's **Schedules** tab. |
| Worker or admin deploy | Docker Swarm rolls a service back when its new container fails, but Dokploy still lists the new tag. | Read the service's logs, then release a fix or roll back so Dokploy matches what runs. |
| Health check | The new admin runs but `/api/health/ready` doesn't answer 200. | The response names the failing check: `database`, `redis` or `storage`. |

To retry after a failure, retry the CI job or run the same command again. The release skips the build, deploys each service again and reruns the migrations, which apply nothing new. The worker drains its calls as in any release.

## Old images

ghcr.io keeps every version until you delete it on the package's page. On the host, Dokploy's daily Docker cleanup removes the images no container uses.
