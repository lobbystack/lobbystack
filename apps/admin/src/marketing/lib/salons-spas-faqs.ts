import type { FaqItem } from "@/marketing/lib/seo"

export const salonsSpasFaqs: FaqItem[] = [
  {
    question: "What does an AI receptionist for a salon do?",
    answer:
      "It answers your salon's phone when nobody at the desk can. LobbyStack books appointments into Google Calendar, moves and cancels them, answers questions from your service menu and policies, and transfers callers to a person when they ask or your rules say so. Each call shows up in your dashboard with a summary and a transcript.",
  },
  {
    question: "Can clients book a specific stylist?",
    answer:
      "Yes. Add your stylists on the Employees page with the services they do, their hours and their time off. LobbyStack asks whether the client wants someone in particular, offers that person's open times and tells the client who the appointment is with. With no preference, it books the first person free who does the service.",
  },
  {
    question: "Does it work with my salon booking software?",
    answer:
      "Not directly. LobbyStack books into Google Calendar and doesn't connect to salon booking platforms. If your salon books in another app, set LobbyStack to take booking requests: it collects the service, stylist and time the client wants, and your team confirms the appointment. Webhooks and the LobbyStack API can send each request on to your other tools.",
  },
  {
    question: "Can clients cancel or reschedule by phone?",
    answer:
      "Yes, when you turn on appointment changes. LobbyStack matches the booking to the caller's phone number, name and appointment time, reads the change back, then updates your calendar. You can also require a texted code or a keypad PIN. When it can't match the booking, it passes the request to your team.",
  },
  {
    question: "Does it send appointment reminders?",
    answer:
      "Yes. Clients who agree to texts during the call get a booking confirmation, a reminder 24 hours before the appointment and a confirmation if they cancel. On LobbyStack Cloud, these texts reach US and Canadian numbers only, and you can't change their timing or wording.",
  },
  {
    question: "Can it answer questions about prices and services?",
    answer:
      "Yes. It quotes the price you set for each service, whether that's a fixed price, a starting price, a range or priced in person. It answers other questions, such as patch tests or parking, from your website, documents and notes. When you leave a price blank, it doesn't make one up.",
  },
  {
    question: "Does it work for spas, barbershops and nail studios?",
    answer:
      "Yes. A barbershop, a day spa, a med spa, a nail studio and a massage practice all set it up the same way: add your own services, people, hours and rules.",
  },
  {
    question: "What happens when a client wants to talk to a person?",
    answer:
      "LobbyStack transfers the call. A client who asks for a stylist by name goes to that stylist's phone, if you added one, and everyone else goes to your default transfer number. You can also write rules for when it should take a message instead.",
  },
  {
    question: "Can I keep my salon's phone number?",
    answer:
      "Yes. Forward your current number to LobbyStack, either every call or only the calls you miss. Clients keep dialing the number they know.",
  },
  {
    question: "How much does an AI receptionist for a salon cost?",
    answer:
      "You can start free. The Free plan includes 30 voice minutes and a US or Canadian number for 14 days, with no card. Starter is $30 a month for 150 minutes, then $0.20 a minute, and Pro is $100 a month for 500 minutes, then $0.18 a minute. Annual billing costs 20% less. Calls under 10 seconds and calls ended as spam don't count.",
  },
]
