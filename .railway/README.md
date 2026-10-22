# Railway infrastructure

LobbyStack's own production and staging moved to Dokploy on 2026-10-21 ([Deploy LobbyStack on Dokploy](../docs/deployment/dokploy.md)). `railway.ts` now describes the frozen Railway project that stays as a rollback until 2026-11-04: production's admin runs in maintenance mode, and its worker and every staging service are stopped. Don't run `railway config apply` against it. A plan would redeploy the stopped services and undo the freeze. The self-hosting template below is unaffected.

`railway.ts` owns the resources for the LobbyStack project (`lobbystack`, id `af0a130e-7b02-4fc0-94ef-b0ac45a0a0a6`) in the `staging` and `production` environments. It rejects any other project or environment. It uses the pinned `railway/iac` software development kit (SDK), not legacy per-service Config as Code.

Link the target environment before you plan:

```sh
railway link --project af0a130e-7b02-4fc0-94ef-b0ac45a0a0a6 --environment your_environment_id
railway config plan
railway config apply --yes
railway config plan --detailed-exit-code
```

Read the plan before you apply it. Don’t pass `--confirm-destructive` unless you mean to delete resources: removing a resource from this full-project definition deletes it from Railway. Railway manages the generated HTTPS domains itself, so the importer omits them.

`preserve()` keeps each secret in Railway. Declare every variable that exists only in a live environment (set through the dashboard or `railway variable set`) here with `preserve()` as well; otherwise the next plan treats it as undeclared and deletes it. Declare variables that exist in one environment only with a conditional spread, `...(production ? { KEY: preserve() } : {})`, so the other environment doesn’t receive an empty variable.

The definition declares Serverless (app sleeping) per environment to match the operational policy:

- Enabled in staging: `admin`, `worker`, `Postgres`, and `Redis`.
- Unset in production: every service.

Change these values only when you mean to. The setting applies on the next deploy of the service.

## Production application releases

Production no longer releases through Railway. The `migrate-production` CI job and the `production` branch fed the Railway services, and nothing there reaches users now. See [Deploy LobbyStack on Dokploy](../docs/deployment/dokploy.md) for how releases work.

## Definition notes

The definition pins Redis to `redis:7-alpine`. The Redis helper in the importer selected version 8 during the first preview; reject that upgrade in an infrastructure import.

See the [Railway Infrastructure as Code documentation](https://docs.railway.com/infrastructure-as-code) for the authoring model.

After you apply the production source rollout, the parser should report no production changes. The Redis database product owns its `/data` mount. Adding a service volume attachment caused perpetual drift in Railway CLI version 5.49.2. The live read-back confirmed the mount and password variable. Don’t convert Redis to a plain service: that plans a destructive resource replacement.

## Self-hosted template

`template.ts` declares the published LobbyStack template at [railway.com/deploy/lobbystack](https://railway.com/deploy/lobbystack) (template id `c85ce52d-09f7-434e-a3ee-be1da2755622`). Railway’s CLI and API can’t apply changes to a template, so make each change in the dashboard under **Templates > LobbyStack**, then update `template.ts` to match. The editor stages each change until you select **Apply**.

The template's `migrate`, `admin` and `worker` services run prebuilt images from Docker Hub (`morencyr/lobbystack-migrator`, `morencyr/lobbystack-admin` and `morencyr/lobbystack-worker`), so a deploy doesn't depend on reaching the source repository. To publish a release, log in with `docker login`, then build and push the images for `origin/main`:

```bash
scripts/publish-images.sh origin/main morencyr
```

The script tags each image with the short commit and `latest`. New deploys pick up `latest`. Existing self-hosted deployments update when their owner redeploys.

Update the template when you add or remove a service or a variable in `railway.ts`. Mark a user-supplied value as optional unless every deployment needs it. Generate secrets in the template with `${{secret(64)}}`.

The admin's `APP_BASE_URL` is the template's only public URL. Every other URL variable references it, with `${{APP_BASE_URL}}` on the admin and `${{admin.APP_BASE_URL}}` or another `admin` variable on the worker, so a custom domain needs one change. Keep new URL variables on that pattern. The self-hosting overview in `mintlify/` lists the variables a deployer sets after deploying; update it in all three languages when you change them.

The `migrate` service runs migrations as the `postgres` superuser, like Docker Compose. `0000_roles.sql` creates the application roles, and `bootstrap` gives them logins. Every other service connects as a scoped role.
