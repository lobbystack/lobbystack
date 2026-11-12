# ADR 0012: agents share a workspace, and each channel has one agent

A business can run several agents. They share what the business knows, and each differs in how it behaves and where it answers. A phone number, widget or Instagram account belongs to one agent, and agents themselves cost nothing on paid plans.

## Status

Accepted on 2026-11-01. Not built yet. See [the spec](../specs/agents-and-navigation.md).

## Decision

- A workspace holds knowledge, services, employees, the calendar, contacts and conversations. A workspace is what operators call a business in the dashboard, and code keeps the word `business`.
- An agent holds its name, voice, instructions, rules and channels. It can have no channels.
- A channel belongs to exactly one agent, and holds only its own appearance, such as widget colours.
- After-hours handling on one number is a rule inside that agent.
- Each location stays its own workspace.
- Free includes one agent, and paid plans include unlimited agents. Allowance stays per business, shared across its agents. Extra phone numbers are a paid add-on.

## Rationale

A clinic's address, prices and staff don't change from one line to the next. Keeping knowledge on the workspace means an operator fixes a wrong answer once, and the fix reaches every agent. Some products put data sources on each agent, which suits a company running unrelated bots, but it would make our operators copy the same facts around.

One agent per channel keeps it clear who answered and which settings to change. We also considered one worker per channel type, with a phone receptionist and a chatbot set up separately. That would make a business set up the same behaviour again for each channel, so an agent spans channels instead.

We don't charge for agents because an agent costs almost nothing by itself. Allowance already meters minutes and chats, and a phone number is the part with a real monthly cost. Unlimited agents remove a reason to hesitate, and the add-on keeps the real cost visible.

## Consequences

- Two agents that need different facts can't have them until per-agent knowledge exists. The `feat/inbox-calendar-staff` branch has opt-out tables for that case, and the first build leaves them out.
- A workspace can't send one number to two agents by time of day. It writes a rule inside one agent, or buys a second number.
- Unlimited agents would let someone run unrelated companies in one workspace. The shared allowance, shared knowledge and the number limit make that a poor fit, but nothing blocks it.
- Reversing this means moving knowledge rows to agents and repricing plans, so a change needs a migration and a pricing decision.

## Amendment, 2026-11-10: knowledge can belong to one agent

Knowledge stays shared by default, and an agent can now differ from it in two ways. See [the spec](../specs/agent-knowledge.md).

- An agent can have sources of its own: websites, files, FAQs and text that no other agent answers from.
- An agent can turn a shared source off for itself, or one page of a shared website. Every shared source starts on for every agent, so a fix on the business Knowledge page still reaches each agent that hasn't opted out.

Services, employees, hours and the business summary stay shared. The summary and the hours read only shared sources, so one agent's facts never change what the business says about itself. Migration 0215 moved the summary from the default agent to `businesses`.

This replaces the first consequence above: two agents that need different facts can have them now. The opt-outs live in `agent_knowledge_exclusions`, and migration 0208 adds them with `agent_id` on knowledge documents and entries.
