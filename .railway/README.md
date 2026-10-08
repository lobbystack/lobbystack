# Railway infrastructure

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

The production `admin` and `worker` services deploy from the `production` branch of `lobbystack/lobbystack`. Railway builds each affected service from its Dockerfile and watch patterns as soon as that branch moves, without waiting on GitHub checks.

Only CI moves `production`. On every push to `main`, the `migrate-production` job starts after every other CI job passes, including the Replacement Platform checks that CI calls. It uploads that exact checkout to the `migrator`, which has no GitHub source, and waits for the run-once migration to succeed. Its last step points `production` at the same commit, which releases admin and worker. If `main` moved on in the meantime, the job stops and the newer commit's run releases both. Dependabot's jobs play no part, so a failed one can't block a release.

Store a production project token in the GitHub `production` environment as `RAILWAY_PRODUCTION_TOKEN`. Restrict that environment to the `main` branch. Do not store database credentials in GitHub; the migrator reads its preserved variables from Railway.

To pause automatic application releases, disable **Auto Deploy** on both services. A failed check or migration leaves `production` where it was, so the previous deployments keep running. For an application regression, roll each affected service back to its previous successful Railway deployment, or point `production` at an earlier commit. Keep migrations backward-compatible with that version.

The definition pins Redis to `redis:7-alpine`. The Redis helper in the importer selected version 8 during the first preview; reject that upgrade in an infrastructure import.

See the [Railway Infrastructure as Code documentation](https://docs.railway.com/infrastructure-as-code) for the authoring model.

After you apply the production source rollout, the parser should report no production changes. The Redis database product owns its `/data` mount. Adding a service volume attachment caused perpetual drift in Railway CLI version 5.49.2. The live read-back confirmed the mount and password variable. Don’t convert Redis to a plain service: that plans a destructive resource replacement.

## Self-hosted template

`template.ts` declares the published LobbyStack template at [railway.com/deploy/lobbystack](https://railway.com/deploy/lobbystack) (template id `c85ce52d-09f7-434e-a3ee-be1da2755622`). Railway’s CLI and API can’t apply changes to a template, so make each change in the dashboard under **Templates > LobbyStack**, then update `template.ts` to match. The editor stages each change until you select **Apply**.

Update the template when you add or remove a service or a variable in `railway.ts`. Mark a user-supplied value as optional unless every deployment needs it. Generate secrets in the template with `${{secret(64)}}`.

The admin's `APP_BASE_URL` is the template's only public URL. Every other URL variable references it, with `${{APP_BASE_URL}}` on the admin and `${{admin.APP_BASE_URL}}` or another `admin` variable on the worker, so a custom domain needs one change. Keep new URL variables on that pattern. The self-hosting overview in `mintlify/` lists the variables a deployer sets after deploying; update it in all three languages when you change them.

The `migrate` service runs migrations as the `postgres` superuser, like Docker Compose. `0000_roles.sql` creates the application roles, and `bootstrap` gives them logins. Every other service connects as a scoped role.
