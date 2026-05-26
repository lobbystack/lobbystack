;(function registerLobbyStackWebMcp() {
  const modelContext = navigator.modelContext

  if (!modelContext) {
    return
  }

  const siteUrl = "https://lobbystack.com"
  const urls = {
    home: `${siteUrl}/`,
    features: `${siteUrl}/features/`,
    pricing: `${siteUrl}/pricing/`,
    featuresMarkdown: `${siteUrl}/features.md`,
    pricingMarkdown: `${siteUrl}/pricing.md`,
    docs: "https://docs.lobbystack.com/introduction",
    apiCatalog: `${siteUrl}/.well-known/api-catalog`,
    openApi: `${siteUrl}/openapi.json`,
    skills: `${siteUrl}/.well-known/agent-skills/index.json`,
    llms: `${siteUrl}/llms.txt`,
    github: "https://github.com/lobbystack/lobbystack",
  }

  const tools = [
    {
      name: "get-site-summary",
      description:
        "Return a concise overview of LobbyStack and the most useful public links for agents.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      execute: async () => ({
        name: "LobbyStack",
        description:
          "Open-source AI receptionist for answering calls, handling SMS, qualifying leads, booking appointments, and routing urgent requests.",
        urls,
      }),
    },
    {
      name: "get-navigation-links",
      description:
        "Return public LobbyStack navigation links grouped by features, pricing, documentation, or legal pages.",
      inputSchema: {
        type: "object",
        properties: {
          section: {
            type: "string",
            enum: ["all", "features", "pricing", "docs", "legal"],
            description: "The link group to return.",
          },
        },
        required: ["section"],
        additionalProperties: false,
      },
      execute: async ({ section }) => {
        const groups = {
          features: [
            { label: "Features", url: urls.features },
            { label: "Features markdown", url: urls.featuresMarkdown },
          ],
          pricing: [
            { label: "Pricing", url: urls.pricing },
            { label: "Pricing markdown", url: urls.pricingMarkdown },
          ],
          docs: [
            { label: "Product docs", url: urls.docs },
            { label: "API catalog", url: urls.apiCatalog },
            { label: "OpenAPI", url: urls.openApi },
            { label: "Agent skills", url: urls.skills },
            { label: "LLM context", url: urls.llms },
            { label: "GitHub", url: urls.github },
          ],
          legal: [
            { label: "Privacy", url: `${siteUrl}/privacy/` },
            { label: "Terms", url: `${siteUrl}/terms/` },
          ],
        }

        if (section === "all") {
          return groups
        }

        return { [section]: groups[section] || [] }
      },
    },
    {
      name: "get-pricing",
      description:
        "Return public LobbyStack pricing plan names, starting prices, included limits, overage rates, and the pricing page URL.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      execute: async () => ({
        source: urls.pricing,
        markdown: urls.pricingMarkdown,
        usageExclusions: [
          "Spam calls do not count against included voice minutes or Pro overages.",
          "Calls under 10 seconds do not count against included voice minutes or Pro overages.",
        ],
        plans: [
          {
            name: "Free",
            priceUsdMonthly: 0,
            includedUsage: {
              voiceMinutes: 10,
              outboundCallAttempts: 2,
              alertSmsSegments: 10,
              knowledgeStorageMb: 100,
            },
            description:
              "Free includes 10 voice minutes, 2 outbound call attempts, 10 alert SMS segments, and 100 MB knowledge storage.",
          },
          {
            name: "Pro",
            priceUsdMonthly: 15,
            includedUsage: {
              voiceMinutes: 80,
              outboundCallAttempts: 20,
              alertSmsSegments: 50,
              knowledgeStorageGb: 2,
            },
            overageRatesUsd: {
              voiceMinute: 0.18,
              outboundCallAttempt: 0.02,
              alertSmsSegment: 0.02,
            },
            description:
              "Pro includes 80 voice minutes, 20 outbound call attempts, 50 alert SMS segments, and 2 GB knowledge storage. Additional usage is pay-as-you-go.",
          },
          {
            name: "Enterprise",
            priceUsdMonthly: null,
            description:
              "Custom pricing for higher volume, multiple numbers, multi-location routing, custom fallback rules, and self-hosting implementation support.",
          },
        ],
      }),
    },
    {
      name: "get-features",
      description:
        "Return key public LobbyStack features, including call answering, booking, workflows, transfers, dashboard, and reporting.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      execute: async () => ({
        source: urls.features,
        markdown: urls.featuresMarkdown,
        features: [
          "AI phone receptionist",
          "Appointment scheduling",
          "Plain-language workflows",
          "Business knowledge answers",
          "Lead qualification",
          "Human handoff and call transfers",
          "Outbound calls and follow-up",
          "Dashboard, call history, transcripts, summaries, contacts, and analytics",
          "Unlimited concurrent calls",
          "Multilingual voice support",
        ],
      }),
    },
    {
      name: "get-agent-discovery",
      description:
        "Return machine-readable discovery resources exposed by lobbystack.com.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      execute: async () => ({
        apiCatalog: urls.apiCatalog,
        openApi: urls.openApi,
        agentSkills: urls.skills,
        llms: urls.llms,
        featuresMarkdown: urls.featuresMarkdown,
        pricingMarkdown: urls.pricingMarkdown,
        mcpServerCard: `${siteUrl}/.well-known/mcp/server-card.json`,
      }),
    },
  ]

  try {
    if (typeof modelContext.provideContext === "function") {
      modelContext.provideContext({ tools })
      return
    }

    if (typeof modelContext.registerTool === "function") {
      const controller = new AbortController()

      for (const tool of tools) {
        modelContext.registerTool(tool, { signal: controller.signal })
      }

      window.addEventListener("pagehide", () => controller.abort(), {
        once: true,
      })
    }
  } catch (error) {
    console.warn("Unable to register LobbyStack WebMCP tools", error)
  }
})()
