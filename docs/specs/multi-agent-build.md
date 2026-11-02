# Spec: multi-agent build

Status: ready-for-agent. Slices 1 and 2 wait on production counts.

This spec turns concept A from a prototype into the product. [`agents-and-navigation.md`](agents-and-navigation.md) holds the product decisions and [ADR 0012](../adr/0012-agents-share-a-workspace.md) the model. This file covers how to build them.

## Approach

- **Rename `receptionist_profiles` to `agents` in place.** Every business keeps its row, so nothing needs copying. The `agents` table and its mirror triggers on `feat/inbox-calendar-staff` predate the voice and summary columns, so we reuse that branch's domain logic and not its migration.
- **Ship in slices.** Slices 0 to 6 add real agents behind today's dashboard, where each business still has one agent. Slice 7 replaces the navigation for everyone in one release.
- **Keep the public API stable.** New fields and endpoints are additive.

## Deploy rules

A release runs the migrator, then the worker, then the admin, and the old worker can drain for up to 31 minutes. Migrations never roll back. So:

- Each migration must work with the previous admin and worker.
- Old code keeps reading and writing `receptionist_profiles` through a `security_invoker` view of each business's default agent. Migration 0126 is the precedent for the rename, but it had no view, so test the old insert, upsert, `FOR UPDATE` and `FOR SHARE` queries through this one.
- Keep the unique index on `business_id` until the view goes, because the old `ON CONFLICT (business_id)` depends on it.
- Add NOT NULL in two releases: a `NOT VALID` check first, then validate and set it.

## Slices

| # | Slice | Depends on | Extra checks |
|---|---|---|---|
| 0 | Prepare the branch | Nothing | `db:check`, `db:verify-rls` |
| 1 | Rename the table | 0 | `db:check`, `db:verify-rls`, integration suites |
| 2 | Link channels and history to agents | 1 | `db:check`, `db:verify-rls`, integration suites |
| 3 | Put agents in the snapshot | 2 | `voice:eval` |
| 4 | Answer as the right agent | 3 | `voice:eval`, `voice:call` on staging |
| 5 | Manage agents | 4 released | `db:check`, `db:verify-rls`, integration suites |
| 6 | Add agents to the public API | 5 | Contract tests, Zapier `npm test` |
| 7 | Ship the concept A navigation | 5 | E2E, UI parity, mobile pass |
| 8 | Finish the rename | 7 | `db:check`, `db:verify-rls`, full suite |
| 9 | Sell extra numbers | 7 | Billing tests |

Every slice also runs `pnpm typecheck`, `pnpm lint`, `pnpm test` and `pnpm build`.

### 0. Prepare the branch

- Merge main. Main has its own migrations 0170 to 0179, so renumber this branch's three to 0180, 0181 and 0182. The journal tracks filenames, so a database that applied the old names replays them. Check that all three are idempotent.
- Keep an alias for `resolve_onboarding_followup_recipient`'s old signature for one release, so the old worker's job doesn't fail during a deploy.

### 1. Rename the table

- Rename the table, then add `name`, `is_default` and `archived_at`.
- Create the compatibility view and backfill a row for any business that has none.
- Move the 28 runtime statements in 14 files to the Drizzle `agents` table, and behaviour stays the same.
- Move the `summary*` columns to `businesses`, because they describe the business.

### 2. Link channels and history to agents

- Add `agent_id` to `phone_numbers`, `widget_keys`, `instagram_accounts`, `calls`, `conversations` and `agent_rules`.
- Use composite foreign keys, so that a row can't point at another business's agent. Backfill channels in the migration. Check row counts for `calls` and `conversations` before you backfill them.
- Add a trigger that assigns the default agent, for inserts from old code. Add an archive guard that covers every channel.
- Archive agents instead of deleting them, so that history keeps the name.

### 3. Put agents in the snapshot

- Keep one snapshot per business. Its flat fields stay the default agent, so old readers work, and `agents[]` is added.
- Project one agent with `snapshotForAgent`, after the snapshot loads. That adds no round trip while the caller hears ringing.
- Refresh on agent create, edit, archive, and channel moves.
- When an agent id isn't in the snapshot, refresh once. Falling back to the default agent would answer with the wrong voice.
- Add a metric for snapshot size.

### 4. Answer as the right agent

Resolve the agent inside `startCall`, from the number, so that routing stays live.

| Channel | Where the agent comes from |
|---|---|
| Phone, Twilio and Telnyx | `phone_numbers.agent_id`, in `startCall` |
| Refused call forward | The number's agent. Moving a number refreshes Telnyx's stored forward |
| Browser test call | An `agentId` that the session route validates against the operator's access |
| Widget chat and voice | `widget_keys.agent_id` |
| Instagram | `instagram_accounts.agent_id`, stored on the conversation |
| Text | `phone_numbers.agent_id`, stored on the conversation. The reply job in `textReplyJobs.ts` projects that agent |
| Worker attach, resume and recovery | `calls.agent_id` |

Tools that read the appointment change policy need the agent passed in. `contactChannels.phoneNumber` must stop taking the first active number, which is wrong for an agent with no phone.

Test each channel with two agents.

### 5. Manage agents

- Port create, resolve, archive, set default and channel moves from `feat/inbox-calendar-staff`, without the opt-outs.
- Scope rules by agent, and split `PATCH /api/agent` into agent and workspace fields.
- Add `includedAgents` to the plan catalog: 1 on Free, no limit on paid plans, self-hosting and partners. Check it in `createAgent` under an advisory lock, and return `agent_limit_reached`, which opens the upgrade dialog.
- Remove the view and the unique index, and add a partial index for one default agent per business. This needs slice 4 live first, so that no old code remains.

### 6. Add agents to the public API

- Keep `/receptionist`, its operation names, `lobbystack receptionist`, the manifest's `receptionist:` key, webhook event names and transcript's `speaker: "receptionist"`. `/receptionist` and `/rules` act on the default agent.
- Add `agent_id` to calls and messages, and add `/agents`.
- Update the OpenAPI document, the CLI docs and their `fr` and `es` copies.

### 7. Ship the concept A navigation

Build on a stacked branch, and release it in one step. Starting from `proto/a-drill-in`:

- **Port:** the menu levels, back row, settings levels, search, help menu and agent pages.
- **Rewrite on real data:** the agents store, add agent dialog, agent sections, Inbox and the Analytics agent breakdown. Use the server's Inbox query from `feat/inbox-calendar-staff` and today's instruction and rule surfaces.
- **Drop:** fixtures, the deterministic agent mapping, demo accounts, `proto:seed`, the prototype's Home seam and "Reset demo agents".
- **Routes:** `/inbox`, `/agents`, `/workspace/*` and `/account/*`, with server redirects from `/calls`, `/messages`, `/agent/*`, `/integrations/*`, `/widget` and `/settings/*`. `/agents/primary` must resolve to the default agent on the server.
- **Finish what the prototype skipped:**
  - Translate every string into `en`, `fr`, `es` and `sr`.
  - Add `web.page.*` events for the new routes, with tests.
  - Confirm before Remove agent and Disconnect.
  - Replace the deleted shell, settings and utility bar tests.
  - Update the UI parity manifest and the Help Center.
- **Build the mobile version:** close the drawer on section changes, fix the agent dropdown's side and the hidden test call button, and put Action required above Upcoming at 390px.

Test search with a limited operator, activity-only operators and partner access.

### 8. Finish the rename

Remove the assign-default trigger and the onboarding alias, validate NOT NULL, and rename the remaining `receptionist` code, about 1,500 lines in 250 files. Leave what slice 6 keeps stable.

### 9. Sell extra numbers

Ticket 14. The add-on costs what the carrier charges us each month for a number in that country, with no markup. The plan catalog holds a price per country, because a subscription needs a stable price, and someone updates it when a carrier's price changes. The operator sees the price for the country they pick before they buy. Until this ships, Starter and Pro include one number and a workspace has one Instagram account, so a second agent's only spare channel is a widget.

## Decisions

Raphael settled these:

| # | Decision | Answer | Slice |
|---|---|---|---|
| 1 | What's an existing business's default agent called, in all 8 caller languages? | "Agent", translated. Callers never hear it. | 1 |
| 2 | Are booking mode, booking policy, transfers, staff-first calling and the appointment policy agent-level or workspace-level? | Agent-level, because an after-hours agent needs its own. The prototype's shared card changes to match. Staff-first calling arrived from main after this decision and follows transfers. | 1 |
| 3 | What happens to extra agents after a downgrade to Free? | They stay paused. Only the default agent answers, and their channels fall back to it. Upgrading restores them. | 5 |
| 4 | Does each agent have one instructions field or several? | Voice, chat and text. The decision was to hide text until two-way text existed, and main now has it. | 5 |
| 5 | Can a workspace connect several Instagram accounts? | One for now, and it moves between agents. | 5 |
| 6 | When a channel moves, do open conversations move too? | Yes, in the same transaction. | 5 |
| 7 | How much of `/agents` ships in the public API first? | Read endpoints and `agent_id`, with writes later. | 6 |
| 8 | How do we hold slice 7 for one release? | One integration branch. | 7 |
| 9 | What does the number add-on cost? | The carrier's monthly cost for that country, with no markup. | 9 |

## Still open

- **Production counts:** slice 1 needs the number of businesses with no profile row, and slice 2 the row counts for `calls` and `conversations`.
