import type { FaqItem } from "@/lib/seo"

export const selfHostedFaqs: FaqItem[] = [
  {
    question: "What is a self-hosted AI receptionist?",
    answer:
      "A self-hosted AI receptionist runs on your own servers or cloud infrastructure instead of a third-party SaaS platform. You control the data, the model, the deployment environment, and the integrations. LobbyStack is open source and supports self-hosted deployments for teams that need full control.",
  },
  {
    question: "Is LobbyStack open source?",
    answer:
      "Yes. LobbyStack is open source under a permissive license. You can view the source code, fork it, modify it, and deploy it on your own infrastructure. The repository is available on GitHub.",
  },
  {
    question: "What are the self-hosting requirements?",
    answer:
      "You need a server or container platform that can run Node.js and a supported database. LobbyStack provides Docker and Docker Compose configurations for quick local and production deployments. You also need a telephony provider account for call handling.",
  },
  {
    question: "Can I use my own LLM or API key?",
    answer:
      "Yes. Self-hosted LobbyStack can be configured with your own API keys for OpenAI, Anthropic, or other compatible providers. You control which model is used, the temperature, and the prompt behavior.",
  },
  {
    question: "Is self-hosting suitable for agencies and resellers?",
    answer:
      "Yes. Agencies can deploy LobbyStack for multiple clients from a single instance or separate instances per client. The open-source license allows modification and white-labeling for your own brand.",
  },
  {
    question: "How do updates work for self-hosted deployments?",
    answer:
      "You pull updates from the GitHub repository and redeploy. We tag stable releases and provide changelog notes. Enterprise customers can opt for managed update support and priority patches.",
  },
  {
    question: "What about data privacy and compliance?",
    answer:
      "Self-hosting means your call data, transcripts, and customer information never leave your infrastructure. This is ideal for healthcare, legal, financial, and other regulated industries that need data residency and access control.",
  },
  {
    question: "Do you offer support for self-hosted installations?",
    answer:
      "Community support is available through GitHub issues and discussions. Enterprise plans include dedicated support, implementation guidance, and custom deployment assistance for complex environments.",
  },
  {
    question: "Can I customize the voice, prompts, and behavior?",
    answer:
      "Yes. Self-hosted deployments give you full access to the prompt templates, voice settings, greeting scripts, routing rules, and integration hooks. You can tailor every aspect of the caller experience.",
  },
  {
    question: "How does self-hosted pricing work?",
    answer:
      "The open-source software is free. You pay only for your infrastructure, telephony provider usage, and LLM API costs. Enterprise support plans are available for teams that need professional guidance and SLA-backed assistance.",
  },
]
