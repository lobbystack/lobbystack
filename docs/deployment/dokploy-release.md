# Release a commit to Dokploy

`pnpm release:dokploy` ships a commit from your machine to the `production` or `staging` environment of the `LobbyStack` project on Dokploy (`https://deploy.lobbystack.com`). It replaces the old `railway up` releases. Railway stays frozen as the rollback target until 2026-11-04, so a release sent there reaches no users.

[The Dokploy setup](dokploy.md) covers the host, the services and their settings.

## How images reach the host

The release updates an environment's migrator, worker and admin applications. All three pull from a private registry on the host, the `lobbystack-registry` container. It listens on `127.0.0.1:5000` only, so the script sends images over SSH. The `migrate` schedule on the migrator runs `migrate`, `bootstrap`, `check` and `verify-rls`.

Each environment gets its own admin image, because Next.js bakes some settings into the build. Production's admin is `lobbystack-admin:<tag>`, and staging's is `lobbystack-admin:<tag>-staging`. Both environments share the `lobbystack-worker:<tag>` and `lobbystack-migrator:<tag>` images, so a production release after a staging release of the same commit builds only the admin.

Don't build images on the host. A Next.js build would take CPU and memory from live calls.

## Before your first release

Set up your machine once:

1. Start Docker Desktop and install zstd with `brew install zstd`.
2. Check that your SSH key opens `ubuntu@40.160.96.129` and that `sudo docker` works there without a password:
   ```bash
   ssh ubuntu@40.160.96.129 sudo -n docker info --format '{{.Swarm.LocalNodeState}}'
   ```
3. In Dokploy, open **Settings → Profile**, generate an API key, and keep it in your password manager. Export it in the shell you release from:
   ```bash
   export DOKPLOY_API_KEY=your_dokploy_api_key
   ```

`DOKPLOY_URL` and `DOKPLOY_SSH` override the panel address and the SSH target.

## Release the tip of main

Merge to `main` on GitLab (`gitlab.com/lobbystack-group/lobbystack`), then run:

```bash
pnpm release:dokploy
```

With no argument, the script releases the tip of GitLab `main` to production. It works from any checkout, because it builds in a temporary worktree and never touches your branch. It runs these steps and stops at the first failure:

1. Checks that staging is stopped. Production and staging together don't fit in the host's 4 GB, so stop staging with `scripts/staging-stop.sh` first.
2. Fetches GitLab `main` and checks that the commit is its tip.
3. Reads the three Dokploy applications. The admin's environment supplies the admin's build arguments.
4. Builds the images the registry doesn't hold yet, for `linux/amd64`. The tag is the commit's first 8 characters.
5. Streams those images over SSH into the host's Docker and pushes them to the registry.
6. Checks `main` and staging again, since someone may have merged or started staging during the build.
7. Points the migrator at the new tag, deploys it, and waits for the old migrator container to stop. Dokploy runs a schedule in the first running container it finds, so the old one has to go first.
8. Runs the `migrate` schedule and prints the end of its log.
9. Deploys the worker and waits until the new worker passes its health check. The old worker keeps its calls and exits when the last one ends, after 31 minutes at most.
10. Deploys the admin and waits until the new admin is healthy and the old one has stopped.
11. Requests `https://app.lobbystack.com/api/health/ready` and expects a 200.
12. Removes the environment's older images from the host's Docker. It keeps the new images, the ones they replaced, and the ones the other environment runs.

Each Dokploy deployment gets the title `Release <tag>` and the commit subject, so the deployment list shows what shipped.

### Release an earlier commit

To ship a commit on `main` that isn't its tip, pass it with `--allow-older`:

```bash
pnpm release:dokploy 911ca1f9 --allow-older
```

The script refuses commits that aren't on GitLab `main`.

### Change a build-time admin variable

Next.js writes some admin variables into the bundle when it builds, and `next.config.ts` bakes the storage origin into the Content Security Policy. The release takes these build arguments from the admin's environment in Dokploy, and refuses to build if any of the required ones are missing:

- `DEPLOYMENT_MODE`
- `NEXT_PUBLIC_POSTHOG_HOST` and `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN`
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
- `POSTHOG_SOURCEMAP_API_KEY`
- `STORAGE_PROVIDER`, `S3_BUCKET`, `S3_ENDPOINT` and `S3_REGION`

It also passes any other `ARG` in `Dockerfile.admin` that the admin's environment sets, such as `S3_FORCE_PATH_STYLE` or the `NEXT_PUBLIC_*` links.

After you change one of these in Dokploy, the running admin keeps the old value until you rebuild it. The registry already holds the commit's tag, so give the rebuild a new one:

```bash
pnpm release:dokploy --tag 911ca1f9-r2
```

## Release to staging

Staging takes any commit in your checkout, merged or not, so you can try a branch before you merge it. Start staging, release, then stop it when you finish:

```bash
scripts/staging-start.sh
pnpm release:dokploy --env staging HEAD
scripts/staging-stop.sh
```

Without a commit, `--env staging` releases the tip of GitLab `main`. The release runs the same steps as in production, skipping the `main` and staging checks, and checks `https://staging.lobbystack.com/api/health/ready` at the end. The staging admin's build arguments come from the staging admin's environment in Dokploy.

## Roll back to the previous release

The release never rolls back on its own, and migrations only move forward. The script prints each service's image before it changes anything, so you have the previous tags. To put the previous code back:

1. In Dokploy, open the admin's **General** tab and set the Docker image to the previous tag, such as `127.0.0.1:5000/lobbystack-admin:911ca1f9-r2`. Save, then deploy.
2. Do the same for the worker.

The host keeps the previous release's images, and the registry keeps every tag, so a rollback needs no build. Roll back only to code that works with the current database schema.

## When a release fails

The script prints the image each Dokploy application points at, then the error.

| Where it stopped | State | What to do |
| --- | --- | --- |
| Staging or commit check | Nothing changed. | Stop staging, then release the tip of `main` or pass `--allow-older`. |
| Build or upload | Nothing changed in production. | Fix the build and run the script again. |
| Migrator deploy | The migrator may run the new image. The worker and admin haven't changed. | Read the deployment log in Dokploy. |
| `migrate` schedule | The migrator runs the new image. The worker and admin haven't changed. | Read the printed log, fix the migration in a new commit, and release that. The full log is on the migrator's **Schedules** tab. |
| Worker or admin deploy | Docker Swarm rolls a service back when its new container fails, but Dokploy still lists the new tag. | Read the service's logs, then release a fix or roll back so Dokploy matches what runs. |
| Health check | The new admin runs but `/api/health/ready` doesn't answer 200. | The response names the failing check: `database`, `redis` or `storage`. |

To retry after a failure in production, run the same command again. The script skips the build, deploys each service again and reruns the migrations, which apply nothing new. The worker drains its calls as in any release.

## Keep the registry's disk use in check

The registry keeps every tag, and it runs with deletion turned off. It held 232 MB after the first four tags, and each release adds the layers that changed. Check its size with:

```bash
ssh ubuntu@40.160.96.129 sudo du -sh /var/lib/docker/volumes/lobbystack-registry-data/_data
```

To free space, restart the registry with `REGISTRY_STORAGE_DELETE_ENABLED=true`, delete old manifests, and run `registry garbage-collect` while no release runs.
