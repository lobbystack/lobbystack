# Normalize authentication email addresses

LobbyStack stores the original email address for display and a normalized value for identity checks. The database normalizes every address with `lower(btrim(email))` before writes.

## Enforce the database invariant

Migration `packages/db/migrations/0006_auth.sql` installs the normalization trigger. The `users_normalized_email_unique` index prevents two accounts from claiming the same normalized address.

Better Auth uses the authentication database role. Application queries use `normalized_email` when they resolve an account or invitation.

## Import a Convex account

The bounded Convex importer trims and lowercases each imported email address. It preserves the legacy password hash for the first successful sign-in, then Better Auth rehashes the password in the current format.

Before a production import:

1. Run the importer with `--dry-run` against a disposable restored database.
2. Review duplicate or invalid email findings.
3. Resolve collisions in the source snapshot.
4. Run the import and reconciliation checks.
5. Confirm that a migrated account can sign in with mixed-case input.

Do not merge colliding accounts automatically. An operator must determine which account owns the address and retain the required business memberships.

## Verify normalization

Run the authentication and row-level security checks:

```bash
pnpm replacement:auth
VERIFY_RLS_BEHAVIOR=true pnpm db:verify-rls
```
