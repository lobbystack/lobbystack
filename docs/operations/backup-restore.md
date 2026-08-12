# Backup and Restore

The authoritative recovery unit is a consistent PostgreSQL custom dump plus an object-storage mirror. Redis is deliberately excluded because it is not authoritative and is flushed after restore.

Run `REPLACEMENT_COMPOSE_PROJECT=<target-project> pnpm replacement:backup -- <destination>` to stop writers briefly, create the database and object backup, record checksums and a manifest, and restart services. The explicit project name is mandatory to prevent targeting another Compose stack. Store encrypted backups outside the deployment environment and define retention in the hosting provider.

Restore is destructive. Verify the target environment and artifact checksums, then run `REPLACEMENT_COMPOSE_PROJECT=<target-project> CONFIRM_REPLACEMENT_RESTORE=1 pnpm replacement:restore -- <backup-directory>`. On a new PostgreSQL cluster, bootstrap roles with `docker/postgres/init/roles.sh` before restoring.

After restore, run `pnpm db:check`, `VERIFY_RLS_BEHAVIOR=true pnpm db:verify-rls`, `pnpm replacement:smoke`, and storage reconciliation. Confirm pending outbox messages publish and sample database object checksums match stored objects.

Use `REPLACEMENT_COMPOSE_PROJECT=<disposable-project> CONFIRM_REPLACEMENT_RESTORE_DRILL=1 pnpm replacement:restore-drill` only against a disposable stack. The drill proves row and object integrity through deletion and full restore and retains its artifact under `.tmp/` for inspection.
