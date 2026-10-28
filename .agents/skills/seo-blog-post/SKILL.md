---
name: seo-blog-post
description: Research and write a LobbyStack blog post for search using live DataForSEO data, then ship it in English, French, Spanish, and Serbian on the marketing site in apps/admin. Use whenever someone wants a new blog post, article, guide, comparison, or "X alternative" post for lobbystack.com, asks what the blog should cover next, wants keyword research for a post, or wants to refresh an existing post so it ranks, even if they don't mention DataForSEO, SEO, or translations.
---

# SEO blog post for LobbyStack

This skill runs the whole path from keyword to merged-ready post:

context → topic → keywords → SERP and AI-answer check → brief (user approves) → English draft → edit → translate → wire into the site → verify

Other skills supply the craft at each step; load each one when you reach its step. This skill supplies the data calls, the decisions between steps, and the repo rules that make the build and tests pass.

## 0. Load context

- Read `.agents/product-marketing.md` if you have it; it stays on your machine, outside git. It holds positioning, pricing, proof points, and words to avoid. Every product claim in the post has to match it or the live site. If they disagree, trust the code and live site, and tell the user the doc is stale.
- Check DataForSEO is connected: call `mcp__dataforseo__api_request` with `GET /v3/appendix/user_data` (free). A `status_code` of 20000 means it works. If the tool is missing or auth fails, stop and ask the user to reconnect it. Never estimate search volumes from memory, because the whole point of the brief is real numbers.
- Read [references/dataforseo.md](references/dataforseo.md) before the first paid call. It has the endpoints, request bodies, market codes, and quirks of this API.

## 1. Pick the topic

- **The user named a topic or keyword:** go to step 2.
- **The user asked what to write:** load `content-strategy` and feed it DataForSEO data in place of the Ahrefs or Semrush exports it expects: our ranked keywords, keyword gaps against two or three competitors, and keyword ideas from seed terms. Return a shortlist of 5 to 10 topics (keyword, US volume, difficulty, intent, why we can win, which existing page it supports) and let the user pick.
- **Check for cannibalization before going further.** Grep the titles, `seoTitle`s, and descriptions in `apps/admin/content/blog/*.md` and the solution pages (`apps/admin/src/marketing/lib/seo-landing-pages.ts`, its `fr-`, `es-`, and `sr-` copies, and `apps/admin/src/marketing/lib/solution-details.ts`) for the keyword. Also check the `ranked_keywords` result for a LobbyStack URL already ranking for it. If a page already targets the query, propose refreshing that page (the `copy-editing` skill has a content-refresh mode) instead of writing a new one. Two LobbyStack pages chasing one query split the rankings between them.

## 2. Keyword research

Run the calls in the reference file: `keyword_overview` for the candidate, then `keyword_suggestions` and `related_keywords` to find secondary terms. Choose:

- one primary keyword
- 3 to 8 secondary keywords with the same intent, ones a single page could rank for together
- the questions people ask, from `people_also_ask` in step 3

How to judge a keyword for lobbystack.com today:

- **The domain is young.** In October 2026 it ranked for about a dozen US keywords, all between positions 29 and 95. Re-check with `ranked_keywords` each session. Until that changes, favor keyword difficulty of 20 or less, and SERPs where the top 10 has forums, YouTube, thin listicles, or small sites. A 90-a-month keyword we can reach page one for is worth more than a 49,000-a-month keyword we can't.
- **Watch for spikes.** Compare `search_volume` with the `monthly_searches` history. "ai receptionist" jumped from about 5,400 to 450,000 in August 2026. Plan on the baseline, not the spike.
- **CPC signals buyer intent.** A keyword with a $30 to $160 CPC means advertisers make money from that traffic, so those visitors are close to buying.

## 3. Check the SERP and AI answers

- Run `serp/google/organic/live/advanced` (depth 10) for the primary keyword. Note the format that ranks (listicle, guide, comparison, tool), who ranks, what the AI Overview says and which pages it cites, the People Also Ask questions, and any Reddit or forum threads.
- Load `ai-seo` to decide how the post should be built so AI answers cite it. Optionally run `llm_mentions/search_mentions` for the primary keyword on `google` and `chat_gpt` to see which domains AI answers already cite.
- Fetch the top two or three ranking pages with WebFetch and find what they miss: out-of-date prices, no real call workflow, no French support, vague setup steps. That gap is the post's angle.

## 4. Write the brief and stop for approval

Show the user:

- the slug, the primary and secondary keywords with US volume, difficulty, and intent, and the localized primary keyword for fr, es, and sr (step 7)
- the search intent and the format that ranks
- the angle: what this post says that the current top 10 doesn't
- an outline of H2s and H3s, marking which H2 answers which People Also Ask question
- three to five internal links: existing posts or solution pages this post links to, and which of them should link back to it
- the post type, standard or competitor, because competitor posts carry extra test rules
- how many DataForSEO calls you made

Wait for a yes before you write. A wrong keyword caught here costs one message. Caught after drafting, it costs four translated posts.

## 5. Write the English post

- Load `blog-post` for structure, and take every path from [references/repo-rules.md](references/repo-rules.md). Skip its "researcher" subagent step, because the approved brief is the research.
- For "X alternative", "X vs Y", and "best X" posts, load `competitors` for the format, and follow the competitor rules in [references/repo-rules.md](references/repo-rules.md).
- Apply `ai-seo`: answer the primary query in the first 40 to 60 words, write H2s as the questions people search, add a comparison table when the topic has options, link a source for every number, and date prices ("as of October 2026").
- Take pricing and features from `.agents/product-marketing.md` and the live site. Take competitor facts from the competitor's own current pages and note the date you checked. Never invent statistics, testimonials, or customer names. Write `[NEED: …]` and list it in your final report.

## 6. Edit

1. Load `copy-editing` and run its seven sweeps on the draft. The "Prove It" and "Specificity" sweeps catch the unsupported claims SEO posts tend to collect.
2. Load `stop-slop` last, as the final pass for AI tells. Two exceptions apply to SEO posts: question-style H2s and FAQ questions are fine even though stop-slop discourages sentences that start with a question word, and keep the exact keyword phrase even when it reads a little stiff.
3. Use no em dashes anywhere. A test enforces this on comparison posts, and the rest of the blog follows it too.

The `copywriting` skill is for landing pages and CTAs. Use it only for the closing call-to-action section if that section needs work, not for the article body.

## 7. Translate into fr, es, and sr

- Localize; don't translate word for word. Before translating, run one `keyword_overview` call per locale with three to five candidate phrases in that locale's market (codes are in the reference file). Use the phrase with the most volume in the title, description, first paragraph, and one H2. These markets are small (tens to low hundreds of searches a month), so one call per locale is enough. If none of the phrases returns data, use the wording the existing posts in that locale already use.
- Copy the frontmatter shape from an existing post in the same locale: the localized `author`, the same `canonicalSlug` and `coverImage`, a translated `coverImageAlt`, and `locale` set to the locale.
- Use localized internal links (`/fr/blog/…`, `/es/blog/…`, `/sr/blog/…`).
- Serbian uses Latin script only. A test fails on any Cyrillic character.
- Run the step 6 checks on every translation as well.

## 8. Wire it into the site

Follow [references/repo-rules.md](references/repo-rules.md): frontmatter limits, route registration, cover image, competitor test registration, structured data, and internal links back from existing pages.

## 9. Verify and report

From the repo root:

```bash
pnpm --filter @lobbystack/admin exec vitest run src/marketing
pnpm --filter @lobbystack/admin typecheck
pnpm --filter @lobbystack/admin build
pnpm --filter @lobbystack/admin marketing:validate
```

Then report:

- the files you added or changed
- a table of the primary and secondary keywords with volume and difficulty
- the number of DataForSEO calls you made
- every `[NEED: …]` placeholder left in the posts
- anything you couldn't verify, such as a competitor price you couldn't confirm on their site
