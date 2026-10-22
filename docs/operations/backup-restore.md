# Back up and restore LobbyStack

The recovery unit combines a PostgreSQL custom dump with a snapshot of the configured storage provider. The backup script copies the shared `storage_data` volume for local storage and mirrors the MinIO bucket for S3 storage. The script excludes Redis and flushes it after restore because PostgreSQL and file storage hold the durable state.

Run `REPLACEMENT_COMPOSE_PROJECT=<approved-compose-project> pnpm replacement:backup -- <backup-directory>` to stop writers, copy the database and files, record checksums and a manifest, and restart services. You must supply the project name so the script cannot target another Compose stack. Store encrypted backups outside the deployment environment and define a retention policy with your hosting provider.

Restore is destructive. Verify the target environment and artifact checksums, then run `REPLACEMENT_COMPOSE_PROJECT=<approved-compose-project> CONFIRM_REPLACEMENT_RESTORE=1 pnpm replacement:restore -- <backup-directory>`. On a new PostgreSQL cluster, bootstrap roles with `docker/postgres/init/roles.sh` before restoring. If the restore fails after it drops the database, the script leaves admin and worker stopped so they cannot write to a partial database. Fix the error and run the restore again.

After restore, run `pnpm db:check`, `VERIFY_RLS_BEHAVIOR=true pnpm db:verify-rls`, `pnpm replacement:smoke`, and storage reconciliation. Confirm pending outbox messages publish and sample database object checksums match stored objects.

Run `REPLACEMENT_COMPOSE_PROJECT=lobbystack_restore_drill CONFIRM_REPLACEMENT_RESTORE_DRILL=1 pnpm replacement:restore-drill` against a disposable stack. The drill deletes and restores a database row and a file from the active storage provider. It retains the backup under `.tmp/` for inspection.

## Back up the Dokploy deployment

The commands above target a Docker Compose stack. Dokploy runs LobbyStack's own production and backs it up to the `dokploy-backup` R2 bucket on its own schedule:

- **Postgres:** a compressed dump of the `lobbystack` database every 6 hours. Dokploy keeps the latest 28 under `lobbystack-postgres-cxrhzf/lobbystack-postgres-production/`.
- **Dokploy:** its own database and settings every day at 04:30 UTC, the latest 14 under `.../dokploy-web-server/`. This backup holds every service's environment variables, including `ENCRYPTION_KEY`, so treat the bucket as secret.

Uploaded files live in the R2 bucket `lobbystack-production`, which has no separate copy. Redis and staging have no scheduled backup: PostgreSQL and R2 hold production's durable state, and staging holds test data only. See [Deploy LobbyStack on Dokploy](../deployment/dokploy.md#backups).

To restore production's database from a dump:

1. Set `LOBBYSTACK_MAINTENANCE_MODE=true` on the production admin and worker in Dokploy and redeploy both.
2. In Dokploy, open the production Postgres service, go to **Backups**, and restore the dump you want. Alternatively, download it from R2 and pipe it through `gunzip` into `psql` inside the Postgres container.
3. Run the migrator's `migrate` schedule. It reapplies role logins and runs `check` and `verify-rls`.
4. Set `LOBBYSTACK_MAINTENANCE_MODE=false` on the admin and worker and redeploy them.

To rebuild after losing the server, install Dokploy on a new one, restore the **Web Server** backup, then restore Postgres from its latest dump. The box's private image registry goes with the server, so build and push the images again before you deploy the apps. Redis starts empty, so jobs waiting in the old Redis are lost, and pending outbox messages publish again from PostgreSQL.

## Restore limits

This runbook recovers PostgreSQL and storage state. It does not restore routing, provider endpoints, sessions, rejected webhooks, or in-flight calls and messages.
