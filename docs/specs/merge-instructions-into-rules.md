# Spec: merge an agent's Instructions into Rules

Status: ready-for-agent

## Problem statement

Each agent has two pages that tell it what to do. **Instructions** holds one free-text box per kind of channel: calls, chats and text messages (`voice_instructions`, `chat_instructions` and `sms_instructions` on `agents`). **Rules** holds a list of titled rules that apply on every channel. Owners can't tell the two apart, and the Rules page describes its rules as instructions.

## Solution

Rules becomes the one place for what an agent should do. A rule gains an optional channel: every channel, the default, or only calls, text messages, website chat or Instagram. The Instructions page and its menu row go away, and each agent's instruction text moves into rules scoped to its channel.

## What the code does today

- `buildAgentInstructions` in `packages/agent-core/src/instructions.ts` puts one instruction text in the text agent's prompt, after the tool guidance: `voiceInstructions` on `voice` and `web_voice`, `smsInstructions` on `sms`, and `chatInstructions` on `web_chat` and `instagram`. Instagram has no text of its own.
- `buildLiveInstructions` puts `voiceInstructions` right after the greeting line in GPT-Live's instructions, for phone and browser calls.
- `agentInstructions` in `packages/domain/src/snapshot.ts` fills an empty field with default text built from the business name, timezone and the agent's tone. An owner's own text replaces that default, tone included.
- Rules reach both prompts through the business snapshot, in priority order, under "Customer rules" (text agent) and "Business rules" (GPT-Live, within 1,000 tokens).
- An instruction holds up to 8,000 characters. A rule holds 10,000 in the dashboard and 4,000 through the API, and the snapshot keeps the first 4,000.
- The public API shows and takes `voice_instructions`, `sms_instructions` and `chat_instructions` on `GET`/`PATCH /v1/receptionist` and `GET /v1/agents`. The CLI's `receptionist set` reads them from files, and the onboard manifest and partner templates carry them in `receptionist`.
- Prospect demos write demo-only voice and SMS instructions, and claiming a demo puts back the new-business text where the demo's text is still in place. Templates leave the demo text out.

## Design

### Data

- Migration `0203_rule_channels.sql` adds `agent_rules.channel`, a nullable `varchar(16)` checked against `voice`, `sms`, `web_chat` and `instagram`. Null means every channel.
- `voice` covers phone calls and browser test calls, as `voice_instructions` did.
- The same migration turns each agent's non-empty instruction text into rules, appended after the agent's other rules, with the text as the body:
  - `voice_instructions` becomes a `voice` rule titled "On calls".
  - `sms_instructions` becomes an `sms` rule titled "In texts".
  - `chat_instructions` becomes a `web_chat` rule, "In website chat". It also becomes an `instagram` rule, "On Instagram", when the business has a row in `instagram_accounts`, including one waiting to reconnect, since Instagram followed the chat text. A business without Instagram gets no Instagram rule.
- Titles come in the business's default caller language, for all 15 `RuntimeLocale` values. `channelRuleTitle()` in `packages/shared` holds the same titles for code, and a test checks the migration against it.
- The migration queues no `snapshot.refresh`. The previous worker drains for up to 31 minutes after the migrator runs, and it would build a snapshot without channels from such a job, where each channel rule reads as a rule for every channel. Snapshots carry `schemaVersion` instead, and `getCachedBusinessSnapshot` rebuilds any snapshot older than `SNAPSHOT_SCHEMA_VERSION` (2) before it returns it, from the cache or the database. A snapshot the old worker builds during the drain gets rebuilt the same way on its first read.
- The migration can take an agent past the 100-rule limit. That only blocks adding more rules through the API, and no agent is known to be near it. A reorder takes up to 104 ids (`RULES_REORDER_MAX`), one per channel past the limit, so such an agent can still put its rules in order, in the dashboard and through `POST /v1/rules/reorder`.
- The snapshot keeps the first 50 rules for every channel and, separately, the first 50 for each channel. The converted instructions come after an agent's other rules, so a single cap of 50 would drop them from an agent with 47 or more rules.
- A new business's default agent starts with the call and text instructions every new business got before (`NEW_BUSINESS_RECEPTIONIST_INSTRUCTIONS`), as an "On calls" rule and an "In texts" rule titled in its language. Partner businesses get them too, and a template carries them like any other rule. When a template or `lobbystack onboard` manifest sets a rule for a channel, it updates the business's own rule for that channel when that rule's title is the channel's title in any language, so the business doesn't end up with two.
- The old columns stay. This release stops reading and writing them; a later release drops them once no running code reads them, as slice 5 did. The migration is safe to run twice: it skips an agent that already has a rule for that channel.

### Prompts

- The snapshot's `voiceInstructions`, `smsInstructions` and `chatInstructions` keep the default text, with the agent's tone. They no longer hold an owner's text. The default text used to disappear when an owner wrote their own; it now stays beside their channel rules, so every agent's prompt names its tone.
- Each snapshot rule carries its `channel`. Channel rules keep up to 8,000 characters in the snapshot, the old instruction limit; other rules keep 4,000.
- The text agent lists the rules for the conversation's channel where the instruction text went. Every-channel rules stay in "Customer rules". Rules for other channels stay out.
- GPT-Live lists voice rules right after the greeting line, within their own 3,000-token budget, and every-channel rules where they were.
- Calls still read everything from the snapshot taken at call start. Nothing reads rules per turn.

### Dashboard

- `/agents/[agentId]/instructions` is gone. `MOVED_DASHBOARD_ROUTES` redirects it, temporarily, to `/agents/[agentId]/rules`.
- The agent menu, the page list and search drop Instructions. Search maps the Instructions synonyms, and the word "instructions", onto Rules in `en`, `fr`, `es` and `sr`.
- The rule dialog gets a **Channel** select: **All channels**, **Calls**, **Text messages**, **Website chat** or **Instagram**.
- The rules table gets a **Channel** column. A scoped rule shows a badge with its channel; others read **All channels**. The table's skeletons get the column too.

### Public API, CLI and manifest

- A rule gains `channel`: `voice`, `sms`, `web_chat`, `instagram` or `null` for every channel. `POST /v1/rules` and `PATCH /v1/rules/{rule_id}` take it. A rule with a channel holds up to 8,000 characters through the API, as the old instruction fields did; a rule for every channel keeps 4,000.
- `voice_instructions`, `sms_instructions` and `chat_instructions` stay on the receptionist and agent resources, marked deprecated, so clients keep working in this release:
  - A read returns the body of the agent's first rule for that channel when it's active, or `null`. `chat_instructions` reads the website chat rule.
  - A write changes that rule's body and turns it on, or adds a rule titled after the channel when there's none. `chat_instructions` writes the website chat rule and the Instagram rule.
  - `null` deletes that channel's rule, even one an owner wrote in the dashboard. `mintlify/api/overview.mdx` and `cli.mdx` say so.
- The CLI's `rules list` shows the channel, and `rules add` and `rules update` take `--channel`. Both come from the operation registry.
- The onboard manifest and templates take `channel` on rules. A template now carries channel rules in `rules` instead of `*_instructions`, and still leaves out a prospect demo's own text.
- Prospect demos write their demo text as channel rules, and claiming a demo resets those rules as it reset the columns.

### Help Center

- `agent/instructions.mdx` goes, in `en`, `fr` and `es`, with a redirect to `agent/rules`. `agent/rules.mdx` explains channels.
- `mintlify/api/overview.mdx`, `mintlify/api/cli.mdx` and the generated OpenAPI file describe `channel` and the deprecated fields.

## Testing

- Unit tests for prompt building: channel rules join only their channel, in the instruction slot, and voice rules reach GPT-Live.
- Unit tests for the snapshot, the API schemas and the migration titles.
- Integration tests for the legacy API fields, the copy of rules to a new agent, demos and templates, and a rolled-back run of the migration on sample rows.
- An e2e spec: an owner adds an SMS-only rule and sees its badge, and the old Instructions URL lands on Rules.
- `pnpm voice:eval`, since GPT-Live's instructions change, on the demo snapshot and on the demo snapshot as the migration leaves it. The `silent` scenario takes any natural check-in (`SILENCE_CHECK_IN` in `scripts/voice/scenarios.ts`): "still there", "still with me", "still on the line", "can you hear me", "are you there", or a line opening with "Hello?". A call with no check-in still fails.

  Results with the wider pattern: the demo snapshot passed 23 of 24 runs, and the migrated one 23 of 24, with `silent` at 3 of 3 on both. The one failure on each side was a call left open after a goodbye (`trailing-goodbye` on the demo, `good-day` on the migrated snapshot), and a rerun of those two scenarios passed 6 of 6 on each snapshot.

## Release notes

- During a rolling deploy, a worker on the old code can read a snapshot built by the new code. It ignores `channel` and follows channel rules on every channel until it restarts. The window lasts minutes, and those rules hold text the owner wrote for the agent. The product owner accepted this.
- Until the admin finishes deploying, the previous admin still saves instructions to the old columns. The trigger `agents_copy_instructions_to_rules` from 0203 copies each change onto the agent's channel rules, as the deprecated API fields write them, so no edit is lost. New code never writes the columns, so only old code fires it.
- The previous admin can still copy an agent during the deploy. Its copy reads rules without `channel`, so the new agent's channel rules apply on every channel until someone edits them.
- A later release drops `voice_instructions`, `sms_instructions` and `chat_instructions` from `agents`, once no running code reads them, along with the trigger and `app.copy_agent_instructions_to_rules()`.

## Decisions

The product owner settled these during the build:

1. The migration adds an Instagram rule only for a business with Instagram linked.
2. Every agent's prompt now names its tone, even with channel rules.
3. `null` on a deprecated instruction field deletes that channel's rule.
4. Through the API, a channel rule holds 8,000 characters and a rule for every channel 4,000.
5. The migration may take an agent past the 100-rule limit.
6. Old workers may follow channel rules on every channel during a rolling deploy.
7. The voice eval's `silent` scenario accepts any natural check-in phrasing.

## Open questions

None.
