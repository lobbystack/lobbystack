import type { FaqItem } from "@/marketing/lib/seo"

export const openSourceReceptionistFaqs: FaqItem[] = [
  {
    question: "What is an open-source AI receptionist?",
    answer:
      "An open-source AI receptionist answers your business's phone calls and publishes its code, so anyone can read it, change it and run it on their own server. LobbyStack is one, under the MIT License. It answers questions, books appointments, takes messages and transfers callers to a person.",
  },
  {
    question: "Why does open source matter for an AI receptionist?",
    answer:
      "Your receptionist talks to your customers and stores their names, numbers and recordings. With the code public, you or your developer can check what it says, what it saves and where the data goes before you send it real calls. That check matters most when you work under privacy rules or answer calls for clients.",
  },
  {
    question: "Can I self-host LobbyStack?",
    answer:
      "Yes. The Docker Compose guide runs it on one server with 2 vCPU and 4 GB of RAM, and the Railway template sets up the services and databases for you. You bring your own Twilio and OpenAI accounts. The self-hosted AI receptionist page walks through the install.",
  },
  {
    question: "Can I change the AI prompts and call flows?",
    answer:
      "Yes. The instructions and tools live in the packages/agent-core workspace. Edit the greeting, the intake questions, the booking steps or the transfer rules in your fork, then deploy it. On LobbyStack Cloud you change the same behavior from the dashboard's AI settings and rules.",
  },
  {
    question: "Does open source mean less support?",
    answer:
      "No. On LobbyStack Cloud, Starter includes email support and Pro gets priority email. If you self-host, you get the guides at docs.lobbystack.com and the GitHub issue tracker. For help from our team, buy a Premium support or Enterprise support plan.",
  },
  {
    question: "Is my call data safe in an open-source project?",
    answer:
      "Your call data stays wherever you run LobbyStack. When you self-host, recordings, transcripts and contacts stay in your own PostgreSQL database and storage, and you set the backups and retention. Twilio and OpenAI still process the live call audio under your accounts. On LobbyStack Cloud, LobbyStack stores that data for you. In both cases you can read the code to see what it saves.",
  },
  {
    question: "How is it different from a closed-source AI receptionist?",
    answer:
      "A closed-source vendor keeps its prompts, routing and data handling private, so you can change only what its settings page allows. With LobbyStack you can read the whole stack, fork it and change any part of it.",
  },
  {
    question: "Where can I find the source code?",
    answer:
      "On GitHub at github.com/lobbystack/lobbystack. You can read it, open issues and send pull requests. CONTRIBUTING.md in the repository explains how to send a change.",
  },
]
