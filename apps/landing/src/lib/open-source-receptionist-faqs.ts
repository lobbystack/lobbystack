import type { FaqItem } from "@/lib/seo"

export const openSourceReceptionistFaqs: FaqItem[] = [
  {
    question: "What is an open-source AI receptionist?",
    answer:
      "An open-source AI receptionist is a voice answering platform whose source code is publicly available for inspection, modification, and self-hosted deployment. LobbyStack is open source so teams can audit the call handling logic, customize prompts, and run the system on their own infrastructure.",
  },
  {
    question: "Why does open source matter for an AI receptionist?",
    answer:
      "Open source gives you visibility into how calls are processed, what data is stored, and how the AI makes routing decisions. For regulated industries, agencies, and teams with data-control requirements, that visibility is a prerequisite, not a nice-to-have.",
  },
  {
    question: "Can I self-host LobbyStack?",
    answer:
      "Yes. LobbyStack can run on your own servers or cloud infrastructure. You control call data, recordings, transcripts, and model choice. See the self-hosted AI receptionist page for deployment details.",
  },
  {
    question: "Can I change the AI prompts and call flows?",
    answer:
      "Yes. Because the code is open source, you can modify greeting scripts, intake questions, escalation rules, booking logic, and downstream integrations without waiting on a vendor roadmap.",
  },
  {
    question: "Does open source mean less support?",
    answer:
      "Not necessarily. LobbyStack offers managed cloud plans with support, and self-hosted users can access documentation, community resources, and professional implementation services. Open source means more control, not less help.",
  },
  {
    question: "Is my call data safe in an open-source project?",
    answer:
      "When you self-host, your call data stays on your infrastructure. When you use the managed cloud, LobbyStack follows standard data handling practices. Open source means you can verify the data handling yourself rather than trusting a black box.",
  },
  {
    question: "How is this different from a closed-source AI receptionist?",
    answer:
      "Closed-source AI receptionist platforms keep their call handling logic, prompt structure, and data pipelines private. You cannot audit how decisions are made or customize the system beyond the vendor's configuration surface. LobbyStack lets you inspect, fork, and modify the entire stack.",
  },
  {
    question: "Where can I find the source code?",
    answer:
      "The LobbyStack source code is available on GitHub at github.com/lobbystack/lobbystack. You can review it, open issues, and contribute changes.",
  },
]
