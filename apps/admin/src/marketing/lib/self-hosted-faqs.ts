import type { FaqItem } from "@/marketing/lib/seo"

export const selfHostedFaqs: FaqItem[] = [
  {
    question: "What is a self-hosted AI receptionist?",
    answer:
      "A self-hosted AI receptionist runs on a server you control instead of the vendor's. It still answers your calls, books appointments and takes messages, but the dashboard, the database and the recordings live on your machine. LobbyStack is open source under the MIT License, so you can install it yourself.",
  },
  {
    question: "Is LobbyStack open source?",
    answer:
      "Yes. LobbyStack uses the MIT License. You can read, fork, change, share and deploy the code. Keep the copyright and permission notice with copies or substantial portions of it.",
  },
  {
    question: "What do I need to self-host it?",
    answer:
      "The Docker Compose guide asks for Docker Engine 24 or later with Compose v2, Node.js 22 or later to generate secrets, and a server with at least 2 vCPU, 4 GB of RAM and persistent disk. Live calls also need a domain with HTTPS for the dashboard and your own Twilio and OpenAI accounts. Phone calls add a Twilio Elastic SIP trunk. The Railway template sets up the services and databases for you.",
  },
  {
    question: "Can I use my own LLM or API key?",
    answer:
      "Yes. A self-hosted install runs on your own keys. Website chat and knowledge embeddings accept any OpenAI-compatible endpoint, so you can point them at another provider or a model you host, as long as it supports tool calls and the embedding model returns 1,536 dimensions. Voice calls run on OpenAI GPT-Live with your own OpenAI account.",
  },
  {
    question: "What does self-hosting cost?",
    answer:
      "LobbyStack charges no license fee for self-hosting. You pay your hosting provider, Twilio for numbers and call minutes, and OpenAI for the calls, each on your own account. Count the hours your team will spend on updates, backups and monitoring before you compare it with a Cloud plan.",
  },
  {
    question: "How do updates work?",
    answer:
      "Back up PostgreSQL and your storage, pull the new release from GitHub, review its migrations and new variables, then rebuild and restart. The migrator applies database changes before the dashboard and worker start. Pin the version you've tested instead of deploying each upstream change.",
  },
  {
    question: "What about data privacy and compliance?",
    answer:
      "Self-hosting puts the app and the business data it stores on infrastructure you control. Twilio, OpenAI, your host and any integration you connect still process parts of each call, so review how each one handles data and complete your own privacy and compliance review.",
  },
  {
    question: "Can an agency self-host LobbyStack for its clients?",
    answer:
      "Yes. The MIT License lets agencies change and distribute LobbyStack for client work, and the white-label partner features work on a self-hosted install. The LobbyStack name, logos and branding stay under separate trademark rights.",
  },
  {
    question: "Do you offer support for self-hosted installs?",
    answer:
      "Yes. The community helps for free on Discord and in GitHub issues. For help from our team, buy a Premium support or Enterprise support plan. Both add email support with reply-time targets, plus help setting up and upgrading your install. Enterprise also gives you a private Slack channel and a named engineer. The self-hosted pricing page lists the prices and what each plan includes.",
  },
]
