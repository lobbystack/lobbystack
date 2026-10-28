# DataForSEO calls for the blog

Every call goes through one tool, `mcp__dataforseo__api_request`, with `method`, `path`, and `data`. Live endpoints take one task per request, so `data` is an array holding one object. Look up an endpoint you don't see here with `mcp__dataforseo__docs_index` (pass a `section` such as "DataForSEO Labs API"), then read it with `mcp__dataforseo__docs_search`.

A full post usually takes 8 to 12 calls. In October 2026, a 40-call run (five research sweeps, 12 SERPs, and the inputs for one brief) cost $1.02, about 2.5 cents a call. The LLM Responses and LLM Scraper endpoints cost more, so ask the user before running them. Check https://dataforseo.com/pricing before you put any call inside a loop.

## Markets

| Locale | Market | `location_code` | `language_code` | Verified |
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

## Calls

### Check the connection (free)

`GET /v3/appendix/user_data`. A `status_code` of 20000 means it works.

### What lobbystack.com already ranks for

`POST /v3/dataforseo_labs/google/ranked_keywords/live`

```json
[{"target": "lobbystack.com", "location_code": 2840, "language_code": "en", "limit": 50,
  "order_by": ["keyword_data.keyword_info.search_volume,desc"]}]
```

Each item has `keyword_data` (volume, difficulty, intent) and `ranked_serp_element.serp_item` (our `relative_url` and `rank_absolute`).

### Metrics for keywords you already have

`POST /v3/dataforseo_labs/google/keyword_overview/live`

```json
[{"keywords": ["ai answering service", "ai receptionist for plumbers"], "location_code": 2840, "language_code": "en"}]
```

Read `keyword_info.search_volume`, `keyword_info.monthly_searches`, `keyword_info.cpc`, `keyword_properties.keyword_difficulty`, and `search_intent_info.main_intent`. When a keyword isn't in DataForSEO's database, the API leaves it out of the results instead of returning zero. For a phrase that gets dropped, `POST /v3/keywords_data/google_ads/search_volume/live` with the same body returns Google Ads volume for any phrase.

### Expand a seed into more keywords

Phrases that contain the seed: `POST /v3/dataforseo_labs/google/keyword_suggestions/live`

```json
[{"keyword": "ai receptionist", "location_code": 2840, "language_code": "en", "limit": 50,
  "filters": [["keyword_info.search_volume", ">", 10]],
  "order_by": ["keyword_info.search_volume,desc"]}]
```

Google's "related searches": `POST /v3/dataforseo_labs/google/related_keywords/live` takes `keyword`, `location_code`, `language_code`, `"depth": 1`, and `"limit": 50`. Its items nest under `keyword_data`, so filter and sort on `keyword_data.keyword_info.search_volume`.

Same topic with different words: `POST /v3/dataforseo_labs/google/keyword_ideas/live` takes `"keywords": [seeds]` with `limit`.

Difficulty for up to 1,000 keywords at once: `POST /v3/dataforseo_labs/google/bulk_keyword_difficulty/live` takes `"keywords": [...]`.

### Keyword gaps against a competitor

Keywords the competitor ranks for and LobbyStack doesn't:

`POST /v3/dataforseo_labs/google/domain_intersection/live`

```json
[{"target1": "smith.ai", "target2": "lobbystack.com", "intersections": false,
  "location_code": 2840, "language_code": "en", "limit": 50,
  "filters": [["keyword_data.keyword", "like", "%receptionist%"], "or",
              ["keyword_data.keyword", "like", "%answering%"]],
  "order_by": ["keyword_data.keyword_info.search_volume,desc"]}]
```

Keep the topic filter. Without it, the gaps against Smith.ai start with "business profile google" and "phonetic nato alphabet", old blog traffic that has nothing to do with receptionists.

Other useful competitor calls:

- `competitors_domain/live` with `"target": "lobbystack.com"` lists the domains competing for the same keywords.
- `relevant_pages/live` with `"target": "<competitor>"` and `"limit": 20` lists their pages that get the most traffic, which shows the formats that work in this niche.

### The live SERP for the primary keyword

`POST /v3/serp/google/organic/live/advanced`

```json
[{"keyword": "ai answering service", "location_code": 2840, "language_code": "en", "depth": 10,
  "people_also_ask_click_depth": 1}]
```

Items arrive in page order with a `type` field: `ai_overview` (the answer text and the `references` it cites), `organic`, `people_also_ask`, `discussions_and_forums`, `video`, and `related_searches`. Keep `depth` at 10, because this response is large even trimmed.

### What AI answers say and cite

`POST /v3/ai_optimization/llm_mentions/search_mentions/live`

```json
[{"target": [{"keyword": "answering service", "search_scope": ["question"], "match_type": "partial_match"}],
  "platform": "chat_gpt", "location_code": 2840, "language_code": "en", "limit": 10,
  "order_by": ["ai_search_volume,desc"]}]
```

Keep `search_scope` and `match_type`, and use a short core phrase. With the defaults (scope `any`, `word_match`), "answering service cost" matched 43,810 mentions and returned unrelated top-volume questions such as "why are people moving out of greenville, sc?". The call above returned 86 on-topic questions.

This returns real questions with each AI answer, the `sources` it cited, and its `ai_search_volume`. Set `platform` to `google` for AI Overviews or `chat_gpt` for ChatGPT, which only covers US English. To see where LobbyStack itself gets cited, use `"target": [{"domain": "lobbystack.com"}]`.

## Quirks

- **Always set `limit`.** Responses are trimmed by default but can still run to thousands of lines. `noAiMode: true` returns the full schema with `cost` fields, so use it only when you need a field the trimmed response leaves out.
- **A missing difficulty passes a difficulty filter.** `["keyword_properties.keyword_difficulty", "<=", 20]` still returns keywords that have no difficulty score, such as "ringcentral ai receptionist". Check the field before you call a keyword easy.
- **Ignore `detected_language` and `is_another_language`.** They're unreliable on short phrases: the API labeled "ai receptionist" as Italian.
- **Check the SERP when intent says "navigational".** That label often just means a brand name ranks there. The SERP shows the real intent.
- **Labs data runs weeks behind.** `last_updated_time` shows how old each number is. For a fast-moving query, trust the live SERP over Labs.
