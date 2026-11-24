# OpenSEO calls for the blog

OpenSEO is an MCP server that wraps DataForSEO keyword and SERP data and adds the lobbystack.com Search Console property. Every tool takes `projectId`; the lobbystack.com project is `ec1da894-23b8-4d12-824a-a25a47ffeadc` (`list_projects` confirms it). Tools that take `locationCode` and `languageCode` default to the project's market, United States and English.

Paid tools charge credits. A post usually takes 10 to 15 paid calls. Keep a run under 2,000 credits, and ask the user before a planned batch above that.

## Markets

| Locale | Market | `locationCode` | `languageCode` | Verified |
|---|---|---|---|---|
| en | United States (primary) | 2840 | en | yes |
| en | Canada | 2124 | en | |
| fr | Canada | 2124 | fr | yes |
| fr | France | 2250 | fr | yes |
| es | Mexico | 2484 | es | yes |
| es | Spain | 2724 | es | |
| sr | Serbia | 2688 | sr | yes |

Volumes seen in October 2026, as a sense of scale:

- **US:** "ai receptionist" 49,500 (a spike, with a baseline near 5,400), "ai answering service" 3,600 (difficulty 29)
- **France:** "agent vocal ia" 260, "standard téléphonique ia" 170, "réceptionniste ia" 90
- **French Canada:** "réceptionniste virtuelle" 30
- **Mexico:** "recepcionista virtual" 50
- **Serbia:** "virtuelni asistent" 140

"réceptionniste ia" (French Canada), "recepcionista ia" (Mexico), and "ai recepcionar" (Serbia) returned no data at all.

## Free tools

- `whoami`: connection check.
- `get_project_context`: the project's research log. Read it before buying research an earlier session already did. Add to it with `update_project_context` and `appendResearchLog`.
- `get_search_console_performance`: clicks, impressions, CTR and average position from lobbystack.com's Search Console, over up to 16 months. `dimensions: ['query','page']` maps each query to the LobbyStack pages Google shows for it, which is the best cannibalization check. To see one page's queries, filter on `{dimension: 'page', operator: 'equals', expression: '<full URL>'}`.
- `get_search_opportunities`: pages ranking 4 to 20, scored by demand and how reachable they are.

## Paid tools

| Job | Tool | Notes |
|---|---|---|
| What lobbystack.com ranks for | `get_ranked_keywords` | `target: "lobbystack.com"`. Rows carry keyword, URL, rank, volume, intent. |
| Metrics for keywords you have | `get_keyword_metrics` | Up to 700 keywords. Returns `search_volume`, `keyword_difficulty`, `main_intent`, `cpc`, `competition`, and monthly trends unless `includeMonthlyTrends: false`. |
| Expand seeds into more keywords | `research_keywords` | 1 to 5 `seeds`, each with its own market. Set `resultLimit` (default 150). |
| Live Google results | `get_serp_results` | 1 to 10 `queries` per call. |
| Who competes for a keyword set | `find_serp_competitors` | Pass `excludeDomains: ["lobbystack.com"]`. |
| A competitor's keywords | `get_domain_keyword_suggestions` | Compare with `get_ranked_keywords` for lobbystack.com to find gaps. Keep to keywords on the receptionist and answering-service topic; competitors rank for plenty that has nothing to do with it. |

## Quirks

- **The SERP shows that an AI Overview or People Also Ask box exists, not what it says.** Items of type `ai_overview` and `people_also_ask` come back with empty fields. Take the questions people ask from question-form keywords in the `research_keywords` rows and from Search Console queries, and read the AI Overview yourself with a web search if the brief needs it.
- **A missing difficulty isn't a low one.** Keywords without a difficulty score come back with null. Check the SERP before you call one easy.
- **Watch for spikes.** Compare `search_volume` with the monthly trend; plan on the baseline.
- **Check the SERP when intent says "navigational".** That label often just means a brand name ranks there.
- **Some markets come from Google Ads data**, with volume and CPC but no difficulty or intent.
- **Keyword data runs weeks behind.** For a fast-moving query, trust the live SERP and Search Console.
