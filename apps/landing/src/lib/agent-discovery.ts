import { createHash } from "node:crypto"
import {
  DEFAULT_DESCRIPTION,
  DEFAULT_TITLE,
  SITE_URL,
  absoluteUrl,
} from "@/lib/seo"
import { seoLandingPageByPath } from "@/lib/seo-landing-pages"

export const CONTENT_SIGNAL = "ai-train=yes, search=yes, ai-input=yes"

export const AGENT_LINKS = [
  '</.well-known/api-catalog>; rel="api-catalog"; type="application/linkset+json"',
  '</openapi.json>; rel="service-desc"; type="application/vnd.oai.openapi+json"',
  '</docs/api/>; rel="service-doc"; type="text/html"',
  '</llms.txt>; rel="describedby"; type="text/plain"',
  '</feed.xml>; rel="alternate"; type="application/rss+xml"; title="LobbyStack RSS feed"',
  '</schemamap.xml>; rel="describedby"; type="application/xml"; title="LobbyStack schema map"',
  '</schema/page.json>; rel="describedby"; type="application/ld+json"; title="LobbyStack page schema graph"',
  '</schema/post.json>; rel="describedby"; type="application/ld+json"; title="LobbyStack blog schema graph"',
  '</.well-known/agent-skills/index.json>; rel="describedby"; type="application/json"; title="Agent skills discovery index"',
  '</.well-known/mcp/server-card.json>; rel="describedby"; type="application/json"; title="MCP server card"',
]

export const AGENT_LINK_HEADER = AGENT_LINKS.join(", ")

export const DISCOVERY_API_ANCHOR = absoluteUrl("/api")

export const markdownAlternatePath = (pathname: string) => {
  const normalized = pathname.endsWith("/") ? pathname : `${pathname}/`
  const hasLocalePrefix = normalized.startsWith("/fr/") || normalized === "/fr/"
  const localePrefix = hasLocalePrefix ? "/fr" : ""
  const basePath = normalized.replace(/^\/fr(?=\/|$)/, "") || "/"
  const localizedMarkdownBasePaths = new Set([
    "/",
    "/features/",
    "/pricing/",
    "/affiliate-program/",
    "/missed-call-revenue-calculator/",
    "/blog/",
    "/changelog/",
    "/docs/api/",
  ])

  const alternates: Record<string, string> = {
    "/compare/ai-receptionist-vs-virtual-receptionist/":
      "/compare/ai-receptionist-vs-virtual-receptionist.md",
    "/compare/ai-receptionist-vs-voicemail/":
      "/compare/ai-receptionist-vs-voicemail.md",
    "/": "/index.md",
    "/features/": "/features.md",
    "/pricing/": "/pricing.md",
    "/affiliate-program/": "/affiliate-program.md",
    "/missed-call-revenue-calculator/":
      "/missed-call-revenue-calculator/index.md",
    "/blog/": "/blog.md",
    "/changelog/": "/changelog.md",
    "/docs/api/": "/docs/api.md",
  }

  if (
    hasLocalePrefix &&
    !localizedMarkdownBasePaths.has(basePath) &&
    !basePath.startsWith("/blog/")
  ) {
    return undefined
  }

  if (alternates[basePath]) return `${localePrefix}${alternates[basePath]}`
  const seoLandingPage = seoLandingPageByPath(basePath)
  if (
    seoLandingPage?.group === "company" ||
    seoLandingPage?.group === "solution" ||
    seoLandingPage?.group === "comparison"
  )
    return `${localePrefix}${basePath.slice(0, -1)}.md`
  if (basePath.startsWith("/blog/"))
    return `${localePrefix}${basePath.slice(0, -1)}.md`

  return undefined
}

export const apiCatalog = {
  linkset: [
    {
      anchor: DISCOVERY_API_ANCHOR,
      "service-desc": [
        {
          href: absoluteUrl("/openapi.json"),
          type: "application/vnd.oai.openapi+json",
          title: "LobbyStack public agent-discovery OpenAPI description",
        },
      ],
      "service-doc": [
        {
          href: absoluteUrl("/docs/api/"),
          type: "text/html",
          title: "LobbyStack public API documentation",
        },
      ],
      describedby: [
        {
          href: absoluteUrl("/llms.txt"),
          type: "text/plain",
          title: "LobbyStack LLM context",
        },
        {
          href: absoluteUrl("/schemamap.xml"),
          type: "application/xml",
          title: "LobbyStack schema map",
        },
        {
          href: absoluteUrl("/schema/page.json"),
          type: "application/ld+json",
          title: "LobbyStack page schema graph",
        },
        {
          href: absoluteUrl("/schema/post.json"),
          type: "application/ld+json",
          title: "LobbyStack blog schema graph",
        },
        {
          href: absoluteUrl("/index.md"),
          type: "text/markdown",
          title: "LobbyStack homepage markdown summary",
        },
        {
          href: absoluteUrl("/features.md"),
          type: "text/markdown",
          title: "LobbyStack features markdown summary",
        },
        {
          href: absoluteUrl("/pricing.md"),
          type: "text/markdown",
          title: "LobbyStack pricing markdown summary",
        },
        {
          href: absoluteUrl("/affiliate-program.md"),
          type: "text/markdown",
          title: "LobbyStack affiliate program markdown summary",
        },
        {
          href: absoluteUrl("/missed-call-revenue-calculator/index.md"),
          type: "text/markdown",
          title: "LobbyStack missed call revenue calculator markdown",
        },
      ],
      status: [
        {
          href: absoluteUrl("/api/status"),
          type: "application/json",
          title: "LobbyStack public API status",
        },
      ],
    },
  ],
}

export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "LobbyStack Public Agent Discovery API",
    version: "0.1.0",
    description:
      "Public discovery endpoints for agents, crawlers, and integrators visiting lobbystack.com.",
  },
  servers: [{ url: SITE_URL }],
  paths: {
    "/api/status": {
      get: {
        summary: "Get public site status",
        operationId: "getPublicStatus",
        responses: {
          "200": {
            description: "The public discovery surface is available.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/StatusResponse" },
              },
            },
          },
        },
      },
    },
    "/.well-known/api-catalog": {
      get: {
        summary: "Get the API catalog linkset",
        operationId: "getApiCatalog",
        responses: {
          "200": {
            description: "RFC 9727 API catalog serialized as a JSON linkset.",
            content: {
              "application/linkset+json": {
                schema: { $ref: "#/components/schemas/ApiCatalog" },
              },
            },
          },
        },
      },
    },
    "/.well-known/agent-skills/index.json": {
      get: {
        summary: "Get the agent skills discovery index",
        operationId: "getAgentSkills",
        responses: {
          "200": {
            description: "Agent Skills Discovery index.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/AgentSkillsIndex" },
              },
            },
          },
        },
      },
    },
    "/.well-known/mcp/server-card.json": {
      get: {
        summary: "Get the MCP server card",
        operationId: "getMcpServerCard",
        responses: {
          "200": {
            description: "Machine-readable MCP server card.",
            content: {
              "application/json": {
                schema: { type: "object" },
              },
            },
          },
        },
      },
    },
    "/llms.txt": {
      get: {
        summary: "Get the compact LLM context file",
        operationId: "getLlmsTxt",
        responses: {
          "200": {
            description:
              "Plain-text product, feature, pricing, and discovery context.",
            content: {
              "text/plain": {
                schema: { type: "string" },
              },
            },
          },
        },
      },
    },
    "/feed.xml": {
      get: {
        summary: "Get the LobbyStack RSS feed",
        operationId: "getRssFeed",
        responses: {
          "200": {
            description: "RSS 2.0 feed for LobbyStack blog posts.",
            content: {
              "application/rss+xml": {
                schema: { type: "string" },
              },
            },
          },
        },
      },
    },
    "/schemamap.xml": {
      get: {
        summary: "Get the schema endpoint map",
        operationId: "getSchemaMap",
        responses: {
          "200": {
            description: "XML map of public structured-data endpoints.",
            content: {
              "application/xml": {
                schema: { type: "string" },
              },
            },
          },
        },
      },
    },
    "/schema/page.json": {
      get: {
        summary: "Get the page schema graph",
        operationId: "getPageSchemaGraph",
        responses: {
          "200": {
            description: "Corpus-wide JSON-LD graph for public pages.",
            content: {
              "application/ld+json": {
                schema: { type: "object" },
              },
            },
          },
        },
      },
    },
    "/schema/post.json": {
      get: {
        summary: "Get the blog post schema graph",
        operationId: "getPostSchemaGraph",
        responses: {
          "200": {
            description: "Corpus-wide JSON-LD graph for blog posts.",
            content: {
              "application/ld+json": {
                schema: { type: "object" },
              },
            },
          },
        },
      },
    },
    "/index.md": {
      get: {
        summary: "Get the homepage markdown summary",
        operationId: "getHomepageMarkdown",
        responses: {
          "200": {
            description: "Markdown summary of LobbyStack's homepage.",
            content: {
              "text/markdown": {
                schema: { type: "string" },
              },
            },
          },
        },
      },
    },
    "/features.md": {
      get: {
        summary: "Get the features markdown summary",
        operationId: "getFeaturesMarkdown",
        responses: {
          "200": {
            description: "Markdown summary of LobbyStack's public features.",
            content: {
              "text/markdown": {
                schema: { type: "string" },
              },
            },
          },
        },
      },
    },
    "/pricing.md": {
      get: {
        summary: "Get the pricing markdown summary",
        operationId: "getPricingMarkdown",
        responses: {
          "200": {
            description:
              "Markdown summary of LobbyStack's plans, included limits, plan features, and overage rates.",
            content: {
              "text/markdown": {
                schema: { type: "string" },
              },
            },
          },
        },
      },
    },
    "/affiliate-program.md": {
      get: {
        summary: "Get the affiliate program markdown summary",
        operationId: "getAffiliateProgramMarkdown",
        responses: {
          "200": {
            description:
              "Markdown summary of the LobbyStack Affiliate Program terms, payouts, and onboarding.",
            content: {
              "text/markdown": {
                schema: { type: "string" },
              },
            },
          },
        },
      },
    },
    "/missed-call-revenue-calculator/index.md": {
      get: {
        summary: "Get the missed call revenue calculator markdown",
        operationId: "getCalculatorMarkdown",
        responses: {
          "200": {
            description:
              "Markdown representation of the missed call revenue calculator tool.",
            content: {
              "text/markdown": {
                schema: { type: "string" },
              },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      StatusResponse: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["ok"] },
          service: { type: "string" },
          documentation: { type: "string", format: "uri" },
        },
        required: ["status", "service", "documentation"],
      },
      ApiCatalog: {
        type: "object",
        properties: {
          linkset: {
            type: "array",
            items: { type: "object" },
          },
        },
        required: ["linkset"],
      },
      AgentSkillsIndex: {
        type: "object",
        properties: {
          $schema: { type: "string", format: "uri" },
          skills: {
            type: "array",
            items: { type: "object" },
          },
        },
        required: ["$schema", "skills"],
      },
    },
  },
}

export const publicStatus = {
  status: "ok",
  service: "lobbystack.com public discovery",
  documentation: absoluteUrl("/docs/api/"),
}

export const mcpServerCard = {
  schemaVersion: "0.1.0",
  serverInfo: {
    name: "lobbystack-public-discovery",
    version: "0.1.0",
  },
  transport: {
    type: "webmcp",
    endpoint: absoluteUrl("/"),
  },
  capabilities: {
    tools: [
      {
        name: "get-site-summary",
        description:
          "Return a concise overview of LobbyStack, useful links, and public documentation URLs.",
      },
      {
        name: "get-navigation-links",
        description:
          "Return public LobbyStack navigation links grouped by features, pricing, documentation, or legal pages.",
      },
      {
        name: "get-pricing",
        description:
          "Return public LobbyStack pricing plan names, starting prices, included limits, overage rates, and links.",
      },
      {
        name: "get-features",
        description:
          "Return key public LobbyStack features, including call answering, booking, workflows, transfers, SMS, dashboard, and reporting.",
      },
      {
        name: "get-agent-discovery",
        description:
          "Return machine-readable discovery resources exposed by lobbystack.com.",
      },
      {
        name: "get-missed-call-calculator",
        description:
          "Return the Missed Call Revenue Calculator tool for contractors and home services.",
      },
    ],
    resources: [
      {
        uri: absoluteUrl("/llms.txt"),
        name: "LobbyStack LLM context",
        mimeType: "text/plain",
      },
      {
        uri: absoluteUrl("/features.md"),
        name: "LobbyStack features markdown summary",
        mimeType: "text/markdown",
      },
      {
        uri: absoluteUrl("/pricing.md"),
        name: "LobbyStack pricing markdown summary",
        mimeType: "text/markdown",
      },
      {
        uri: absoluteUrl("/affiliate-program.md"),
        name: "LobbyStack affiliate program markdown summary",
        mimeType: "text/markdown",
      },
      {
        uri: absoluteUrl("/openapi.json"),
        name: "LobbyStack public OpenAPI description",
        mimeType: "application/vnd.oai.openapi+json",
      },
      {
        uri: absoluteUrl("/missed-call-revenue-calculator/index.md"),
        name: "LobbyStack missed call revenue calculator markdown",
        mimeType: "text/markdown",
      },
    ],
    prompts: [],
  },
}

export const lobbystackDiscoverySkill = `# LobbyStack Discovery

Use this skill when an agent needs a concise, machine-readable orientation to LobbyStack's public website, documentation, and open-source project resources.

## Resources

- Website: ${absoluteUrl("/")}
- Product docs: https://docs.lobbystack.com/introduction
- API catalog: ${absoluteUrl("/.well-known/api-catalog")}
- OpenAPI description: ${absoluteUrl("/openapi.json")}
- LLM context: ${absoluteUrl("/llms.txt")}
- Features markdown: ${absoluteUrl("/features.md")}
- Pricing markdown: ${absoluteUrl("/pricing.md")}
- Affiliate program markdown: ${absoluteUrl("/affiliate-program.md")}
- Calculator markdown: ${absoluteUrl("/missed-call-revenue-calculator/index.md")}
- GitHub repository: https://github.com/lobbystack/lobbystack

## Guidance

1. Start with ${absoluteUrl("/llms.txt")} for a compact product overview.
2. Use ${absoluteUrl("/.well-known/api-catalog")} to discover public machine-readable resources.
3. Use ${absoluteUrl("/features.md")}, ${absoluteUrl("/pricing.md")}, and ${absoluteUrl("/affiliate-program.md")} for clean markdown summaries of the public site.
4. Use https://docs.lobbystack.com/introduction for product setup and self-hosting documentation.
5. Use ${absoluteUrl("/pricing/")} for canonical pricing details and ${absoluteUrl("/features/")} for canonical capability descriptions.
`

export const agentSkillsIndex = {
  $schema: "https://schemas.agentskills.io/discovery/0.2.0/schema.json",
  skills: [
    {
      name: "lobbystack-discovery",
      type: "skill-md",
      description:
        "Find LobbyStack public docs, API discovery metadata, pricing, features, and open-source resources.",
      url: absoluteUrl(
        "/.well-known/agent-skills/lobbystack-discovery/SKILL.md"
      ),
      digest: `sha256:${createHash("sha256")
        .update(lobbystackDiscoverySkill)
        .digest("hex")}`,
    },
  ],
}

export const homepageMarkdown = `---
title: ${DEFAULT_TITLE}
description: ${DEFAULT_DESCRIPTION}
url: ${absoluteUrl("/")}
---

# LobbyStack

${DEFAULT_DESCRIPTION}

## What LobbyStack Does

- Answers inbound calls around the clock.
- Uses business knowledge to answer common questions.
- Qualifies leads, books appointments, and routes urgent requests.
- Gives small businesses an auditable, open-source receptionist stack.

## Public Resources

- Features: ${absoluteUrl("/features/")}
- Pricing: ${absoluteUrl("/pricing/")}
- Affiliate program: ${absoluteUrl("/affiliate-program/")}
- Calculator: ${absoluteUrl("/missed-call-revenue-calculator/")}
- Features markdown: ${absoluteUrl("/features.md")}
- Pricing markdown: ${absoluteUrl("/pricing.md")}
- Affiliate program markdown: ${absoluteUrl("/affiliate-program.md")}
- Calculator markdown: ${absoluteUrl("/missed-call-revenue-calculator/index.md")}
- Documentation: https://docs.lobbystack.com/introduction
- API catalog: ${absoluteUrl("/.well-known/api-catalog")}
- OpenAPI: ${absoluteUrl("/openapi.json")}
- Agent skills: ${absoluteUrl("/.well-known/agent-skills/index.json")}
- GitHub: https://github.com/lobbystack/lobbystack

## Pricing Snapshot

- Free: $0/month with 30 voice minutes, 2 outbound call attempts, 10 alert SMS segments, and 100 MB knowledge base.
- Starter: $30/month or $288/year ($24/month effective) with 150 voice minutes, 20 outbound call attempts, 50 alert SMS segments, and 2 GB knowledge base.
- Pro: $100/month or $960/year ($80/month effective) with 500 voice minutes, 100 outbound call attempts, 200 alert SMS segments, and 10 GB knowledge base.
- Starter overage: $0.20 per voice minute, $0.02 per outbound call attempt, and $0.02 per alert SMS segment.
- Pro overage: $0.18 per voice minute, $0.02 per outbound call attempt, and $0.02 per alert SMS segment.
- Spam calls and calls under 10 seconds are excluded from usage, so they do not count against included voice minutes or paid-plan overages.
- Enterprise: custom pricing for higher volume, multiple numbers, multi-location routing, custom fallback rules, and self-hosting implementation support.
`

export const featuresMarkdown = `---
title: AI Receptionist Features for Calls and Booking
description: Public feature summary for LobbyStack's AI receptionist.
url: ${absoluteUrl("/features/")}
---

# LobbyStack Features

LobbyStack is an open-source AI receptionist for call-heavy small businesses. It answers phone calls, books appointments, captures details, follows up, and routes calls to a human when needed.

## Core Capabilities

- Call answering for every call, or only when a team is busy, closed, or unavailable.
- Plain-language workflows that let businesses describe what to ask, say, book, quote, transfer, and notify.
- Appointment booking with calendar availability, confirmations, reschedules, cancellations, and reminders.
- Business knowledge answers for FAQs, services, pricing, hours, policies, locations, and staff instructions.
- Quote handling for exact prices, starting prices, price ranges, or pricing callbacks.
- Lead qualification and structured caller detail capture.
- Human handoff through transfers, messages, and team notifications.
- Outbound calls for callbacks, reminders, confirmations, quote follow-ups, and missed-call recovery.
- Dashboard, call history, recordings, transcripts, summaries, contact profiles, analytics, and action-required views.
- Multilingual voice support.

## Every Plan Includes

Call answering, plain-language workflows, appointment booking, appointment confirmation texts, outbound calls, transfers, call summaries, email notifications, SMS notifications, unlimited concurrent calls, knowledge base, dashboard, and call history.
`

export const pricingMarkdown = `---
title: AI Receptionist Pricing for Small Businesses
description: Public pricing summary for LobbyStack's Free, Starter, Pro, and Enterprise plans.
url: ${absoluteUrl("/pricing/")}
---

# LobbyStack Pricing

LobbyStack has Free, Starter, Pro, and Enterprise options. Plans scale by usage instead of locking the basic receptionist features behind higher tiers.

## Plans

| Plan | Price | Included usage |
| --- | ---: | --- |
| Free | $0/month | 30 voice minutes, 2 outbound call attempts, 10 alert SMS segments, 100 MB knowledge base |
| Starter | $30/month or $288/year | 150 voice minutes, 20 outbound call attempts, 50 alert SMS segments, 2 GB knowledge base |
| Pro | $100/month or $960/year | 500 voice minutes, 100 outbound call attempts, 200 alert SMS segments, 10 GB knowledge base |
| Enterprise | Custom | Custom volume, multiple numbers, multi-location routing, custom fallback rules, and self-hosting implementation support |

## Overage Rates

- Starter voice overage: $0.20 per voice minute.
- Starter outbound call attempts: $0.02 per attempt after the included amount.
- Starter alert SMS segments: $0.02 per segment after the included amount.
- Pro voice overage: $0.18 per voice minute.
- Pro outbound call attempts: $0.02 per attempt after the included amount.
- Pro alert SMS segments: $0.02 per segment after the included amount.
- Spam calls and calls under 10 seconds are excluded from usage and do not count against included voice minutes or paid-plan overages.

## Common Answers

### Does the Free plan include voice minutes?

Yes. Free includes 30 voice minutes, 2 outbound call attempts, and 10 alert SMS segments.

### How do paid plans work?

Starter is $30/month or $288/year and includes 150 voice minutes. Pro is $100/month or $960/year and includes 500 voice minutes. Included usage resets monthly; unused minutes do not roll over. Additional voice usage is $0.20/minute on Starter and $0.18/minute on Pro.

### Do spam calls count toward usage?

No. LobbyStack excludes spam calls from usage, so wrong numbers, robocalls, and spam calls do not count against included voice minutes or paid-plan overages.

### Are calls under 10 seconds charged?

No. Calls under 10 seconds are excluded from usage and do not count against included voice minutes or paid-plan overages.
`

export const affiliateProgramMarkdown = (locale: "en" | "fr") => {
  if (locale === "fr") {
    return `---
title: Programme d'affiliation LobbyStack | 20 % de commission
description: Résumé public du programme d'affiliation LobbyStack.
url: ${absoluteUrl("/fr/affiliate-program/")}
---

# Programme d'affiliation LobbyStack

Parrainez des clients payants vers les forfaits hébergés LobbyStack et touchez une commission.

## Conditions du programme

| Terme | LobbyStack |
| --- | --- |
| Commission | 20 % |
| Durée | 12 premiers mois après attribution |
| Délai de retenue | 30 jours |
| Paiement minimum | 100 $ US |
| Mode de paiement | PayPal |

Les entreprises parrainées obtiennent 5 % de rabais sur les forfaits hébergés LobbyStack lorsqu'elles s'inscrivent via votre lien.

## Ce qui paie une commission

Vous touchez une commission uniquement sur les paiements de forfaits hébergés LobbyStack. L'auto-hébergement sans abonnement payant ne paie pas de commission.

## Comment commencer

1. Connectez-vous et ouvrez la page affiliation dans votre tableau de bord.
2. Ajoutez votre courriel PayPal.
3. Partagez votre lien avec des entreprises qui ont besoin d'un meilleur accueil téléphonique.

## Bon profil pour le programme

Agences, consultants, créateurs et opérateurs qui recommandent des outils aux PME, services à domicile, cliniques et salons.
`
  }

  return `---
title: LobbyStack Affiliate Program | Earn 20% Commission
description: Public summary of the LobbyStack Affiliate Program.
url: ${absoluteUrl("/affiliate-program/")}
---

# LobbyStack Affiliate Program

Refer paying customers to hosted LobbyStack plans and earn commission.

## Program terms

| Term | LobbyStack |
| --- | --- |
| Commission | 20% |
| Duration | First 12 months after attribution |
| Holding period | 30 days |
| Minimum payout | USD $100 |
| Payout method | PayPal |

Referred businesses get 5% off hosted LobbyStack plans when they sign up through your link.

## What pays commission

You earn commission on hosted LobbyStack plan payments only. Self-hosting without a paid LobbyStack subscription does not pay commission.

## How to get started

1. Sign in and open the affiliate page in your dashboard.
2. Add your PayPal email.
3. Share your link with businesses that need better phone coverage and appointment booking.

## Who should apply

Agencies, consultants, creators, and operators who recommend tools to small businesses, home services, clinics, and salons.
`
}

export const calculatorMarkdown = `---
title: Missed Call Revenue Calculator for Contractors - LobbyStack
description: Estimate weekly, monthly, and annual revenue at risk from missed contractor calls. Calculate how much you could recover with a 24/7 receptionist.
url: ${absoluteUrl("/missed-call-revenue-calculator/")}
---

# Missed Call Revenue Calculator for Contractors

Every missed call is a missed opportunity. Find out exactly how much revenue might be slipping through the cracks when you're on a job, driving, or after hours.

This missed call revenue calculator is built for contractors and home service businesses that book work by phone. Use it to put a dollar figure on unanswered calls from homeowners, property managers, and repeat customers before those jobs go to another company.

## What this missed call calculator measures

The calculator estimates booked revenue at risk, not total call volume. It filters your missed calls down to the ones that were likely real job opportunities, then applies your booking rate and average job value.

- **Missed calls per week**: Use the calls your team could not answer live. Include calls missed during jobs, while driving, at lunch, after hours, and on weekends.
- **Average job value**: Use completed revenue divided by completed jobs. If your work ranges from small service calls to big installs, start with the blended average.
- **% of calls that are real jobs**: Not every missed call is a buyer. This input removes spam, vendors, wrong numbers, and existing customers who did not need a new job booked.
- **Booking rate if answered**: Use the percentage of qualified phone leads that usually turn into an appointment, estimate, dispatch, or paid job when someone answers promptly.

## How the math works

We use a straightforward, conservative formula to calculate your revenue at risk. It's based on real metrics that drive contracting businesses:

monthly revenue at risk = missed calls per week × 4.3 × opportunity rate × booking rate × average job value

We multiply your weekly missed calls by 4.3 (the average weeks in a month) to get monthly calls. Then, we reduce that number to only the calls that are real jobs (opportunity rate) and the percentage of those you would typically win (booking rate). Finally, we multiply those lost jobs by your average job value.

For example, say you miss 10 calls per week. If half of those calls are real job opportunities, 40% would have booked, and your average job is worth $500, the calculator estimates about $4,300 in monthly revenue at risk. Change one input at a time to see which number has the biggest impact on your business.

## Why contractors miss revenue

- **On the Job Site**: When you're under a house, up on a roof, or operating machinery, you simply can't safely or professionally answer the phone.
- **Talking to a Customer**: Taking a call while speaking with a homeowner face-to-face is rude and costs trust. But ignoring the phone loses the new lead.
- **Driving Between Jobs**: If your hands are on the wheel, you can't write down a name, address, and job details. Customers hate repeating themselves later.
- **After Hours & Weekends**: Emergencies happen 24/7. If a pipe bursts at 9 PM and you don't answer, they immediately call the next plumber on Google.

## Why missed calls turn into lost jobs

Most homeowners do not treat voicemail like a waiting room. If a pipe is leaking, an AC unit is out, or a roof needs attention, they keep calling until someone answers. That means a missed call can become a booked job for the next contractor in the search results.

The loss is not just the call. It is the ad click, referral, truck roll, estimate, repair, installation, or recurring account that could have started with that first conversation. That is why this calculator focuses on revenue at risk instead of call volume alone.

## How to choose realistic inputs

The best missed call cost estimate comes from your own numbers. If you do not have perfect reporting yet, use conservative inputs first. You can always rerun the calculator with higher or lower assumptions.

- Pull missed-call counts from your phone system instead of guessing from memory.
- Use the last 30 to 90 days for average job value, especially if your work is seasonal.
- Keep the opportunity rate conservative if your phone gets a lot of sales calls or repeat customer questions.
- If you do not know your booking rate, start lower than you think and rerun the calculator with a best-case version.

## Missed call revenue by trade

The same formula works across home services, but the risk looks different by trade. Use these notes to pick inputs that match the way your customers buy.

- **Plumbing**: Emergency calls often go to the first company that answers. A single missed burst-pipe call can be worth more than a full day of small service work.
- **HVAC**: Heat waves and cold snaps compress demand into short windows. During peak season, even a few unanswered calls can turn into booked jobs for competitors.
- **Roofing**: Roofing leads are usually high-value, but shoppers rarely wait long. If a storm just passed through, speed to answer matters as much as ad spend.
- **Electrical**: Troubleshooting calls, panel issues, and urgent repairs are hard to price from voicemail. A live answer helps collect details before the caller moves on.
- **Landscaping**: One missed inquiry can become a recurring maintenance account. Use a realistic average that includes the lifetime value of repeat work when it applies.

## What to do next

Stop letting new leads go to voicemail, because they rarely leave one. LobbyStack provides an AI receptionist that works 24/7 to plug your revenue leak:

If the calculator shows meaningful revenue at risk, the next step is to answer more calls without pulling technicians off the work they are already doing. LobbyStack combines AI phone answering, after-hours answering, and AI appointment scheduling so new leads can be captured when your team is busy.

- Answers every call instantly
- Captures follow-up details automatically
- Books appointments directly to your calendar
- Takes detailed job notes and summaries
- Transfers emergencies to your personal cell
- Costs a fraction of a human answering service

## Frequently Asked Questions

### What is a missed call revenue calculator?
A missed call revenue calculator estimates how much booked work may be at risk when calls go unanswered. It takes your missed calls, filters for real job opportunities, applies your booking rate, and multiplies the result by your average job value.

### How accurate is this missed call calculator?
It's highly accurate if you know your numbers. The formula doesn't use magic; it simply multiplies your actual missed calls by your historical conversion rates to show you exactly what you're leaving on the table.

### How much revenue can one missed call cost?
It depends on the trade and the job. A missed landscaping maintenance inquiry may be worth months of repeat work, while a missed plumbing, HVAC, roofing, or electrical call may be worth a high-value repair or installation. Use your average job value for the most realistic estimate.

### Does this include after-hours calls?
Yes. If your phone rings at night and you don't answer, that's a missed call. In emergency trades like plumbing or HVAC, after-hours calls often have a much higher average job value and booking rate than daytime calls.

### What should I use for 'Average job value'?
Look at your last 30 days of revenue and divide it by the number of jobs completed. If you do both small service calls and massive installs, just use the blended average for a conservative estimate.

### What if I do not know my booking rate?
Start with a conservative estimate and rerun the calculator with a second scenario. For example, compare a 25% booking rate with a 50% booking rate. The gap shows how sensitive your revenue is to answering and qualifying calls quickly.

### Should I include spam calls or vendor calls?
No. Count them in your missed call total only if you lower the opportunity rate to account for them. The calculator is meant to estimate lost job revenue, so spam, vendors, wrong numbers, and non-buying calls should not be treated as real opportunities.

### Will an AI receptionist replace my office manager?
No. LobbyStack is designed to handle the repetitive frontline work: answering basic questions, collecting intake details, and booking appointments. Your office manager can focus on complex dispatching, ordering parts, and customer service.

### Is this the same as an answering service ROI calculator?
It is closely related. This calculator shows the revenue that may be at risk from missed calls. To think about ROI, compare that estimate with the monthly cost of an answering service or AI receptionist that can answer, qualify, and book more of those calls.

### Is the recovered revenue guaranteed?
No. These are estimates for planning purposes. However, if an AI receptionist answers a call that would have otherwise gone to voicemail, and successfully books that lead, that is definitively recovered revenue.
`
