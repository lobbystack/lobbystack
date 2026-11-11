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

- Migration `0204_rule_channels.sql` adds `agent_rules.channel`, a nullable `varchar(16)` checked against `voice`, `sms`, `web_chat` and `instagram`. Null means every channel.
- `voice` covers phone calls and browser test calls, as `voice_instructions` did.
- The same migration turns each agent's non-empty instruction text into rules, appended after the agent's other rules, with the text as the body:
  - `voice_instructions` becomes a `voice` rule titled "On calls".
  - `sms_instructions` becomes an `sms` rule titled "In texts".
  - `chat_instructions` becomes two rules: `web_chat`, "In website chat", and `instagram`, "On Instagram". Instagram followed the chat text, and two rules keep it that way.
- Titles come in the business's default caller language, for all 15 `RuntimeLocale` values. `channelRuleTitle()` in `packages/shared` holds the same titles for code, and a test checks the migration against it.
- The migration queues one `snapshot.refresh` outbox row per agent it changed, as `0201_portuguese_default_greeting.sql` does.
- The old columns stay. This release stops reading and writing them; a later release drops them once no running code reads them, as slice 5 did. The migration is safe to run twice: it skips an agent that already has a rule for that channel.

### Prompts

- The snapshot's `voiceInstructions`, `smsInstructions` and `chatInstructions` keep the default text, with the agent's tone. They no longer hold an owner's text.
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

- A rule gains `channel`: `voice`, `sms`, `web_chat`, `instagram` or `null` for every channel. `POST /v1/rules` and `PATCH /v1/rules/{rule_id}` take it.
- `voice_instructions`, `sms_instructions` and `chat_instructions` stay on the receptionist and agent resources, marked deprecated, so clients keep working in this release:
  - A read returns the body of the agent's first rule for that channel when it's active, or `null`. `chat_instructions` reads the website chat rule.
  - A write changes that rule's body and turns it on, or adds a rule titled after the channel when there's none. `null` deletes it. `chat_instructions` writes the website chat rule and the Instagram rule.
- The CLI's `rules list` shows the channel, and `rules add` and `rules update` take `--channel`. Both come from the operation registry.
- The onboard manifest and templates take `channel` on rules. A template now carries channel rules in `rules` instead of `*_instructions`, and still leaves out a prospect demo's own text.
- Prospect demos write their demo text as channel rules, and claiming a demo resets those rules as it reset the columns.

### Help Center

- `agent/instructions.mdx` goes, in `en`, `fr` and `es`, with a redirect to `agent/rules`. `agent/rules.mdx` explains channels.
- `mintlify/api/cli.mdx` and the generated OpenAPI file describe `channel` and the deprecated fields.

## Testing

- Unit tests for prompt building: channel rules join only their channel, in the instruction slot, and voice rules reach GPT-Live.
- Unit tests for the snapshot, the API schemas and the migration titles.
- Integration tests for the legacy API fields, the copy of rules to a new agent, demos and templates, and a rolled-back run of the migration on sample rows.
- An e2e spec: an owner adds an SMS-only rule and sees its badge, and the old Instructions URL lands on Rules.
- `pnpm voice:eval`, since GPT-Live's instructions change.

## Rollout

During a rolling deploy, a worker on the old code can read a snapshot built by the new code. It ignores `channel` and lists channel rules on every channel until it restarts. The window lasts minutes, and those rules hold text the owner wrote for the agent.

## Open questions

- **Tone.** The default instruction text, which names the agent's tone, used to disappear when an owner wrote their own. It now stays beside their channel rules, so every agent's prompt names its tone. Keep it, or drop the default text once owners have rules?
- **Instagram.** Chat text becomes two rules so Instagram keeps following it, even for an agent with no Instagram account. Should the migration skip the Instagram rule when the business has no Instagram account?
- **Legacy `null`.** Sending `null` for an instruction field deletes the matching channel rule, even one an owner wrote in the dashboard. Disabling it instead would be safer but makes the field read back as `null` with a rule still listed.
- **Rule limit.** The migration can take an agent past the 100-rule limit, which only blocks adding more. No agent is known to be near it.
