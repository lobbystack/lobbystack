import type { FaqItem } from "@/marketing/lib/seo"

export const appointmentSchedulerFaqs: FaqItem[] = [
  {
    question: "What is an AI appointment setter?",
    answer:
      "An AI appointment setter is a voice AI that books appointments over the phone. LobbyStack answers your inbound calls, asks what the caller needs, offers open times from your Google Calendar and books the one they choose. It doesn't make outbound sales calls.",
  },
  {
    question: "What's the difference between an AI appointment setter and an AI appointment scheduler?",
    answer:
      "An AI appointment setter often means outbound calls that book sales meetings, while an AI appointment scheduler books the calls that come to you. People use both names. LobbyStack is the second kind: it books, moves and cancels appointments while the caller is on the line.",
  },
  {
    question: "Which calendar does it book into?",
    answer:
      "Google Calendar. You connect a Google account and pick the calendar that receives bookings. LobbyStack reads busy time from it, so it won't offer a slot that's already taken.",
  },
  {
    question: "Can I choose which questions it asks before booking?",
    answer:
      "Yes. Add your services with a duration and a description, and write rules for what to collect, such as the address, the problem or the caller's insurance. The answers appear in the call's summary and transcript.",
  },
  {
    question: "Can callers reschedule or cancel by phone?",
    answer:
      "Yes, once you turn on appointment changes. By default the caller must call from the number they booked with and name the appointment's time or service. You can also require a texted one-time code or a keypad PIN. The receptionist confirms before it changes anything.",
  },
  {
    question: "Does it send confirmations and reminders?",
    answer:
      "Yes, when the caller agrees on the call. LobbyStack texts a booking confirmation, a reminder 24 hours before the appointment and a cancellation confirmation. On LobbyStack Cloud, texts reach US and Canadian numbers.",
  },
  {
    question: "Can it book appointments after hours?",
    answer:
      "Yes. It answers the calls you forward to it at night, on weekends and on holidays, and offers times inside your opening hours, so a caller at 9 p.m. can book for the next morning.",
  },
  {
    question: "What if I want to approve each booking myself?",
    answer:
      "Set it to save the caller's preferred time as a request for your team, or to take a message. Your team confirms the visit and the caller hears back from you.",
  },
  {
    question: "Can it book with a specific employee?",
    answer:
      "Yes. Add employees with the services they do, their working hours and their time off. Callers can ask for someone by name. If they have no preference, the receptionist books the first employee free for that service.",
  },
  {
    question: "How much does an AI appointment scheduler cost?",
    answer:
      "Free includes 30 voice minutes a month. Starter is $30 a month for 150 minutes, then $0.20 a minute. Pro is $100 a month for 500 minutes, then $0.18 a minute. Annual billing costs 20% less, and no plan has a setup fee.",
  },
]
