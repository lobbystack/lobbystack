# Linear Tracking Methodology

## Purpose

This project needs execution discipline, not just a plan. The tracking model must answer:

- what is implemented
- what is only scaffolded
- what has been validated against real providers
- what is actually pilot-ready

Until the Linear MCP is reachable from this Codex session, this document is the source of truth for how the Linear project should be structured.

## Canonical Linear Setup

- Project: `AI Receptionist MVP`
- Teams: one product team is enough for MVP
- Roadmap units: use `M0` through `M6` as epics
- Parent-child structure:
  - epic = milestone
  - issue = concrete deliverable or validation task
  - sub-issue = optional only when a task is larger than 1-2 coding sessions

## Workflow States

- `Backlog`
  - accepted as real work, not ready to start
- `Ready`
  - scoped, dependencies known, clear acceptance criteria
- `In Progress`
  - actively being coded or tested
- `Blocked`
  - waiting on credentials, provider access, product decision, or infrastructure
- `In Review`
  - implemented and waiting on manual validation or merge review
- `Done`
  - code merged, docs updated, and acceptance criteria met

Do not use extra states for MVP. Keep the board easy to read.

## Execution Stages

Every issue should also carry a `stage/*` label so progress is not overstated.

- `stage/scaffolded`
  - structure exists but real behavior is incomplete
- `stage/implemented`
  - code path exists and local builds/tests pass
- `stage/provider-validated`
  - verified against the real external provider at least once
- `stage/pilot-ready`
  - validated and acceptable for pilot tenants

This matters because a feature can be implemented without being production credible.

## Label Taxonomy

Use a small fixed label set.

- Area labels:
  - `area/web`
  - `area/convex`
  - `area/voice`
  - `area/booking`
  - `area/knowledge`
  - `area/telemetry`
  - `area/devops`
- Type labels:
  - `type/feature`
  - `type/integration`
  - `type/docs`
  - `type/testing`
  - `type/bug`
  - `type/refactor`
- Provider labels:
  - `provider/twilio`
  - `provider/openai`
  - `provider/google`
  - `provider/microsoft`
  - `provider/resend`
  - `provider/convex`
- Risk labels:
  - `risk/high`
  - `risk/medium`
  - `risk/low`

Do not create custom labels casually. Label sprawl kills the board.

## Definition Of Ready

An issue is `Ready` only if:

- it has one clear outcome
- its dependencies are named
- it names the affected runtime surface
- acceptance criteria are testable
- the owner knows whether real-provider validation is required

## Definition Of Done

An issue is `Done` only if:

- code is merged
- `pnpm typecheck` passes
- `pnpm build` passes
- relevant tests pass or the manual validation gap is called out explicitly
- docs are updated if architecture, setup, or operator behavior changed
- the issue stage label matches reality

## WIP Rules

- Max 1 active epic in deep implementation mode per runtime risk area:
  - one for `voice`
  - one for `convex/web`
- Max 3 `In Progress` issues at once for MVP
- Any blocked issue must name the blocker in one sentence

## Validation Rules

Use separate issues for:

- implementation
- real-provider validation
- pilot hardening

Example:

- `Implement OpenAI Realtime media bridge`
- `Validate OpenAI Realtime bridge with live Twilio call`
- `Harden voice bridge retry and failure behavior for pilot`

This avoids marking risky work done too early.

## Weekly Cadence

At the start of a work cycle:

- move only a few issues to `Ready`
- keep the next 1-2 provider validation tasks visible

At the end of a work cycle:

- update milestone status
- demote anything overstated
- add new blockers explicitly instead of hiding them in notes

## Required Epics

- `M0 Foundation`
- `M1 Tenant Core`
- `M2 Business Context MCP`
- `M3 Booking + Calendars`
- `M4 SMS`
- `M5 Voice`
- `M6 Hardening`

## Required Meta Issues

Every epic should include these issue types where relevant:

- implementation
- provider validation
- docs
- tests

## MCP Mirror Rule

Once Linear MCP becomes reachable, mirror the following artifacts exactly:

- [mvp-status.md](/Users/raphael/Coding/ai-receptionist/docs/tracking/mvp-status.md)
- [mvp-backlog.md](/Users/raphael/Coding/ai-receptionist/docs/tracking/mvp-backlog.md)

The repo remains the fallback source of truth if MCP connectivity breaks.
