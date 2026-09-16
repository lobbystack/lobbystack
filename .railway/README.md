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

The definition pins Redis to `redis:7-alpine`. The Redis helper in the importer selected version 8 during the first preview; reject that upgrade in an infrastructure import.

See the [Railway Infrastructure as Code documentation](https://docs.railway.com/infrastructure-as-code) for the authoring model.

The parser reports no changes for the current definition. The Redis database product owns its `/data` mount; adding a service volume attachment caused perpetual drift in Railway CLI version 5.49.2, and the live read-back confirmed the mount and the password variable. Don’t convert Redis to a plain service: that plans a destructive resource replacement.
