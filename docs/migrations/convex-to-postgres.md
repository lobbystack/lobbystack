# Convex to PostgreSQL migration

The replacement stack has a development-only, curated importer. It is intentionally deployment-bound to a compiled approved development identifier and rejects production-looking source paths. It is not a production importer and does not establish complete source-to-target coverage.

## Development migration

1. Export only the approved development deployment. Never export a production deployment for this command:

   ```sh
   npx convex export --deployment dev --include-file-storage --path <development-export-directory>
   unzip -q <development-export-directory>/*.zip -d <development-export-directory>/unpacked
   ```

2. Run the rollback-only validation:

   ```sh
   LOBBYSTACK_MIGRATOR_DATABASE_URL="$DATABASE_URL" \
     pnpm convex:dev:migrate -- \
     --export=<development-export-directory>/unpacked \
     --source-deployment=<compiled-approved-development-identifier> --dry-run
   ```

3. Apply it to the local PostgreSQL/MinIO services after reviewing the counts:

   ```sh
   LOBBYSTACK_MIGRATOR_DATABASE_URL="$DATABASE_URL" \
     pnpm convex:dev:migrate -- \
     --export=<development-export-directory>/unpacked \
     --source-deployment=<compiled-approved-development-identifier>
   ```

The importer uses deterministic UUIDs derived from Convex IDs and can be rerun for its supported development mapping. It may skip rows with missing referenced legacy IDs, transforms source fields, and does not prove source equivalence. Password accounts retain the Convex Auth scrypt secret; Better Auth accepts it and rehashes it after the first successful sign-in. Existing opaque Convex sessions are not copied.

Knowledge documents are copied from their stored text. Their old provider-specific embeddings are not copied; imported chunks have a null fingerprint and `pending` status so the embedding migration job can regenerate them in the configured 1536-dimensional space.

Convex internal component tables and the `telemetry_outbox` backlog are deliberately excluded. The importer reports their counts so they cannot be mistaken for migrated customer data. File metadata and available snapshot files are copied to the configured local S3-compatible bucket. These exclusions, skipped rows, derived values, and provider-state differences make the importer curated and partial.

## Guardrails and production boundary

Do not change the compiled development identifier, source-deployment check, or production-looking-path guard to accept another development or production snapshot. A code review does not turn the development importer into a production migration path. If the approved development identifier must change, stop and create a separately reviewed development-only change with tests; do not weaken the guard or make it configurable.

There is no production importer. Production snapshot intake and rehearsal are audit-only and are documented in [production migration rehearsal](./production-rehearsal.md). Do not run this importer against a production snapshot or production target, and do not describe a development dry run as production reconciliation.
