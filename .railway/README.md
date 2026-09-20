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

- Enabled in staging: `admin`, `worker`, `voice-gateway`, `Postgres`, and `Redis`.
- Unset in production: every service.

Change these values only when you mean to. The setting applies on the next deploy of the service.

## Production application releases

The production `admin`, `worker`, and `voice-gateway` services use `lobbystack/lobbystack` on `main` as their source. Railway builds each affected service from its existing Dockerfile and watch patterns. `checkSuites: true` makes Railway wait for the commit’s GitHub checks before deploying it.

The `migrator` deliberately has no GitHub source. On every push to `main`, the `migrate-production` job uploads that exact checkout. The job waits for the run-once deployment to succeed. Railway blocks application deployments until the migration succeeds. Railway releases application containers after the migration.

Store a production project token in the GitHub `production` environment as `RAILWAY_PRODUCTION_TOKEN`. Restrict that environment to the `main` branch. Do not store database credentials in GitHub; the migrator reads its preserved variables from Railway.

To pause automatic application releases, disable **Auto Deploy** on all three services. A failed GitHub check or migration run leaves the previous application deployments running. For an application regression, roll each affected service back to its previous successful Railway deployment. Keep migrations backward-compatible with that version.

The definition pins Redis to `redis:7-alpine`. The Redis helper in the importer selected version 8 during the first preview; reject that upgrade in an infrastructure import.

See the [Railway Infrastructure as Code documentation](https://docs.railway.com/infrastructure-as-code) for the authoring model.

After you apply the production source rollout, the parser should report no production changes. The Redis database product owns its `/data` mount. Adding a service volume attachment caused perpetual drift in Railway CLI version 5.49.2. The live read-back confirmed the mount and password variable. Don’t convert Redis to a plain service: that plans a destructive resource replacement.

## Self-hosted template

`template.ts` owns the `lobbystack-template` project (id `c2e1d45e-9a95-4292-a304-a5456bd0cbdd`, `production` environment). Railway generates the public LobbyStack template from that project, so keep it deployable from `main`.

Plan it from a directory linked to the template project, so the repository link to the `lobbystack` project stays untouched:

```sh
railway link --project c2e1d45e-9a95-4292-a304-a5456bd0cbdd --environment production
railway config plan --file /path/to/repo/.railway/template.ts
```

The `migrate` service runs migrations as the `postgres` superuser, like Docker Compose. `0000_roles.sql` creates the application roles, and `bootstrap` gives them logins. Every other service connects as a scoped role.

Two things to know before you change it:

- Generate secrets with `openssl rand -hex 32` and set them with `railway variable set`. `ctx.randomString()` returns a hash of the environment name, so anyone can compute its output.
- Railway keeps a deleted volume for 48 hours, and an apply reattaches a pending-deletion volume that has the same name. Give a replacement volume a new name.
