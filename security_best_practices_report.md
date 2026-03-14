# Security Best Practices Report

## Executive Summary

I reviewed all changes on the current branch against `main`, focusing on the TypeScript/React frontend and the Convex/Node backend surfaces introduced for Google Calendar OAuth, calendar sync, and related dashboard changes.

I found 3 security issues in the branch:

- 1 High severity authorization flaw that allows any active business member to manage Google calendar integrations for any staff member.
- 1 High severity data exposure issue where encrypted Google OAuth credential material is returned to the browser.
- 1 Low severity information disclosure issue where raw provider/internal callback errors are reflected back to operators.

I did not find evidence in the changed frontend surfaces of DOM XSS sinks, unsafe HTML rendering, dynamic code execution, or unsafe third-party script injection.

## Remediation Status

Status update as of March 14, 2026:

- SEC-001 has been remediated by requiring admin-equivalent business roles for Google calendar integration management and related reconciliation views.
- SEC-002 has been remediated by replacing the public `calendar_connections` response with a sanitized DTO that excludes encrypted tokens, sync cursors, and raw external account IDs.
- SEC-003 has been remediated by replacing raw OAuth/provider/internal callback error reflection with generic operator-facing messages.

## Scope And Method

- Compared `main...HEAD`
- Reviewed changed files with highest security impact:
  - `convex/integrations/calendar.ts`
  - `convex/integrations/googleCalendar.ts`
  - `convex/http.ts`
  - `convex/schema.ts`
  - `apps/web/src/features/settings/IntegrationsPage.tsx`
  - `apps/web/src/features/agent/AgentPage.tsx`
- Applied the repo’s React/frontend and Node/backend security guidance, plus provider-specific reasoning for OAuth/token handling.

## High Severity Findings

### SEC-001: Any active business member can connect, replace, or reconfigure Google calendar integrations for any staff record

- Severity: High
- Location:
  - `convex/integrations/calendar.ts:303-311`
  - `convex/integrations/calendar.ts:1598-1688`
- Impact:
  - Any authenticated user with an active membership in the business can bind their own Google account to another staff member, change the selected calendar, or reconnect an existing integration.
  - This can redirect appointment sync into a calendar they control and expose appointment metadata outside the intended operator boundary.
  - It also allows malicious or compromised low-privilege members to disrupt availability by changing which calendar busy blocks are imported.
- Evidence:

```ts
const membership = await ctx.db
  .query("business_memberships")
  .withIndex("by_user_id_and_business_id", (q) =>
    q.eq("userId", userId).eq("businessId", args.businessId),
  )
  .unique();
if (!membership || membership.status !== "active") {
  throw new Error("You do not have access to this business.");
}
```

```ts
export const connectGoogle = action({ ... })
export const listGoogleCalendars = action({ ... })
export const selectGoogleCalendar = action({ ... })
```

These operations all flow through `getCalendarConnectionAccessContext`, which only checks for an active membership and does not enforce a privileged role.

- Fix:
  - Require an elevated role such as `business_owner` or `admin` for:
    - `connectGoogle`
    - `listGoogleCalendars`
    - `selectGoogleCalendar`
    - any future disconnect/reconnect actions
  - Ideally centralize this in a dedicated helper such as `requireIntegrationAdminMembership`.
- Mitigation:
  - Audit existing connected calendar mappings for unexpected owner/staff pairings.
  - Add audit-log entries for connect/reconnect/calendar-selection changes if not already present.
- False positive notes:
  - If every active membership in this product is intentionally admin-equivalent, risk is lower, but that is not enforced in the code shown here and should be verified explicitly.

### SEC-002: The public calendar connections query returns encrypted OAuth credential material to the browser

- Severity: High
- Location:
  - `convex/integrations/calendar.ts:217-228`
  - `convex/schema.ts:359-376`
- Impact:
  - The frontend query returns full `calendar_connections` documents, including `encryptedAccessToken`, `encryptedRefreshToken`, sync cursor metadata, and external account identifiers.
  - Even though the tokens are encrypted at rest, this still exports secret-bearing credential artifacts out of the server trust boundary and into any operator browser session.
  - That increases exposure to browser compromise, XSS elsewhere in the app, malicious extensions, overbroad client logging, and future server-key disclosure.
- Evidence:

```ts
export const listCalendarConnections = query({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    await requireMembership(ctx, args.businessId);
    return await ctx.db
      .query("calendar_connections")
      .withIndex("by_business_id_and_provider", (q) =>
        q.eq("businessId", args.businessId),
      )
      .collect();
  },
});
```

```ts
calendar_connections: defineTable({
  businessId: v.id("businesses"),
  provider: v.string(),
  ownerUserId: v.id("users"),
  staffId: v.optional(v.id("staff")),
  externalAccountId: v.string(),
  externalAccountEmail: v.optional(v.string()),
  selectedCalendarId: v.optional(v.string()),
  selectedCalendarSummary: v.optional(v.string()),
  status: v.string(),
  encryptedAccessToken: v.optional(v.string()),
  encryptedRefreshToken: v.optional(v.string()),
  tokenExpiresAt: v.optional(v.string()),
  syncCursor: v.optional(v.string()),
  ...
})
```

- Fix:
  - Replace `listCalendarConnections` with an explicit sanitized projection that returns only fields needed by the UI, for example:
    - `_id`
    - `provider`
    - `staffId`
    - `externalAccountEmail`
    - `selectedCalendarId`
    - `selectedCalendarSummary`
    - `status`
    - `lastSyncAttemptAt`
    - `lastSyncedAt`
    - `lastSyncError`
  - Never expose encrypted tokens, sync cursors, or raw external account identifiers to the client unless there is a strong reviewed reason.
- Mitigation:
  - Review any existing frontend/network logs or debugging output that may already have captured `calendar_connections` payloads.
- False positive notes:
  - The tokens are encrypted before storage, so this is not plaintext-secret exposure.
  - It is still a security issue because secret material is being unnecessarily sent to untrusted clients.

## Low Severity Findings

### SEC-003: Raw provider and internal callback errors are reflected back to operators

- Severity: Low
- Location:
  - `convex/http.ts:262-299`
  - `apps/web/src/features/settings/IntegrationsPage.tsx:108-125`
- Impact:
  - Google `error_description` values and internal exception messages are copied into the redirect URL and displayed in the operator UI.
  - This can expose provider-specific or implementation-specific details such as credential/configuration errors or storage/crypto failure wording.
  - I did not find a reflected-XSS issue here because the message is rendered through React escaping, but it is still unnecessary information disclosure.
- Evidence:

```ts
message: parsedQuery.data.error_description ?? parsedQuery.data.error,
```

```ts
message:
  error instanceof Error ? error.message : "Google Calendar connection failed.",
```

```ts
setErrorMessage(
  message ? decodeURIComponent(message) : t("integrations.google.connectFailed"),
);
```

- Fix:
  - Redirect with a short internal error code or coarse status enum instead of raw exception text.
  - Log detailed provider/internal errors server-side only.
- Mitigation:
  - Keep the UI copy generic for production tenants, even if richer detail is temporarily useful during local provider bring-up.
- False positive notes:
  - This is not code injection as written because the frontend renders the message as plain text.

## Recommended Next Steps

1. Fix SEC-001 before broadening access to the Google integration surface.
2. Fix SEC-002 in the same pass by replacing `listCalendarConnections` with a sanitized DTO query.
3. Fix SEC-003 as part of OAuth hardening or before pilot rollout.
4. After fixes, rerun the Google connect flow and regression tests to ensure the UI still has all required non-sensitive fields.
