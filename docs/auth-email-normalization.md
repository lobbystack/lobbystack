# Normalize authentication email addresses

LobbyStack stores the original email address for display and a normalized value for identity checks. The database normalizes every address with `lower(btrim(email))` before writes.

## Enforce the database invariant

Migration `packages/db/migrations/0006_auth.sql` installs the normalization trigger. The `users_normalized_email_unique` index prevents two accounts from claiming the same normalized address.

Better Auth uses the authentication database role. Application queries use `normalized_email` when they resolve an account or invitation.

Accounts imported from the previous platform keep their legacy password hash until their first successful sign-in. Better Auth then rehashes the password in the current format.

## Verify normalization

Run the authentication and row-level security checks:

```bash
pnpm replacement:auth
VERIFY_RLS_BEHAVIOR=true pnpm db:verify-rls
```
