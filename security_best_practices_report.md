# OPE-15 Security Audit

## Executive Summary

Reviewed `feature/ope-15-calendar-reconciliation` against `main`, focusing on the new calendar reconciliation backend in [convex/integrations/calendar.ts](/Users/raphael/Coding/ai-receptionist/convex/integrations/calendar.ts), the booking-state change in [convex/appointments/booking.ts](/Users/raphael/Coding/ai-receptionist/convex/appointments/booking.ts), and the schema additions in [convex/schema.ts](/Users/raphael/Coding/ai-receptionist/convex/schema.ts).

I did **not** identify any new critical, high, or medium security vulnerabilities in this branch. The new public read APIs are membership-scoped, the reconciliation logic remains internal-only, and the diff does not introduce new prompt/tool surfaces that would create prompt-injection risk.

I also ran `pnpm audit --prod --dev`, which reported **no known vulnerabilities**.

## Scope Reviewed

- [convex/integrations/calendar.ts](/Users/raphael/Coding/ai-receptionist/convex/integrations/calendar.ts)
- [convex/appointments/booking.ts](/Users/raphael/Coding/ai-receptionist/convex/appointments/booking.ts)
- [convex/schema.ts](/Users/raphael/Coding/ai-receptionist/convex/schema.ts)
- [packages/testing/src/calendarReconciliation.test.ts](/Users/raphael/Coding/ai-receptionist/packages/testing/src/calendarReconciliation.test.ts)

Audit focus:

- authorization boundaries on the new member-scoped read APIs
- integrity of the new reconciliation and retry state machine
- operator-visible recovery record creation and dedupe
- exposure of sensitive data in the new query/issue surfaces
- prompt-injection risk introduced by the branch

## Critical Findings

None.

## High Findings

None.

## Medium Findings

None.

## Low Findings

None.

## Informational Notes

### INF-1: New reconciliation APIs expose raw sync error strings to members

The branch now persists `calendarLastSyncError` and returns it through the member-scoped reconciliation surfaces in [convex/integrations/calendar.ts:425](/Users/raphael/Coding/ai-receptionist/convex/integrations/calendar.ts#L425), [convex/integrations/calendar.ts:933](/Users/raphael/Coding/ai-receptionist/convex/integrations/calendar.ts#L933), and [convex/integrations/calendar.ts:986](/Users/raphael/Coding/ai-receptionist/convex/integrations/calendar.ts#L986).

This is acceptable in the current mocked-provider implementation because the stored errors are controlled internal strings. When real Google/Microsoft provider adapters are added, these error strings should be normalized to user-safe categories before being exposed to members or copied into `inbox_items`, to avoid leaking provider/internal detail. I am **not** counting this as a branch vulnerability today.

## Prompt Injection Review

I did not find any branch-introduced prompt-injection risk.

Why:

- This diff does not modify prompt construction, RAG context assembly, or agent tool registration.
- The new reconciliation logic is implemented entirely in backend queries, mutations, and internal actions, not in model-driven tool flows.
- No new attacker-controlled text is inserted into hidden prompts or used to select privileged actions.

The only new text surfaces are:

- operator-facing `inbox_items.body` strings built from appointment/contact metadata in [convex/integrations/calendar.ts:118](/Users/raphael/Coding/ai-receptionist/convex/integrations/calendar.ts#L118)
- member-scoped query responses returning reconciliation metadata in [convex/integrations/calendar.ts:892](/Users/raphael/Coding/ai-receptionist/convex/integrations/calendar.ts#L892) and [convex/integrations/calendar.ts:946](/Users/raphael/Coding/ai-receptionist/convex/integrations/calendar.ts#L946)

Those are application-data surfaces, not prompt surfaces.

## Validation Performed

- `git diff main...HEAD`
- `git diff --stat main...HEAD`
- targeted manual review of the changed backend files listed above
- `pnpm audit --prod --dev`

## Branch Conclusion

This branch’s calendar reconciliation changes are in good shape from a security perspective. They add internal-only reconciliation behavior plus member-scoped read APIs without introducing new authorization bypasses, secret-handling regressions, or prompt-injection exposure.
