# Railway infrastructure

`railway.ts` owns all resources in the isolated parity certification project's `staging` environment. It refuses other project/environment targets. This is Railway Infrastructure as Code, using the pinned `railway/iac` SDK, not legacy per-service Config as Code.

Use Railway CLI 5.49.2 or newer and pnpm 10.30.3. Link the checkout explicitly before planning:

```sh
railway link --project af0a130e-7b02-4fc0-94ef-b0ac45a0a0a6 --environment 22237215-5837-4754-842b-9306d43588ed
railway config plan
railway config apply --yes
railway config plan --detailed-exit-code
```

Review the plan before applying. Never add `--confirm-destructive` routinely: removing a resource from this full-project definition means deletion. The generated Railway HTTPS domains remain platform-managed and are intentionally omitted by Railway's importer.

Secrets use `preserve()` and remain stored in Railway. This definition adopts existing staging infrastructure; a fresh environment requires provisioning its own isolated credentials and database roles. The migrator runs separately so the worker does not receive the database administrator credential.

The Redis image is pinned to the existing `redis:7-alpine`. The default Redis helper/importer selected version 8 during the first preview; do not accept that upgrade as part of an infrastructure import.

See https://docs.railway.com/infrastructure-as-code and its reference for the supported authoring model.

The final import plan reported zero changes. Redis uses the database product’s existing mount lifecycle; explicitly adding a service volume attachment produced perpetual drift in CLI 5.49.2. The live service read-back confirmed the existing `/data` mount and password variable. Do not convert it to a plain service: that plans a destructive resource replacement.
