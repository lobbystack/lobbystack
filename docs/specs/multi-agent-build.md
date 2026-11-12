# Spec: multi-agent build

Status: ready-for-agent.

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
- Leave the `summary*` columns on `agents`. Slice 5 moves them.

### 2. Link channels and history to agents

- Add `agent_id` to `phone_numbers`, `widget_keys`, `instagram_accounts`, `calls`, `conversations` and `agent_rules`.
- Use composite foreign keys, so that a row can't point at another business's agent. Backfill channels in the migration. Check row counts for `calls` and `conversations` before you backfill them.
- Add a trigger that assigns the default agent, for inserts from old code. Add an archive guard that covers every channel.
- Archive agents instead of deleting them, so that history keeps the name.

Migrations 0184 to 0188 built this. Three choices affect later slices:

- **Backfill:** 0184 fills the four small tables in the migration. `calls` and `conversations` take their old rows from `backfillAgentLinks`, which `migrate` runs last. It commits 1,000 rows at a time, skips locked rows, stops after 20 minutes, and resumes on the next run. Run `pnpm --filter @lobbystack/db db:backfill-agent-links` to finish it by hand. It prints how many rows are left, and exits non-zero if any are.
- **NOT NULL:** Before the next release validates the checks, confirm that the backfill reports 0 left on `calls` and `conversations`. Then validate `*_agent_id_present` on all six tables and set NOT NULL.
- **Foreign keys:** The composite keys are deferred, so a cross-business write fails at commit. The trigger also runs on update, because the NOT VALID check applies to any row that changes. `app.default_agent_id` creates the default agent for a business that has none.

### 3. Put agents in the snapshot

- Keep one snapshot per business. Its flat fields stay the default agent, so old readers work, and `agents[]` is added.
- Project one agent with `snapshotForAgent`, after the snapshot loads. That adds no round trip while the caller hears ringing.
- Refresh on agent create, edit, archive, and channel moves.
- When an agent id isn't in the snapshot, refresh once. Falling back to the default agent would answer with the wrong voice.
- Add a metric for snapshot size.

Four choices affect slice 4 and slice 5:

- **Reading an agent:** Load through `getBusinessSnapshotForAgent`, in `snapshotCache.ts`. It handles the one refresh. `snapshotForAgent` alone returns null for an agent the snapshot doesn't list, and the flat fields for a snapshot with no `agents[]`.
- **Old snapshots:** A stored snapshot keeps its old shape until the next refresh, so the first call that names an agent on such a business pays for one refresh while the caller hears ringing. Slice 4 should expect that once per business.
- **Refreshes:** Call `enqueueAgentSnapshotRefresh` in the transaction that creates or archives an agent or moves a channel. No code moves a channel yet.
- **Unknown agent:** If a refresh doesn't find the agent, the call answers as the default agent and logs `[snapshot] unknown agent`. An archived agent counts as unknown, so a recovered call on an agent archived mid-call lands here.

The snapshot's byte size goes to the `rag.snapshot.size_bytes` histogram on each refresh.

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

`answerAsAgent.integration.test.ts` does that against PostgreSQL. It drops `agents_business_unique` inside a transaction that rolls back, so two agents can exist before slice 5. Six choices affect later slices:

- **Agent on the call:** `startCall` reads the number's agent in the insert that creates the conversation, and returns it. A retried delivery keeps the agent it started with, and the next call on a moved number takes the new one.
- **Open conversations:** Text, Instagram and widget replies follow `conversations.agent_id`, not the channel, so slice 5's moves must update open conversations, as decision 6 says. A customer who texts two agents' numbers has one conversation with each, and each reply comes from the number they texted.
- **Job payloads:** `sms.aiReply` and `instagram.reply` carry no agent, because the job reads the conversation. An old payload and a new one read the same. The attach request adds `agentId`, and an attach without it runs as the default agent.
- **Archived agents:** An attach passes `underWay` to `getBusinessSnapshotForAgent`, which reads an archived agent's row, so a call finishes as the agent it started as. A text, Instagram or widget reply on an archived agent's conversation goes to the default agent and logs `[snapshot] unknown agent`.
- **Phone numbers:** `agents[].phoneNumber` is null for an agent with no number. A snapshot built before this field keeps the flat number for the default agent. `businessHasPhoneNumber` gates widget voice, so a widget agent with no number still offers voice while another agent has one.
- **Moving a number:** Slice 5 calls `enqueueNumberAgentChange` in the transaction that moves it. That queues the snapshot refresh and the routing job, which rewrites Telnyx's stored forward and applies the new agent's staff-first setting. Slice 5 also has to scope `saveReceptionistProfileInTransaction` and `assertStaffFirstChange` by agent, which still read the default agent.

`voice:call` needs staging, and `voice:eval` needs an OpenAI key, so neither ran for this slice. Run both before this slice goes live.

### 5. Manage agents

- Port create, resolve, archive, set default and channel moves from `feat/inbox-calendar-staff`, without the opt-outs.
- Scope rules by agent, and split `PATCH /api/agent` into agent and workspace fields.
- Add `includedAgents` to the plan catalog: 1 on Free, no limit on paid plans, self-hosting and partners. Check it in `createAgent` under an advisory lock, and return `agent_limit_reached`, which opens the upgrade dialog.
- Remove the view, its name trigger and the unique index, change `is_default`'s default to false, and add a partial index for one default agent per business. This needs slice 4 live first, so that no old code remains.
- Move the `summary*` columns to `businesses`, because they describe the business. They wait for the view to go: old code writes them through it, a view that joins `businesses` isn't automatically updatable, and the old `ON CONFLICT (business_id)` fails on a joined view even with `INSTEAD OF` triggers.

Slice 5 ships in two releases, because the code still draining during a deploy upserts with `ON CONFLICT (business_id)`, inserts agents without `is_default`, and needs `agents_business_unique`:

- **5a** changes nothing a business sees. Settings saves update the agent by id, and only create the default agent when a business has none. Every agent insert, and `app.default_agent_id` (0192), sets `is_default`. Rules, staff-first routing, the refused-call forward and number activation take an agent, with the default agent when none is given, so `/v1/rules` and `/v1/receptionist` keep acting on it. The plan catalog has `includedAgents`, and the `agent_limit_reached` code exists. `agentScope.integration.test.ts` runs each of these with two agents.
- **5b** needs 5a live. Migration 0193 drops the view, its name trigger and the unique index, changes `is_default`'s default to false, and adds a unique index on each business's default agent. `agents.ts` creates, archives, sets the default and moves channels, and `/api/agents` serves them. `/api/agents/[agentId]` saves one agent's settings and refuses workspace fields, which `/api/agent` keeps saving on the default agent. On Free, the snapshot marks agents past the limit `paused`, and their channels answer as the default agent. Moving on or off a paid plan refreshes the snapshot. The `summary*` columns stay on `agents` until slice 8, since only the default agent's are read.

Raphael decided:

- A new agent copies the settings and rules of the agent it's created from, but none of its channels.
- A business can't archive its default agent until it picks another one.
- The plan comparison shows the agent limit from slice 7.

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

Raphael decided:

- A phone number in an agent's channels can move to another agent and has no Disconnect. Releasing a number stays on the number's page.
- Transfers, staff-first calling, booking and appointment changes get their own agent menu row, Calls and booking, between Rules and Channels.
- The Inbox, agents, workspace and account page events replace the calls, messages, call detail and settings ones.
- Search knows synonyms in each interface language.
- Old routes redirect temporarily, and the redirects stay, because emails link to them.
- A request to cancel or move an appointment closes once the appointment's time has passed, since nothing is left to change.
- Home's Action required shows the count of open items and a View all link to the Inbox, so the card stays short.

### 8. Finish the rename

Remove the assign-default triggers, `businesses_assign_agent_before_delete`, `backfillAgentLinks` and the onboarding alias, and rename the remaining `receptionist` code, about 1,500 lines in 250 files. Leave what slice 6 keeps stable.

Done, except for the parts the previous release still needs. Main at PR 397 inserts phone numbers, widget keys and Instagram accounts without `agent_id`, and can insert a call whose conversation has none. Nobody has confirmed that the backfill reports 0 left in production. So:

- **Removed:** migration 0214 drops the two-argument `resolve_onboarding_followup_recipient` alias, 0208's crawled page trigger, and the `agent_rules` trigger. It validates `*_agent_id_present` on `phone_numbers`, `widget_keys`, `instagram_accounts` and `agent_rules`, sets their `agent_id` NOT NULL, and drops those checks.
- **Kept:** the assign-default triggers on `phone_numbers`, `widget_keys`, `instagram_accounts`, `calls` and `conversations`, `businesses_assign_agent_before_delete`, `backfillAgentLinks` and `db:backfill-agent-links`. New code names the agent on every insert into those tables, so the next release can drop the channel triggers.
- **Summary:** migration 0215 moves the `summary*` columns to `businesses`, where the shared summary belongs. The agent columns stay for the previous release, and `agents_sync_summary` and `businesses_sync_summary` keep each business and its default agent in step. The Drizzle schema no longer has the agent columns, and `/api/agent` and `/v1/receptionist` return the same shape.
- **Renamed:** identifiers, files, comments and test names now say agent. These keep `receptionist`: the `/receptionist` resource with its operations, serializers and schemas; the CLI, the manifest and template `receptionist` keys; Zapier; MCP tool and API descriptions; the transcript speaker; the `receptionist` number routing mode in job payloads; the Twilio `receptionist-result` step; locale keys; model prompts; and customer-facing copy.

Slice 9 and the next release should know:

- **Next release:** confirm that `db:backfill-agent-links` reports 0 left, then validate `calls_agent_id_present` and `conversations_agent_id_present` and set NOT NULL. Drop the five assign-default triggers, `app.assign_default_agent()`, `businesses_assign_agent_before_delete`, `backfillAgentLinks` and its CLI command, and update `db:check`.
- **Same release:** drop the agent `summary*` columns, the two sync triggers and their functions. `app.default_agent_id` stops naming the summary in 0215.
- **Later:** the deprecated instruction columns and 0203's `agents_copy_instructions_to_rules` trigger go together, once no running code selects the columns.

### 9. Sell extra numbers

Ticket 14. The add-on costs what the carrier charges us each month for a number in that country, with no markup. The plan catalog holds a price per country, because a subscription needs a stable price, and someone updates it when a carrier's price changes. The operator sees the price for the country they pick before they buy. Until this ships, Starter and Pro include one number and a workspace has one Instagram account, so a second agent's only spare channel is a widget.

## Decisions

Raphael settled these:

| # | Decision | Answer | Slice |
|---|---|---|---|
| 1 | What's an existing business's default agent called, in all 8 caller languages? | "Agent", translated. Callers never hear it. Migration 0202 renamed it "Default agent", because "Agent" read like a label in the agent switcher. | 1 |
| 2 | Are booking mode, booking policy, transfers, staff-first calling and the appointment policy agent-level or workspace-level? | Agent-level, because an after-hours agent needs its own. The prototype's shared card changes to match. Staff-first calling arrived from main after this decision and follows transfers. | 1 |
| 3 | What happens to extra agents after a downgrade to Free? | They stay paused. Only the default agent answers, and their channels fall back to it. Upgrading restores them. | 5 |
| 4 | Does each agent have one instructions field or several? | Voice, chat and text. The decision was to hide text until two-way text existed, and main now has it. | 5 |
| 5 | Can a workspace connect several Instagram accounts? | One for now, and it moves between agents. | 5 |
| 6 | When a channel moves, do open conversations move too? | Yes, in the same transaction. | 5 |
| 7 | How much of `/agents` ships in the public API first? | Read endpoints and `agent_id`, with writes later. | 6 |
| 8 | How do we hold slice 7 for one release? | One integration branch. | 7 |
| 9 | What does the number add-on cost? | The carrier's monthly cost for that country, with no markup. | 9 |

## After slice 7: agent-specific knowledge

[`agent-knowledge.md`](agent-knowledge.md) builds on slice 7, and the [ADR 0012 amendment](../adr/0012-agents-share-a-workspace.md#amendment-2026-11-10-knowledge-can-belong-to-one-agent) records the decision. It changes slice 7's agent menu:

- The **Shared with every agent** row and page are gone. Each agent has a **Specific knowledge** row between Rules and Channels, at `/agents/[agentId]/knowledge`.
- `/agents/[agentId]/shared` redirects there temporarily.
- The snapshot's flat `knowledgeSnippets` and `knowledgeDigest` stay the default agent's. An entry in `agents[]` carries its own only when they differ, and `snapshotForAgent` projects them.

## Still open

- **Production counts:** we still don't have the row counts for `calls` and `conversations`. Slice 2's backfill runs in batches, so the release doesn't depend on them. The counts decide whether it finishes inside its 20-minute limit in one release.
