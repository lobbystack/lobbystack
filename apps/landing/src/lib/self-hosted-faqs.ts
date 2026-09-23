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
      "Yes. LobbyStack uses the MIT License. You can inspect, fork, modify, distribute, and deploy the source code under that license. Keep the copyright and permission notices with copies or substantial portions of the software.",
  },
  {
    question: "What are the self-hosting requirements?",
    answer:
      "The Docker Compose guide asks for Docker Engine 24 or later with Compose v2, Node.js 22 or later to generate secrets, and a server with at least 2 vCPU, 4 GB of RAM, and persistent disk. Live calls also need domains with HTTPS for the dashboard and voice gateway, plus Twilio and OpenAI accounts. The Railway template sets up the services and databases for you.",
  },
  {
    question: "Can I use my own LLM or API key?",
    answer:
      "You use your own API keys. Voice calls run on OpenAI Realtime with your OpenAI account. Website chat and knowledge embeddings accept any OpenAI-compatible endpoint, so you can point them at another provider or a model you host.",
  },
  {
    question: "Is self-hosting suitable for agencies and resellers?",
    answer:
      "Yes. The MIT License permits agencies to modify and distribute LobbyStack for client work. The LobbyStack name, logos, and branding remain subject to separate trademark rights.",
  },
  {
    question: "How do updates work for self-hosted deployments?",
    answer:
      "You pull changes from the GitHub repository, review the changelog and migration notes, and redeploy through your own release process. Pin the version you have tested instead of automatically deploying every upstream change.",
  },
  {
    question: "What about data privacy and compliance?",
    answer:
      "Self-hosting gives you control over LobbyStack's application deployment and stored business data. Calls can still be processed by configured telephony, AI, hosting, and integration providers, so review each provider's data handling and complete your own privacy and compliance assessment.",
  },
  {
    question: "Do you offer support for self-hosted installations?",
    answer:
      "Start with the repository documentation and public GitHub issue tracker. For questions that do not belong in a public issue, contact the LobbyStack team through the support address listed on the site.",
  },
  {
    question: "Can I customize the voice, prompts, and behavior?",
    answer:
      "Yes. Self-hosted deployments give you full access to the prompt templates, voice settings, greeting scripts, routing rules, and integration hooks. You can tailor every aspect of the caller experience.",
  },
  {
    question: "How does self-hosted pricing work?",
    answer:
      "The MIT-licensed source code has no separate software license fee. You remain responsible for infrastructure plus any telephony, AI, storage, monitoring, and integration-provider charges used by your deployment.",
  },
]
