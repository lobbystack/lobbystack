import type { FaqItem } from "@/lib/seo"

export const pricingFaqs: FaqItem[] = [
  {
    question: "How does LobbyStack Pro pricing work?",
    answer:
      "Pro is $15/month and includes 80 voice minutes, 20 outbound call attempts, and 50 alert SMS segments each month. After that, usage is billed at $0.18/minute for voice, $0.02 per outbound call attempt, and $0.02 per alert SMS segment.",
  },
  {
    question: "Do spam calls or very short calls count toward usage?",
    answer:
      "No. LobbyStack excludes spam calls and calls under 10 seconds from usage, so wrong numbers, robocalls, instant hang-ups, and pocket dials do not count against your included voice minutes or Pro overages.",
  },
  {
    question: "Can I switch plans or cancel anytime?",
    answer:
      "Yes. You can upgrade, downgrade, or cancel your plan from billing settings. When you downgrade, you keep your current plan until the end of the billing period. There are no cancellation fees.",
  },
  {
    question: "Can I use LobbyStack for free?",
    answer:
      "Yes. The Free tier lets you try LobbyStack without a monthly subscription. It includes 10 voice minutes, 2 outbound call attempts, 10 alert SMS segments, appointment booking, summaries, and call history.",
  },
  {
    question: "What AI receptionist features are available today?",
    answer:
      "LobbyStack can answer calls, capture caller details, answer business questions from your knowledge base, qualify leads, book appointments, route urgent callers, send summaries by email, and support recordings, transcripts, Google Calendar, Outlook, and multilingual conversations.",
  },
]
