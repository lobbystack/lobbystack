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
      "Yes. LobbyStack is published under the GNU AGPL-3.0-only license. You can inspect, fork, modify, and deploy the source code under that license. Review the LICENSE file in the GitHub repository before distributing a modified service.",
  },
  {
    question: "What are the self-hosting requirements?",
    answer:
      "You need a server or container platform that can run Node.js and a supported database. LobbyStack provides Docker and Docker Compose configurations for quick local and production deployments. You also need a telephony provider account for call handling.",
  },
  {
    question: "Can I use my own LLM or API key?",
    answer:
      "Self-hosted deployments use the provider credentials supported by the current LobbyStack repository and deployment documentation. Review the repository before deployment for the current model and telephony integrations rather than assuming every provider is interchangeable.",
  },
  {
    question: "Is self-hosting suitable for agencies and resellers?",
    answer:
      "Agencies can evaluate separate or multi-tenant deployments for client work. Because LobbyStack uses the AGPL-3.0-only license, review its source-disclosure obligations before modifying or reselling the service, and seek legal advice for your use case.",
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
      "The AGPL-3.0-only source code has no separate software license fee. You remain responsible for infrastructure plus any telephony, AI, storage, monitoring, and integration-provider charges used by your deployment.",
  },
]
