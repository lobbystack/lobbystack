# Security Best Practices Report

## Executive Summary

I reviewed `feature/ope-43-convex-compliance-phase-1` against `main` (merge base `95e924bed02073b9e82215a745f8ce81f9fc0ada`) with a branch-focused security lens. I did not find any branch-introduced vulnerabilities that would merit remediation before merge. The most security-relevant code changes improve request validation on Convex HTTP endpoints and preserve existing authentication or webhook-verification gates.

After the initial review, I remediated the pre-existing moderate `hono` advisory by pinning the transitive dependency to `4.12.7` via a root pnpm override in [package.json:10](/Users/raphael/Coding/ai-receptionist/package.json#L10). The resolved dependency graph now points the Convex helper chain at `hono@4.12.7`, visible in [pnpm-lock.yaml:8](/Users/raphael/Coding/ai-receptionist/pnpm-lock.yaml#L8) and [pnpm-lock.yaml:2295](/Users/raphael/Coding/ai-receptionist/pnpm-lock.yaml#L2295), and `pnpm audit --prod --dev` now reports no known vulnerabilities.

## Scope

- Diff review against `main` for:
  - [convex/http.ts](/Users/raphael/Coding/ai-receptionist/convex/http.ts)
  - [convex/conversations/webhooks.ts](/Users/raphael/Coding/ai-receptionist/convex/conversations/webhooks.ts)
  - [convex/voice/runtime.ts](/Users/raphael/Coding/ai-receptionist/convex/voice/runtime.ts)
  - [convex/lib/auth.ts](/Users/raphael/Coding/ai-receptionist/convex/lib/auth.ts)
  - [convex/ai/context/knowledge.ts](/Users/raphael/Coding/ai-receptionist/convex/ai/context/knowledge.ts)
  - schema/index changes that affect authorization or data routing
- Validation:
  - `pnpm typecheck`
  - `pnpm test`
  - `pnpm audit --prod --dev`

## Critical Findings

None.

## High Findings

None.

## Medium Findings

None.

## Low Findings

None.

## Informational Notes

### INFO-1: Branch improves validation on exposed Convex HTTP routes

The branch adds explicit Zod validation and early `400` handling for the exposed HTTP entrypoints in [convex/http.ts:18](/Users/raphael/Coding/ai-receptionist/convex/http.ts#L18), [convex/http.ts:133](/Users/raphael/Coding/ai-receptionist/convex/http.ts#L133), and [convex/http.ts:201](/Users/raphael/Coding/ai-receptionist/convex/http.ts#L201). This is aligned with the backend guidance to validate untrusted request data before it reaches business logic.

### INFO-2: Existing authn/authz checks remain in place for the newly refactored knowledge actions

The knowledge preview and search paths still require an authenticated identity plus business membership before performing business-scoped work, as shown in [convex/ai/context/knowledge.ts:78](/Users/raphael/Coding/ai-receptionist/convex/ai/context/knowledge.ts#L78). I did not find an authorization regression in the refactor from internal action chaining to shared helper functions.

### INFO-3: Pre-existing `hono` advisory has been remediated

The earlier `pnpm audit --prod --dev` result for `GHSA-v8w9-8mx6-g223` was caused by the existing Convex dependency chain `@convex-dev/agent -> convex-helpers -> hono`. I fixed that by forcing `hono@4.12.7` with a root pnpm override in [package.json:10](/Users/raphael/Coding/ai-receptionist/package.json#L10). The lockfile now resolves the whole Convex helper chain to the patched version, including [pnpm-lock.yaml:22](/Users/raphael/Coding/ai-receptionist/pnpm-lock.yaml#L22), [pnpm-lock.yaml:1825](/Users/raphael/Coding/ai-receptionist/pnpm-lock.yaml#L1825), and [pnpm-lock.yaml:5404](/Users/raphael/Coding/ai-receptionist/pnpm-lock.yaml#L5404), and a fresh `pnpm audit --prod --dev` returns clean.

## Residual Risks To Verify Outside App Code

- Internal voice endpoints rely on `x-internal-service-token` rather than user-facing auth, which is appropriate for service-to-service traffic but should still be protected by secret rotation and network boundary controls. The branch does not weaken this pattern.
- Twilio webhook authenticity still depends on correct `TWILIO_AUTH_TOKEN` configuration and deployment URL consistency. The branch preserves signature verification for SMS ingress at [convex/http.ts:171](/Users/raphael/Coding/ai-receptionist/convex/http.ts#L171).

## Conclusion

No branch-specific security blockers were found, and the one pre-existing dependency advisory identified during the review has now been remediated and verified.
