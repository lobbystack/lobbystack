# Spec: agent-specific knowledge

Status: ready-for-agent.

[ADR 0012](../adr/0012-agents-share-a-workspace.md) put knowledge on the workspace, so every agent answers from the same sources. An after-hours agent or a second location's front desk sometimes needs facts the others shouldn't give, or must skip a page the others use. This spec lets one agent add sources of its own and turn shared ones off for itself. Services and employees stay shared.

## What operators see

### An agent's Specific knowledge page

Each agent's menu gets a **Specific knowledge** row between Rules and Channels, at `/agents/[agentId]/knowledge`. The page has two tables:

- **Only this agent**: websites, files, FAQs and text the operator adds here. They use the same sheets and ingestion as the business Knowledge page. No other agent reads them.
- **Shared with every agent**: the business's sources, one row each, with a switch that turns the source off for this agent. Every switch starts on. A shared website opens its pages dialog, where the agent can turn single pages off for itself.

Turning something off here changes nothing for other agents, and nothing on the business Knowledge page.

### The business Knowledge page

- One row per source. A website is one row with its page count. Each file, FAQ entry and text is one row.
- Clicking a website row opens a dialog that lists its pages. There the operator turns pages off or on, removes pages, and re-imports the site.
- Unanswered questions stay at the bottom. An answer written there always becomes a shared entry.
- The page lists shared sources only. An agent's own sources show on that agent's page.

### Selecting several rows

Tables show no checkboxes until the operator clicks **Select** above the table. Selection mode adds a checkbox per row, a select-all checkbox, and a bar with the count and its actions. **Cancel** or Escape leaves it. Both pages use one shared component.

| Table | Actions |
|---|---|
| Business Knowledge | Delete, Turn off, Turn on, Re-import (websites only) |
| Agent: only this agent | Delete, Turn off, Turn on, Re-import (websites only) |
| Agent: shared with every agent | Turn off for this agent, Turn on |

### Removed

The agent menu's **Shared with every agent** row and page go. `/agents/[agentId]/shared` redirects temporarily to `/agents/[agentId]/knowledge`, because old links and emails point to it.

## Data

Migration `0208_agent_knowledge.sql` makes the smallest change that keeps today's tables:

- `knowledge_documents.agent_id` and `knowledge_snippets.agent_id`: null for a shared source, else the one agent that uses it. A composite foreign key on `(business_id, agent_id)` keeps a row from naming another business's agent. It's deferred and has no cascade, like the channel links in 0184, because agents are archived and never deleted.
- `knowledge_documents.website_document_id`: for a crawled page, the website document that imported it. The migration fills it for existing pages from the oldest website import on the same host. `ON DELETE SET NULL` keeps the public API's single-document delete as it is.
- `knowledge_documents.source_active`: the whole source's switch. A website keeps it on its import document, and it covers every page that names that document. `active` stays each page's or file's own switch, so turning a website off and on again keeps the pages someone turned off.
- `agent_knowledge_exclusions`: one row per thing an agent turned off. It names a document or a snippet, and a `scope` of `source` (a whole website, file or entry) or `page` (one page). The table has row-level security enabled and forced, with the usual tenant policy.

A website is the import document plus the pages that name it. Pages saved before this migration with no import left are grouped by host within the same scope, as `deleteWebsiteKnowledge` does today. Adding an agent-only website on a host that's already a source in another scope returns `409`, because `knowledge_documents_business_url_unique` allows one row per URL.

## Answering

Retrieval filters in SQL. For agent `A`, a chunk counts when its document:

- is indexed, `active` and `source_active`, and its website document, if any, is `source_active`
- is shared or belongs to `A`
- has no exclusion for `A` on itself, and no `source` exclusion for `A` on its website document

`searchKnowledgeEvidence` takes an `agentId`. Without one, it uses the default agent, as a flat snapshot does. Agent-core passes `snapshot.agentId`, so calls through delegation, chat, texts and Instagram all search as the agent that answers. A paused agent's snapshot projects the default agent, so it searches as the default agent too.

The snapshot stays one per business, and knowledge in it stays snapshot-based:

- The flat `knowledgeSnippets` and `knowledgeDigest` are the default agent's view, so old readers keep working.
- `agents[]` entries carry their own `knowledgeSnippets` and `knowledgeDigest` only when they differ from the default agent's. `snapshotForAgent` takes them when present.
- Adding, removing or switching a source or exclusion refreshes the snapshot, as knowledge changes do today.

The business summary and the opening hours read from knowledge use shared sources that are on for the business. A business with one agent sees no change in answers.

## API

The public API stays stable and only grows:

- Knowledge sources and entries gain `agent_id`, null for shared ones.
- `/v1/knowledge` keeps listing every document and entry. Creating through it makes shared sources.

The dashboard adds operator routes under `/api/knowledge/sources` for the grouped list, a website's pages, and the batch actions. Uploads, website imports and text entries accept an optional `agentId`.

## Tests

- Unit: grouping, the snapshot projection, the selection component, the menu.
- Integration against PostgreSQL: an agent-only source isn't used by another agent, a shared source off for one agent stays on for the others, one page off for one agent, a whole website off, and RLS on the new table.
- E2E: the business page shows a website as one row and turns a page off in its dialog; an agent adds an FAQ of its own and turns a shared source off; selecting two rows and deleting them.
- `voice:eval`, since call answers can change.

## Open questions

- **Agent-only sources on the business page:** they show only on their agent's page. A later version could list them on the business page with the agent's name.
- **Archived agents:** their own sources stay, unused, and count toward knowledge storage. Archiving could offer to delete them.
- **Moving a source between agents, or making one shared:** not built. An operator deletes it and adds it again where it belongs.
- **Business summary and hours:** they ignore agent-only sources, so an agent's own opening hours don't change the business's.
- **Deploy window:** pages crawled by the old worker while a release drains have no `website_document_id`. Retrieval doesn't see them as part of their website until the next re-import, so a website switched off in that window can still answer from those pages. The listing groups them by host.
- **Same website in two scopes:** refused with `409`, as above.
