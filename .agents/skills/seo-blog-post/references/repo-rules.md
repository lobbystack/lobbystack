# Repo rules for a blog post

The marketing site lives in `apps/admin`. These rules come from `apps/admin/src/marketing/content/collections.ts`, `src/marketing/i18n/i18n.test.ts`, `src/marketing/lib/comparison-blog.test.ts`, `src/marketing/lib/seo.ts`, and `src/marketing/lib/blog-faqs.ts`, all under `apps/admin`. If a test or the schema disagrees with this file, the code wins. Update this file when you notice a difference.

## Files for one post

```
apps/admin/content/blog/<slug>.md
apps/admin/content/blog/fr/<slug>.md
apps/admin/content/blog/es/<slug>.md
apps/admin/content/blog/sr/<slug>.md
apps/admin/public/illustrations/<slug>-hero.webp              # shared by all four
apps/admin/src/marketing/i18n/translated-base-paths.ts        # add "/blog/<slug>/"
```

`i18n.test.ts` fails unless each locale folder has a post for every English `canonicalSlug`. Adding `/blog/<slug>/` to `translatedBasePaths` turns on the hreflang alternates between the four versions and lets the proxy send visitors to their language. Add it after the last `/blog/…` entry.

The slug is the primary keyword in kebab case, such as `ai-answering-service-for-plumbers`. It stays in English in every locale.

## Frontmatter

```yaml
---
title: "…"            # 5–120 chars by schema; keep it ≤ 60 so Google doesn't cut it off
seoTitle: "…"         # optional, 18–60; the <title> when the H1 should differ
description: "…"      # 70–200 by schema; aim for 140–160 and include the primary keyword
pubDate: 2026-10-09T09:00:00-04:00
updatedDate: 2026-10-09T09:00:00-04:00   # set it on a refresh; required on comparison posts
author: "LobbyStack Team"                # fr "Équipe LobbyStack", es "Equipo de LobbyStack", sr "LobbyStack tim"
category: "Guides"                       # in use: "Guides", "Comparisons", "Product updates"
featured: false
coverImage: "/illustrations/<slug>-hero.webp"
coverImageAlt: "…"                       # 20–180 chars, translated in each locale
locale: "en"                             # "fr" | "es" | "sr"
canonicalSlug: "<slug>"
---
```

Wrap string values in double quotes. The comparison test reads frontmatter with a regex that only matches `key: "value"`.

## Cover image

- Use a 1672 × 941 WebP at `apps/admin/public/illustrations/<slug>-hero.webp`. The comparison test checks the format and size, and the other posts use the same size.
- Make it with the bundled script, which renders the house style: a light beige card with a small dot pattern and the English title in black Geist type. Don't use an AI image generator; the owner asked for these.

  ```bash
  node .agents/skills/seo-blog-post/scripts/make-cover.mjs <slug> "<English title>" "Guide"
  ```

  The last argument is the small label above the title ("Guide", "Comparison", "Pricing"). All four locales share one cover, so the text stays in English. Describe it in each locale's `coverImageAlt`.
- Never fake a product screenshot. Use the script's card or a real screenshot from `apps/admin/public/screenshots/`.

## Competitor posts ("X alternative", "LobbyStack vs X")

Add the slug to `competitorSlugs` in `apps/admin/src/marketing/lib/comparison-blog.test.ts`. A post that compares categories or quotes many vendors' prices, without being about one competitor, goes in the `comparisonSlugs` extras instead. Those extras get every rule below except the required strings table, which applies to `competitorSlugs` only. The test then requires:

- `title` and `seoTitle` of 60 characters or fewer in every locale (so every locale needs a `seoTitle`), a `description` of 140 to 170, a valid `updatedDate`, and the same `coverImage` across all four locales
- no em dashes, and none of these phrases: "Here's the thing", "The uncomfortable truth", "Let that sink in", "In today's fast-paced", "At the end of the day"
- these exact strings in each locale:

| Locale | Must contain |
|---|---|
| en | `30 voice minutes`, `US or Canadian number free for 14 days`, `## Choose LobbyStack`, `## Verdict` |
| fr | `30 minutes vocales`, `numéro américain ou canadien gratuit pendant 14 jours`, `## Choisissez LobbyStack`, `## Verdict` |
| es | `30 minutos de voz`, `número de EE. UU. o Canadá gratis durante 14 días`, `## Elija LobbyStack`, `## Veredicto` |
| sr | `30 minuta razgovora`, `broj iz SAD ili Kanade besplatno 14 dana`, `## Izaberite LobbyStack`, `## Zaključak` |

- and none of these: "no telephone number" or "all features" in English, "LobbyStack includes fewer", "comparison is close", "Rosie wins", their French equivalents, or any Cyrillic character in Serbian

Copy the section order from a recent competitor post, such as `upfirst-alternative.md`, and keep its tone: fair to the competitor, specific on price and limits, and dated.

## Structured data

`src/marketing/lib/seo.ts` builds `BlogPosting` JSON-LD from the frontmatter for every post. Don't write JSON-LD inside the markdown.

`blog-faqs.ts` adds `FAQPage` markup when a post has an H2 section with at least two H3 headings that end in a question mark. Each answer is the text up to the next heading. Use that shape for a post's FAQ, and leave it out when the questions aren't real ones people search.

The site also serves a markdown copy of each post for AI crawlers, and `scripts/marketing/indexnow.mjs` pings IndexNow for changed pages at release. Neither needs anything from you.

## Internal links

- Link to three to five existing posts or solution pages, using root-relative paths with a trailing slash: `/blog/ai-receptionist-savings/`, `/solutions/ai-receptionist-for-hvac/`, `/missed-call-revenue-calculator/`.
- Translations use the localized path: `/fr/blog/…`, `/es/solutions/…`, `/sr/…`.
- Add a link back to the new post from one or two related existing posts, in all four locales. A new post with no internal links pointing at it is slow to get crawled and ranked.
- Don't link to `/comparison/` or `/compare/` paths. They're retired and redirect to `/blog/`.

## Verify

From the repo root:

```bash
pnpm --filter @lobbystack/admin exec vitest run src/marketing
pnpm --filter @lobbystack/admin typecheck
pnpm --filter @lobbystack/admin build
pnpm --filter @lobbystack/admin marketing:validate
```

`marketing:validate` reads `apps/admin/.marketing-dist`, which the build writes, so run it after the build.
