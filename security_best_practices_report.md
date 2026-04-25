# Security Best Practices Report

## Executive Summary

I reviewed the auth and email-delivery changes introduced on `feature/ope-55-resend-auth-email-delivery`, with emphasis on Convex Auth password reset, custom email-change confirmation, Resend integration, and the new settings/auth frontend surfaces.

I found 2 security issues worth addressing during the audit, and both have now been remediated on this branch:

1. An authenticated user can enumerate whether an email address already belongs to another account through the change-email flow.
2. Email-change confirmation updates a sensitive login credential without invalidating existing sessions, unlike the password-change flow.

I did not find evidence in the changed frontend code of client-side secret exposure, raw HTML injection, or dangerous DOM execution sinks.

## Medium Severity

### SEC-001: Authenticated email enumeration in the change-email flow

- Status: Fixed on this branch. The change-email action now returns the same outward success response for duplicate target emails and suppresses pending-change creation/email delivery when the target is unavailable.

- Rule ID: REACT-CONFIG-001 / application auth privacy best practice
- Severity: Medium
- Location:
  - [convex/businesses/catalog.ts:123](/convex/businesses/catalog.ts#L123)
  - [convex/businesses/catalog.ts:142](/convex/businesses/catalog.ts#L142)
  - [apps/web/src/features/settings/SettingsBusinessPage.tsx:200](/apps/web/src/features/settings/SettingsBusinessPage.tsx#L200)
  - [apps/web/public/locales/en/settings.json:153](/apps/web/public/locales/en/settings.json#L153)
- Evidence:

```ts
if (
  duplicateAccount &&
  (!input.currentAccountId || duplicateAccount._id !== input.currentAccountId)
) {
  throw new Error("An account with that email already exists.");
}
```

```ts
if (message.includes("already exists")) {
  return t("account.changeEmail.errors.alreadyExists");
}
```

```json
"alreadyExists": "An account with that email already exists."
```

- Impact: Any authenticated user can test arbitrary email addresses and learn whether they are already registered in the system, which can aid targeted phishing, credential-stuffing preparation, or user discovery across tenants.
- Fix: Return the same generic success/error response for both “email already registered” and “confirmation link sent,” while still suppressing the actual email send internally when the target is unavailable.
- Mitigation: If product UX requires a specific message, restrict visibility to trusted admin roles only and add request telemetry plus throttling for repeated change-email attempts.
- False positive notes: This is still a privacy/security issue even though the attacker must already be logged in; the question is whether any normal user should be able to probe account existence for arbitrary email addresses.

## Low Severity

### SEC-002: Email-change confirmation does not revoke existing sessions

- Status: Fixed on this branch. The confirm-email action now invalidates existing sessions after the email credential change is applied.

- Rule ID: session hardening after credential changes
- Severity: Low
- Location:
  - [convex/businesses/catalog.ts:322](/convex/businesses/catalog.ts#L322)
  - [convex/businesses/catalog.ts:363](/convex/businesses/catalog.ts#L363)
  - [convex/businesses/catalog.ts:456](/convex/businesses/catalog.ts#L456)
- Evidence:

The password-change flow explicitly revokes sessions:

```ts
const sessionId = await getAuthSessionId(authCtx);
await invalidateSessions(authCtx, {
  userId: user.userId,
  ...(sessionId ? { except: [sessionId] } : {}),
});
```

But the email-change confirmation flow updates the credential and returns without any session invalidation:

```ts
await ctx.db.patch(account._id, {
  providerAccountId: nextEmail,
  emailVerified: nextEmail,
});
await ctx.db.patch(user._id, {
  email: nextEmail,
  emailVerificationTime: Date.now(),
});
await ctx.db.delete(verificationCode._id);
```

- Impact: Existing sessions remain valid after a sensitive sign-in identifier change, so a previously stolen session continues to work even after the account’s email login is moved.
- Fix: Invalidate all other sessions after successful email confirmation, mirroring the password-change behavior and optionally keeping only the confirming session if there is one.
- Mitigation: At minimum, log and alert on email-change events and force re-authentication before additional sensitive actions.
- False positive notes: This does not make email change unauthenticated; the confirmation link is still required. The issue is reduced containment after a credential update.

## What I Checked

- Password reset uses Convex Auth `Password({ reset: ... })` rather than a custom ad hoc endpoint.
- Reset-code verification inherits Convex Auth rate limiting for failed code attempts.
- Email templates are rendered from plain strings with HTML escaping, not from raw user HTML.
- The changed frontend code does not use `dangerouslySetInnerHTML`, `innerHTML`, `eval`, or other obvious XSS sinks.
- I did not see secrets added to `VITE_*` variables or other browser-exposed config in this branch.

## Remaining Recommendation

1. Consider refactoring email-change onto a more first-class Convex Auth flow over time, since the current implementation still relies on custom auth-table handling.
