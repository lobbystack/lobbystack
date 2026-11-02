# Spec: agents and navigation

Status: Raphael chose concept A, drill-in. The multi-agent build starts from `proto/a-drill-in`.

## Problem Statement

New operators test their agent and leave before a real customer reaches it. Operators who stay can't always find what they need on the first try, and a business can only run one agent.

Several problems follow from that:

- **Nothing leads a new account to its first real conversation.** Home looks the same for a business that has never had one as for a business that gets dozens a day.
- **Settings live in three places.** AI settings sit under Agent, business settings under Settings, and account settings in the user menu. Operators can't tell which one holds what.
- **Channels live in three places.** The phone number is under Settings, the widget under Manage, and Instagram under Integrations.
- **The top bar takes a full row for a few small buttons.**
- **The dashboard has no search.** Calls, Contacts and Messages each search their own list, and nothing finds a page or a setting.
- **A business can't run a second agent,** so it can't give a day line and an after-hours line different voices and rules, or run an agent on Instagram alone.
- **Onboarding doesn't wait for the website import,** so an operator can reach the test call before the agent has read their site.
- **The word "receptionist" limits a product that answers on more channels than the phone,** and the dashboard already mixes it with "agent".

## Solution

We fix activation first, then compare four working navigation prototypes, then build multi-agent support on the one Raphael picks:

- **Tracking comes first,** so replays and first real conversations can judge everything after it.
- **Operators see "agent" and "workspace".** The marketing site keeps "AI receptionist" as the job the agent does.
- **New accounts get their own Home** until their first real conversation, and a wait screen before the test call while the import runs.
- **Four worktrees hold four working dashboards.** They share one base branch for settings, search and the Inbox, and differ in how the whole navigation fits together.
- **The chosen navigation ships to everyone at once,** with multi-agent support behind it and no feature flag.

## User Stories

### New operators

1. As a new operator, I want one screen that tells me what to do next, so that I reach a real conversation without learning the dashboard first.
2. As a new operator, I want my test call to use what's on my website, so that my first impression of the agent is a fair one.
3. As a new operator, I want to see what the product does while my site imports, so that the wait teaches me something.
4. As a new operator, I want forwarding steps for my phone carrier, so that real callers reach my agent.
5. As a new operator, I want Home to change on its own after my first real conversation, so that I don't have to dismiss a setup screen.

### Operators finding things

6. As an operator, I want to type what I'm looking for, so that I don't need to know which menu holds it.
7. As an operator, I want search results to show where each one lives, so that I learn the dashboard as I use it.
8. As an operator, I want one Inbox for calls and messages, so that I don't check each channel on its own page.
9. As an operator, I want one place for each kind of setting, so that I can tell agent, workspace and account settings apart.
10. As an operator, I want shared settings marked on the agent page, so that I know a change there affects every agent.

### Operators with several agents

11. As an owner, I want to add a second agent, so that a line or a channel can have its own voice and rules.
12. As an owner, I want an agent that answers Instagram alone, so that it needs no phone number.
13. As an operator, I want to see which agent handled a conversation, so that I know which one to fix.
14. As an operator, I want activity pages to show all agents with a filter, so that nothing hides behind a switcher by default.
15. As an owner on a paid plan, I want to buy an extra number as an add-on, so that a second line can have its own agent.

## Implementation Decisions

### Language

- Agent, channel, employee, real conversation and workspace are defined in [`GLOSSARY.md`](../../GLOSSARY.md).
- Navigation, settings labels and badges say "workspace". Sentences about the company itself can still say "business", as in "business hours".
- Code, the database, the API, the partner console and the glossary keep "business". A workspace is a business under another name.
- Dashboard copy, help docs and emails move to "agent" in one change, in every language they exist in. Code and table names follow with the multi-agent build. Marketing pages don't change.

### Agents and channels

[ADR 0012](../adr/0012-agents-share-a-workspace.md) records the model:

- A workspace holds knowledge, services, employees, the calendar, contacts and conversations.
- An agent holds its name, voice, instructions, rules and channels. It can have no channels at all.
- A channel holds its own appearance, such as widget colours, and belongs to one agent.
- After-hours handling on a single number is a rule inside that agent. A second number can have its own agent.
- Each location stays its own workspace.
- Signup creates one default agent, and existing businesses get theirs automatically.
- A workspace with one agent sees no choice between agents. "Add agent" stays available but quiet.

### Plans

- Free includes one agent. Paid plans include unlimited agents.
- Allowance stays per business, shared across its agents.
- Starter and Pro keep one included number, and sell extra numbers as a named add-on at a flat monthly price.
- Partners keep the number limits of their tier.

### Rules every prototype shares

- **Settings have three levels.** Account holds profile, security, language, theme and notifications. Workspace holds team, billing, usage, API keys, and calendar and CRM connections. Agent holds AI settings, rules and channels.
- **Each prototype chooses where those levels sit.** Nothing fixes account settings or the help menu to the bottom left.
- **Search sits under the workspace switcher.** It finds pages, settings, agents, contacts and conversations, matches related words, and shows where each result lives.
- **Calls and Messages become one Inbox,** filtered by channel and agent.
- **Activity pages show all agents by default,** with a filter. Concept B tests the opposite.
- **The agent page shows shared items** with a "Workspace" badge and a link to where you edit them.
- **The top bar goes away.** Test call moves to Home and the agent page. Affiliate, docs and feedback move to a help menu. The "Before you go" survey and the mobile buttons need a new home, because they're wired through the bar today.
- **Permissions stay as they are.** Activity-only operators and partner access see what they see today.

### The four concepts

| Concept | Worktree branch | Port | Idea |
|---|---|---|---|
| A, drill-in | `proto/a-drill-in` | 3001 | One workspace menu. Opening an agent or settings swaps the sidebar for that section's menu, with a back arrow. |
| B, switcher | `proto/b-switcher` | 3002 | One switcher lists the workspace and its agents. Picking an agent replaces the sidebar and scopes every page to it, and "All agents" stays one option. |
| C, to-do first | `proto/c-todo` | 3003 | A short sidebar, with Home listing what to do next. |
| D, assistant | `proto/d-assistant` | 3004 | A plain sidebar: Home, Inbox, Calendar, Contacts, Agents, Analytics, Workspace. An agent opens as one long page of cards, and a right-side assistant panel makes changes. The panel scripts three edits: change the greeting, change the hours, add an answer. |

Each prototype covers the menu, Home, the agent pages, settings and setup. Each one works in two states: a new account with no conversations, and a workspace with three agents.

### Prototype setup

- `proto/base` holds the shared rules, the "agent" and "workspace" copy, and a demo seed. The four concept branches come from it.
- These branches stay local and are never pushed.
- Each worktree runs on its own `ADMIN_PORT` against the same local database, with no migrations.
- The demo seed has Front desk on phone and widget, After hours on phone, and Instagram on Instagram alone, with sample calls and messages. Those agents are fake data.
- Prototypes are desktop only. Scoring checks that each one could work on a phone, and only the winner gets a full mobile version.

### New-account Home

- One Home shows until the first real conversation, then the normal Home replaces it without any action from the operator.
- It has three stages: hear it, teach it, put it on your number.
- The third stage walks through forwarding, with steps for the operator's phone carrier. The number stays where it is in onboarding, after the test call.
- It uses the operator's answer to the new goal question and shows their test call.
- The goal question joins onboarding next to the attribution question, which stays.

### Wait screen

- It shows right before the test call, only while the website import is running.
- It shows live progress and slides about real features.
- After a time limit it moves on with whatever has been read. Set the limit from measured import times.

### Choosing and shipping

- Update the top tasks with: add a second agent, change one agent's greeting, connect Instagram to an agent, see which agent handled a call, find billing, change your password, invite a teammate.
- Score each prototype on those tasks by click count and against Bastien and Scapin's criteria. Raphael picks the winner.
- Raphael picked concept A, with Agents and Settings in the main menu and agents listed by name under Agents.
- Ship to everyone in one release, with no feature flag.
- Judge it from replays and first real conversations.

### The multi-agent build

- [`multi-agent-build.md`](multi-agent-build.md) holds the plan.
- Rename `receptionist_profiles` to `agents` in place. Reuse the domain logic and the links from phone numbers, widget keys, calls, conversations and rules on the `feat/inbox-calendar-staff` branch, but not its migrations.
- Add Instagram as a channel.
- Leave out its knowledge and service opt-outs until someone needs them.

## Measures

- **New accounts:** first real conversation on any channel, recorded with the channel name, and a return within 7 days. The first real conversation is the main measure.
- **Regulars:** top tasks in one or two clicks.

## Testing Decisions

- Every new telemetry event gets a test that asserts it fires from its real production code path.
- Test the first real conversation event for each channel, and test that test calls and calls from verified team phones don't fire it.
- Test that Home switches after the first real conversation and never switches back.
- Test that the wait screen only appears during an import, and that it always lets the operator continue.
- Test search with a limited operator, so that results never show a page their role can't open.
- The multi-agent build follows the database rules in `CLAUDE.md`, including `pnpm db:check` and `pnpm db:verify-rls`.
- Changing GPT-Live instructions for agents needs `pnpm voice:eval` and `pnpm voice:call`.

## Out of Scope

- Interviews and paid panel tests.
- Removing the "Before you go" survey.
- The partner console.
- Agent limits on partner packages.
- Helpdesk features such as tickets.
- Per-agent knowledge and per-channel instructions.
- WhatsApp and two-way text channels. An agent that answers texts waits for a two-way text channel.
- Moving the phone number earlier in onboarding.
- A real assistant panel. Concept D scripts its edits, and building one is a separate decision.

## Further Notes

- The check-in email rewrite is a separate ticket. It uses the new words and the new tracking.
- Research notes and usage evidence stay in `.scratch/agents-and-navigation/`, because this repository is public.
