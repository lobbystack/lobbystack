# Auth Email Normalization Audit

Password auth now normalizes submitted email addresses with `trim().toLowerCase()`
before creating new password accounts, looking up login credentials, and starting
or verifying password reset flows.

Follow-up production audit:

1. Query `authAccounts` where `provider === "password"` and
   `providerAccountId !== providerAccountId.toLowerCase()`.
2. For each mixed-case `providerAccountId`, check whether a lowercase
   `providerAccountId` already exists for the password provider.
3. If no lowercase collision exists, migrate the mixed-case
   `providerAccountId` to lowercase and also lowercase the linked `users.email`
   value when present.
4. If a lowercase collision exists, do not auto-migrate. Review both accounts
   manually and decide which user record should own the normalized email.

The runtime fallback keeps sign-in and password reset working for exact
legacy mixed-case account IDs while the audit is pending. New password account
writes use lowercase email identifiers going forward.
