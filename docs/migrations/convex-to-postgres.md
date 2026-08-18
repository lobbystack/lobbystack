# Convex to PostgreSQL migration

The replacement stack can import a Convex snapshot without connecting to a Convex production deployment. The importer is intentionally deployment-bound: it accepts only `dev:valiant-ibis-521` and rejects production-looking source paths.

## Development migration

1. Export the development deployment, never `--deployment prod`:

   ```sh
   npx convex export --deployment dev --include-file-storage --path /private/tmp/lobbystack-convex-dev-export
   unzip -q /private/tmp/lobbystack-convex-dev-export/*.zip -d /private/tmp/lobbystack-convex-dev-export/unpacked
   ```

2. Run the rollback-only validation:

   ```sh
   LOBBYSTACK_MIGRATOR_DATABASE_URL="$DATABASE_URL" \
     pnpm convex:dev:migrate -- \
       --export=/private/tmp/lobbystack-convex-dev-export/unpacked \
       --source-deployment=dev:valiant-ibis-521 --dry-run
   ```

3. Apply it to the local PostgreSQL/MinIO services after reviewing the counts:

   ```sh
   LOBBYSTACK_MIGRATOR_DATABASE_URL="$DATABASE_URL" \
     pnpm convex:dev:migrate -- \
       --export=/private/tmp/lobbystack-convex-dev-export/unpacked \
       --source-deployment=dev:valiant-ibis-521
   ```

The importer uses deterministic UUIDs derived from Convex IDs and is safe to rerun. Password accounts retain the Convex Auth scrypt secret; Better Auth accepts it and rehashes it after the first successful sign-in. Existing opaque Convex sessions are not copied.

Knowledge documents are copied from their stored text. Their old provider-specific embeddings are not copied; imported chunks have a null fingerprint and `pending` status so the embedding migration job can regenerate them in the configured 1536-dimensional space.

Convex internal component tables and the `telemetry_outbox` backlog are deliberately excluded. The importer reports their counts so they cannot be mistaken for migrated customer data. File metadata and available snapshot files are copied to the configured local S3-compatible bucket.

## Production rollout later

Use the same sequence against a separately approved production snapshot and a separately isolated replacement database. Change the expected deployment identifier in a reviewed change, take a database backup, run `--dry-run`, reconcile counts and relationships, then apply during a write freeze. Never point the importer at a production database while testing development imports, and never pass a production deployment identifier to the development command.
