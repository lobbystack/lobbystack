# Back up and restore LobbyStack

The recovery unit combines a PostgreSQL custom dump with a snapshot of the configured storage provider. The backup script copies the shared `storage_data` volume for local storage and mirrors the MinIO bucket for S3 storage. The script excludes Redis and flushes it after restore because PostgreSQL and file storage hold the durable state.

Run `REPLACEMENT_COMPOSE_PROJECT=lobbystack_production pnpm replacement:backup -- /secure/path/backup_directory` to stop writers, copy the database and files, record checksums and a manifest, and restart services. You must supply the project name so the script cannot target another Compose stack. Store encrypted backups outside the deployment environment and define a retention policy with your hosting provider.

Restore is destructive. Verify the target environment and artifact checksums, then run `REPLACEMENT_COMPOSE_PROJECT=lobbystack_production CONFIRM_REPLACEMENT_RESTORE=1 pnpm replacement:restore -- /secure/path/backup_directory`. On a new PostgreSQL cluster, bootstrap roles with `docker/postgres/init/roles.sh` before restoring.

After restore, run `pnpm db:check`, `VERIFY_RLS_BEHAVIOR=true pnpm db:verify-rls`, `pnpm replacement:smoke`, and storage reconciliation. Confirm pending outbox messages publish and sample database object checksums match stored objects.

Run `REPLACEMENT_COMPOSE_PROJECT=lobbystack_restore_drill CONFIRM_REPLACEMENT_RESTORE_DRILL=1 pnpm replacement:restore-drill` against a disposable stack. The drill deletes and restores a database row and a file from the active storage provider. It retains the backup under `.tmp/` for inspection.
