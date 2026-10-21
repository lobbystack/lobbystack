# Release a commit to Dokploy

GitLab CI ships each merge to `main` to the `production` environment of the `LobbyStack` project on Dokploy (`https://deploy.lobbystack.com`). Staging releases wait for a click. The same steps run from your machine with `pnpm release:dokploy`, for staging, a branch or a manual release. They replace the old `railway up` releases. Railway stays stopped as the rollback target until 2026-11-04, so a release sent there reaches no users.

[The Dokploy setup](dokploy.md) covers the host, the services and their settings.

## What a release does

`scripts/dokploy-release.ts` runs these steps and stops at the first failure:

1. Checks that staging is stopped, for a production release. Production and staging together don't fit in the host's 4 GB.
2. Checks that the commit is the tip of GitLab `main`, for a production release.
3. Reads the environment's migrator, worker and admin applications from Dokploy.
4. Builds the images GitLab's container registry doesn't hold yet, for `linux/amd64`, and pushes them. The admin's build arguments come from the admin's environment in Dokploy.
5. Checks `main` and staging again, since someone may have merged or started staging during the build.
6. Points the migrator at the new tag, deploys it, and waits for the old migrator container to stop. Dokploy runs a schedule in the first running container it finds, so the old one has to go first.
7. Runs the `migrate` schedule, which runs `migrate`, `bootstrap`, `check` and `verify-rls`, and prints the end of its log.
8. Deploys the worker and waits until Docker Swarm reports the new worker running, which it does once the health check passes. The old worker keeps its calls and exits when the last one ends, after 31 minutes at most in production.
9. Deploys the admin and waits until the new admin runs and the old one has stopped.
10. Requests the environment's `/api/health/ready` and expects a 200.

The script talks to Dokploy through its API alone, so it needs no SSH access to the host. Each Dokploy deployment gets the title `Release <tag>` and the commit subject, so the deployment list shows what shipped.

Don't build images on the host. A Next.js build would take CPU and memory from live calls.

## Images

The images live in this project's container registry on GitLab, tagged with the commit's first 8 characters:

| Image | Used by |
| --- | --- |
| `registry.gitlab.com/lobbystack-group/lobbystack/migrator:<tag>` | Production and staging |
| `registry.gitlab.com/lobbystack-group/lobbystack/worker:<tag>` | Production and staging |
| `registry.gitlab.com/lobbystack-group/lobbystack/admin:<tag>` | Production |
| `registry.gitlab.com/lobbystack-group/lobbystack/admin:<tag>-staging` | Staging |

Each environment gets its own admin because Next.js writes some settings into the bundle at build time. The project is public, so its registry is too, and Dokploy pulls without credentials. The images hold no secrets: the admin bundle carries only values a browser sees anyway, and the PostHog source map key stays in the build stage.

To make the registry private, set the project's container registry to **Only Project Members** and create a deploy token named `gitlab-deploy-token` with the `read_registry` scope. GitLab hands that token to CI jobs, and the release saves it on each Dokploy application, so Dokploy can keep pulling.

## Release from GitLab CI

The jobs live at the end of `.gitlab-ci.yml` and run on pipelines for `main`:

| Job | Runs | Does |
| --- | --- | --- |
| `images` | After `checks`, `zapier` and `database` pass | Builds and pushes the migrator, worker and production admin images |
| `release-production` | On its own when `DOKPLOY_AUTO_RELEASE` is `true`, otherwise when you click it | Releases the commit to production |
| `release-staging` | When you click it | Builds the staging admin and releases the commit to staging |

The `production` and `staging` resource groups let one release at a time run per environment. When a newer commit reaches `main` before an older pipeline's release starts, the older release skips itself and the newer pipeline ships both.

The jobs need two project variables, under **Settings → CI/CD → Variables**:

- `DOKPLOY_API_KEY`: a Dokploy API key. Mark it protected and masked, so only `main` pipelines can read it. Create the key in Dokploy under **Settings → Profile**.
- `DOKPLOY_AUTO_RELEASE`: set it to `true` to release each merge to production without a click. Remove it, or set anything else, to pause automatic releases.

To store the key without it landing in your shell history, copy it from Dokploy and run:

```bash
pbpaste | glab variable set DOKPLOY_API_KEY --masked --protected -R lobbystack-group/lobbystack
```

A production release fails when staging runs. Stop staging with `scripts/staging-stop.sh` and retry the job.

## Release from your machine

Run the release yourself to try a branch on staging, or when CI can't run. Set up your machine once:

1. Start Docker Desktop.
2. Log in to GitLab's registry with a personal access token that has the `write_registry` scope:
   ```bash
   docker login registry.gitlab.com -u your_gitlab_username
   ```
3. Export a Dokploy API key in the shell you release from:
   ```bash
   export DOKPLOY_API_KEY=your_dokploy_api_key
   ```

Then release the tip of GitLab `main` to production:

```bash
pnpm release:dokploy
```

The script works from any checkout, because it builds in a temporary worktree and never touches your branch. When CI has already pushed the commit's images, it skips the build. A build on an Apple silicon Mac emulates `linux/amd64`, so it takes far longer than on GitLab's runners.

To ship a commit on `main` that isn't its tip, pass it with `--allow-older`:

```bash
pnpm release:dokploy 911ca1f9 --allow-older
```

The script refuses commits that aren't on GitLab `main`.

## Release to staging

Staging takes any commit, merged or not, so you can try a branch before you merge it. Start staging, release, then stop it when you finish:

```bash
scripts/staging-start.sh
pnpm release:dokploy --env staging HEAD
scripts/staging-stop.sh
```

Without a commit, `--env staging` releases the tip of GitLab `main`. To release a `main` commit from CI instead, click `release-staging` in its pipeline. The release checks `https://staging.lobbystack.com/api/health/ready` at the end.

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

1. In Dokploy, open the admin's **General** tab and set the Docker image to the previous tag, such as `registry.gitlab.com/lobbystack-group/lobbystack/admin:0e7bf9a2`. Save, then deploy.
2. Do the same for the worker.

The registry keeps every tag, so a rollback needs no build. Roll back only to code that works with the current database schema. Releases from before CI ran from the host's own registry, such as `127.0.0.1:5000/lobbystack-admin:911ca1f9-r2`, and stay there until that registry is removed.

## When a release fails

The release prints the image each Dokploy application points at, then the error.

| Where it stopped | State | What to do |
| --- | --- | --- |
| Staging or commit check | Nothing changed. | Stop staging, then release the tip of `main` or pass `--allow-older`. |
| Build or push | Nothing changed in Dokploy. | Fix the build and run the release again. A push error from your machine means you need `docker login registry.gitlab.com`. |
| Migrator deploy | The migrator may run the new image. The worker and admin haven't changed. | Read the printed deployment log. |
| `migrate` schedule | The migrator runs the new image. The worker and admin haven't changed. | Read the printed log, fix the migration in a new commit, and release that. The full log is on the migrator's **Schedules** tab. |
| Worker or admin deploy | Docker Swarm rolls a service back when its new container fails, but Dokploy still lists the new tag. | Read the service's logs, then release a fix or roll back so Dokploy matches what runs. |
| Health check | The new admin runs but `/api/health/ready` doesn't answer 200. | The response names the failing check: `database`, `redis` or `storage`. |

To retry after a failure, retry the CI job or run the same command again. The release skips the build, deploys each service again and reruns the migrations, which apply nothing new. The worker drains its calls as in any release.

## Old images

GitLab's registry keeps every tag until you add a cleanup policy under **Settings → Packages and registries**. On the host, Dokploy's daily Docker cleanup removes the images no container uses.
