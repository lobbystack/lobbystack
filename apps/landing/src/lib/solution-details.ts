// Page-specific content for the after-hours and self-hosted solution pages.
// Businesses and callers in the examples are fictional.

import type { CallAction, TradeDetails } from "@/lib/trade-details"

export const afterHoursRouting: Pick<TradeDetails, "noun" | "routing"> = {
  noun: "after-hours",
  routing: [
    {
      call: "An emergency your rules define, like no heat or an active leak",
      action: "Transfers",
      detail:
        "Collects the address and the problem, then connects whoever is on call",
    },
    {
      call: "A new customer who wants an appointment",
      action: "Books",
      detail:
        "Offers open times from your Google Calendar and texts the caller a confirmation",
    },
    {
      call: "A customer who needs to reschedule",
      action: "Books",
      detail: "Looks up the appointment, checks the caller, and moves it",
    },
    {
      call: "A question about hours, prices, or your service area",
      action: "Answers",
      detail: "Replies from the business details you entered",
    },
    {
      call: "A billing question or a request for a specific person",
      action: "Takes a message",
      detail: "Writes it up for your team to handle in the morning",
    },
    {
      call: "A robocall or sales pitch",
      action: "Ends the call",
      detail: "Hangs up, and the call doesn't count toward your minutes",
    },
  ],
}

export type TimelineCall = {
  at: string
  reason: string
  action: CallAction
  // The image shows what LobbyStack did, and the alt text describes it.
  image: string
  imageAlt: string
}

export const nightCalls: TimelineCall[] = [
  {
    at: "6:12 p.m.",
    reason: "Furnace tune-up",
    action: "Books",
    image: "/illustrations/after-hours/furnace.webp",
    imageAlt: "Appointment booked: furnace tune-up, Thursday at 9:00 AM",
  },
  {
    at: "8:25 p.m.",
    reason: "Do you come to Brookline?",
    action: "Answers",
    image: "/illustrations/after-hours/service-area.webp",
    imageAlt:
      "A caller asks if the business comes to Brookline, and LobbyStack replies that it does",
  },
  {
    at: "10:40 p.m.",
    reason: "Spam call",
    action: "Ends the call",
    image: "/illustrations/after-hours/spam.webp",
    imageAlt: "Spam call ended with no minutes used",
  },
  {
    at: "1:18 a.m.",
    reason: "No heat, baby in the house",
    action: "Transfers",
    image: "/illustrations/after-hours/no-heat.webp",
    imageAlt:
      "An emergency no-heat call transferred to Marco, the on-call technician",
  },
  {
    at: "4:05 a.m.",
    reason: "Toilet running all night",
    action: "Books",
    image: "/illustrations/after-hours/running-toilet.webp",
    imageAlt: "Appointment booked: toilet repair, today at 10:00 AM",
  },
  {
    at: "7:30 a.m.",
    reason: "Question about an invoice",
    action: "Takes a message",
    image: "/illustrations/after-hours/invoice.webp",
    imageAlt: "A message for the office about an invoice question",
  },
]

export const afterHoursIndustries = [
  {
    href: "/solutions/ai-receptionist-for-hvac/",
    title: "HVAC",
    detail: "No-heat and no-cooling calls at night",
  },
  {
    href: "/solutions/ai-receptionist-for-plumbers/",
    title: "Plumbing",
    detail: "Leaks and sewer backups after you close",
  },
  {
    href: "/solutions/property-management-answering-service/",
    title: "Property management",
    detail: "Tenant maintenance requests overnight",
  },
  {
    href: "/solutions/ai-receptionist-for-dental-offices/",
    title: "Dental offices",
    detail: "Patients in pain on a weekend",
  },
  {
    href: "/solutions/after-hours-answering-service-for-contractors/",
    title: "Contractors",
    detail: "Job-site problems after the crew leaves",
  },
  {
    href: "/solutions/roofing-answering-service/",
    title: "Roofing",
    detail: "Leak calls during a storm",
  },
  {
    href: "/solutions/ai-receptionist-for-locksmiths/",
    title: "Locksmiths",
    detail: "Lockouts at 2 a.m.",
  },
  {
    href: "/solutions/ai-receptionist-for-restoration-companies/",
    title: "Restoration",
    detail: "Flooding and fire calls at any hour",
  },
]

export const dentalCalls: TimelineCall[] = [
  {
    at: "7:10 a.m.",
    reason: "Cracked a tooth last night",
    action: "Books",
    image: "/illustrations/dental/cracked-tooth.webp",
    imageAlt: "Emergency visit booked for a cracked tooth today at 8:30",
  },
  {
    at: "9:45 a.m.",
    reason: "Is my insurance accepted?",
    action: "Answers",
    image: "/illustrations/dental/insurance.webp",
    imageAlt:
      "A patient asks about insurance, and LobbyStack replies that the plan is in network",
  },
  {
    at: "12:20 p.m.",
    reason: "New patient, needs a cleaning",
    action: "Books",
    image: "/illustrations/dental/new-patient.webp",
    imageAlt: "New patient exam and cleaning booked for Tuesday at 10:00",
  },
  {
    at: "3:05 p.m.",
    reason: "Needs to move an appointment",
    action: "Books",
    image: "/illustrations/dental/reschedule.webp",
    imageAlt: "A cleaning moved from Wednesday at 9:00 to Friday at 2:00",
  },
  {
    at: "6:40 p.m.",
    reason: "Swelling after an extraction",
    action: "Transfers",
    image: "/illustrations/dental/after-extraction.webp",
    imageAlt:
      "An after-hours call about swelling transferred to Dr. Patel, the on-call dentist",
  },
  {
    at: "9:15 p.m.",
    reason: "Question about a bill",
    action: "Takes a message",
    image: "/illustrations/dental/billing.webp",
    imageAlt: "A message for the front desk about a billing question",
  },
]

export const dentalDetails: Pick<TradeDetails, "noun" | "routing" | "intake"> =
  {
    noun: "dental",
    routing: [
      {
        call: "Toothache or a cracked tooth during office hours",
        action: "Books",
        detail: "Offers your next emergency slot and books it",
      },
      {
        call: "Swelling, fever, or trauma after hours",
        action: "Transfers",
        detail:
          "Asks your triage questions, then connects your on-call dentist",
      },
      {
        call: "A new patient",
        action: "Books",
        detail:
          "Collects their insurance and reason for the visit, then books an exam",
      },
      {
        call: "A patient who needs to reschedule",
        action: "Books",
        detail: "Finds the appointment, checks who's calling, and moves it",
      },
      {
        call: "A question about insurance, hours, or parking",
        action: "Answers",
        detail: "Replies from the plans and policies you entered",
      },
      {
        call: "A billing question",
        action: "Takes a message",
        detail: "Writes it up for your front desk",
      },
      {
        call: "A robocall or sales pitch",
        action: "Ends the call",
        detail: "Hangs up, and the call doesn't count toward your minutes",
      },
    ],
    intake: [
      "Whether they're a new or existing patient",
      "What's bothering them, and since when",
      "Pain level, swelling, bleeding, or fever",
      "Their insurance carrier and plan",
      "The days and times that work for them",
      "The best callback number",
    ],
  }
