# Security Review: `feature/ope-47-bilingual-sms-runtime` vs `main`

## Executive Summary

I reviewed the bilingual SMS runtime branch against `main`, focusing on branch-introduced risks in runtime locale persistence, prompt construction, tool usage, reminder localization, and the new operator control for default customer language.

I did not identify any new critical, high, medium, or low-severity security vulnerabilities in this diff. I also did not identify a new prompt-injection weakness introduced by the French runtime work. The branch keeps untrusted customer SMS and retrieved knowledge clearly separated from hidden instructions, constrains locale switching to the latest customer message plus server-side state, and keeps all privileged writes behind existing internal actions or membership-gated mutations.

I also ran `pnpm audit --prod --dev`, which reported **no known vulnerabilities**.

## Scope Reviewed

No critical findings in this branch diff.

Audit focus:

No high-severity findings in this branch diff.

## Critical Findings

No medium-severity findings in this branch diff.

## High Findings

No low-severity findings in this branch diff.

## Prompt Injection and Tool Abuse Review

I did not find any branch-introduced prompt-injection risk.

- Whether the new bilingual prompt logic lets customer text override hidden instructions
- Whether retrieved knowledge can steer locale switching or privileged tool calls
- Whether the new locale-aware SMS flow can be induced to book, cancel, or reschedule solely from model output
- Whether French-language prompt-extraction attempts are blocked as well as English ones

- This diff does not modify prompt construction, RAG context assembly, or agent tool registration.
- The new reconciliation logic is implemented entirely in backend queries, mutations, and internal actions, not in model-driven tool flows.
- No new attacker-controlled text is inserted into hidden prompts or used to select privileged actions.

- Hidden instructions still explicitly rank above customer and knowledge content, and both customer SMS and retrieved knowledge are labeled untrusted in the runtime prompt:
  - `convex/ai/agents/runtime.ts:31-67`
  - `convex/ai/agents/runtime.ts:78-95`
- The branch broadens prompt-extraction refusal logic to cover French probes as well as English:
  - `convex/ai/agents/runtime.ts:145-209`
- Locale switching is based only on the latest inbound customer SMS plus persisted conversation/contact state; it does not use retrieved knowledge or model output to pick a language:
  - `convex/lib/runtimeLocale.ts:177-207`
  - `convex/ai/agents/runtime.ts:2173-2215`
- Locale persistence remains an internal-only server mutation; customers cannot call a public endpoint to set another contact or conversation's locale:
  - `convex/ai/agents/runtime.ts:1833-1884`
- The agent tool layer still routes booking and hours actions through deterministic server-side helpers instead of trusting freeform model-generated arguments:
  - `convex/ai/agents/runtime.ts:1233-1338`

### Conclusion on prompt injection

I did not find a branch-introduced prompt-injection issue in the bilingual SMS runtime changes. The branch preserves the earlier prompt hardening and extends it to French-language extraction attempts without widening tool authority.

## Tenant Isolation and Conversation-State Integrity

### What I checked

- Whether new locale fields create a cross-tenant or cross-contact write path
- Whether the new operator-facing default language control is membership-protected
- Whether reminders derive language from the correct business/contact pair

### What looks good

- The new dashboard mutation for `defaultLocale` is still guarded by `requireMembership`, and it only patches the current business:
  - `convex/ai/context/snapshots.ts:76-121`
- Snapshot refresh now safely resolves legacy or missing business locale values to `"en"` instead of failing validation on older tenants:
  - `convex/ai/context/snapshots.ts:195-202`
- Reminder localization derives locale from the appointment's actual contact first and then the appointment's business, preventing unrelated user preferences from leaking across tenants:
  - `convex/notifications/reminders.ts:59-105`
- New locale fields are schema-constrained to the explicit runtime locale/source validators rather than accepting arbitrary strings:
  - `convex/lib/runtimeLocale.ts:3-17`
  - `convex/schema.ts:63-66`
  - `convex/schema.ts:188-188`
  - `convex/schema.ts:217-217`
  - `convex/schema.ts:229-230`

## Secret Handling and Provider Usage

### What I checked

- Whether the branch introduces any new secret material or external provider credentials into prompts, storage, or public APIs
- Whether localized reminders affect Twilio sender or recipient trust boundaries

### What looks good

- The branch does not add any new provider credentials, outbound webhook paths, or public HTTP endpoints.
- Reminder localization changes only the body text and locale selection; sender selection and recipient lookup remain on the existing server-side SMS path:
  - `convex/notifications/reminders.ts:81-105`
- No new secrets are copied into snapshots, prompts, or public queries as part of the locale work.

## Validation Performed

- Reviewed `git diff --stat main...HEAD`
- Inspected security-relevant diffs in:
  - `convex/ai/agents/runtime.ts`
  - `convex/lib/runtimeLocale.ts`
  - `convex/notifications/reminders.ts`
  - `convex/ai/context/snapshots.ts`
  - `convex/businesses/admin.ts`
  - `convex/schema.ts`
  - `apps/web/src/features/settings/BusinessProfileForm.tsx`
- Ran:
  - `pnpm audit --prod --dev`

## Branch Conclusion

This branch does not appear to introduce new critical, high, medium, or low security vulnerabilities relative to `main`. The bilingual SMS/runtime changes preserve the existing trust boundaries, keep locale persistence scoped to the correct conversation/contact/business records, and maintain a strong prompt-injection posture by continuing to label customer and knowledge inputs as untrusted while refusing hidden-prompt disclosure attempts in both English and French.
