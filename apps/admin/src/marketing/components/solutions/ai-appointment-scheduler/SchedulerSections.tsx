import { CalendarDays, CalendarOff, CalendarRange, Clock, Globe, MessageSquareText, PhoneOutgoing, Timer } from "lucide-react"

import { TranscriptScene, TranscriptText, type TranscriptLine } from "@/marketing/components/scenes/TranscriptScene"
import {
  FaqAndRelated,
  IconGrid,
  MediaPair,
  SceneArt,
  signupLink,
  SolutionClosing,
  SolutionFacts,
  SolutionHero,
  SplitSection,
} from "@/marketing/components/solution-layouts/solution/SolutionSections"
import { sceneFit } from "@/marketing/components/solution-layouts/solution/SolutionScenes"
import { appSignupUrl } from "@/marketing/lib/app-links"
import { appointmentSchedulerFaqs } from "@/marketing/lib/appointment-scheduler-faqs"

// /solutions/ai-appointment-scheduler/ in English. Main keyword: AI appointment setter.

const locale = "en"
const signup = appSignupUrl(locale)

// A booking call to a made-up plumbing company.
const bookingCall: TranscriptLine[] = [
  { at: "0:04", speaker: "caller", text: "Hi, my kitchen drain is backing up. Can someone come out this week?" },
  {
    at: "0:11",
    speaker: "lobbystack",
    text: "I can help with that. I have Tuesday at 3:00 PM or Wednesday at 9:00 AM. Which works better?",
    note: "Offered two open times",
  },
  { at: "0:19", speaker: "caller", text: "Tuesday at three, please." },
  {
    at: "0:24",
    speaker: "lobbystack",
    text: "You're booked for drain cleaning on Tuesday at 3:00 PM. Can we text this number with your confirmation and a reminder?",
    note: "Booked Tuesday at 3:00 PM",
  },
  { at: "0:31", speaker: "caller", text: "Yes, go ahead." },
  {
    at: "0:33",
    speaker: "lobbystack",
    text: "Done. You'll get a text now and a reminder the day before.",
    note: "Confirmation texted",
  },
]

// The scene shows the caller's ask and the two steps LobbyStack took.
const sceneLines: TranscriptLine[] = [
  bookingCall[0]!,
  { ...bookingCall[1]!, note: "Offered Tuesday or Wednesday" },
  { ...bookingCall[3]!, note: "Booked Tuesday at 3:00 PM" },
]

export function SchedulerSections() {
  return (
    <>
      <SolutionHero
        eyebrow="AI appointment setter"
        title="An AI appointment setter that books callers before they hang up"
        intro="When a caller gets voicemail, the next business they try can book them before you call back. LobbyStack answers, offers open times from your Google Calendar, books the one the caller picks and texts a confirmation."
        primary={signupLink("Try for free", signup, "scheduler_hero")}
        secondary={{ label: "View pricing", href: "/pricing/" }}
        footnote="Free plan with 30 voice minutes. No credit card required."
        art={<SceneArt scene={{ product: "booking" }} locale={locale} fit="hero" />}
      />

      <SolutionFacts
        facts={[
          "Books into Google Calendar during the call",
          "Offers only times inside your hours",
          "Texts a confirmation and a reminder",
          "Moves or cancels bookings if you allow it",
        ]}
      />

      <MediaPair
        id="how-it-books"
        title="How the AI appointment setter books a call"
        intro="The example below is a made-up plumbing company. Your receptionist uses your services, your calendar and your opening hours."
        cards={[
          {
            eyebrow: "On the call",
            title: "Two open times, then a booking",
            body: "It works out which service the caller needs, finds open times long enough for that job and offers a choice. The caller picks one, and the booking appears in your Google Calendar.",
            media: (
              <div className={`absolute inset-0 ${sceneFit("card")}`}>
                <TranscriptScene lines={sceneLines} tilt="left" width={500} />
              </div>
            ),
          },
          {
            eyebrow: "After the call",
            title: "A text now, a reminder the day before",
            body: "If the caller agrees, LobbyStack texts a confirmation right away and a reminder 24 hours before the visit. On LobbyStack Cloud, texts go to US and Canadian numbers.",
            media: <SceneArt scene={{ solution: "reminder" }} locale={locale} fit="card" />,
          },
        ]}
      />

      <section className="pt-6">
        <div className="mx-auto w-full max-w-site px-6">
          <TranscriptText
            summary="Read the whole booking call"
            lines={bookingCall}
            speakerLabels={{ caller: "Caller", lobbystack: "LobbyStack" }}
            outcome="Drain cleaning booked for Tuesday at 3:00 PM, with a confirmation text sent."
            footnote="Harbor Plumbing is a made-up business."
          />
        </div>
      </section>

      <SplitSection
        id="changes"
        eyebrow="Rescheduling"
        title="Callers move or cancel their own appointments"
        body="Turn on appointment changes and a caller can find their booking, pick a new time or cancel. The receptionist confirms the change before it touches your calendar. To keep anyone else from changing a booking, require a texted one-time code or a keypad PIN first."
        points={[
          "Changes are off until you turn them on",
          "When it can't confirm the booking, it hands the request to your team",
        ]}
        media={<SceneArt scene={{ solution: "reschedule" }} locale={locale} fit="panel" />}
      />

      <SplitSection
        id="employees"
        reverse
        eyebrow="Your team"
        title="Books the person the caller asks for"
        body="Add the people who take appointments, with the services they do, their hours and their time off. A caller can ask for someone by name. With no preference, the receptionist books the first person free for that service."
        points={["Nobody gets booked during their time off", "It can also transfer a caller to the person they ask for"]}
        media={<SceneArt scene={{ product: "routing" }} locale={locale} fit="panel" />}
      />

      <IconGrid
        id="before-it-books"
        title="Four checks before it offers a time"
        intro="Your receptionist offers a slot only when all four say it's free."
        cards={[
          {
            icon: Timer,
            title: "The service and its length",
            body: "Each service has a duration, so a one-hour job gets a one-hour slot. Callers can book only the services you mark as bookable.",
          },
          {
            icon: Clock,
            title: "Your opening hours",
            body: "It offers times inside the hours you set for the business, and inside each employee's working hours when you set those.",
          },
          {
            icon: CalendarDays,
            title: "Busy time in Google Calendar",
            body: "It reads busy time from the calendar you connect, so a dentist's lunch or a crew's existing job blocks the slot.",
          },
          {
            icon: CalendarOff,
            title: "Time off",
            body: "Days you add as time off for an employee drop out of what the receptionist offers for them.",
          },
        ]}
      />

      <IconGrid
        id="fit"
        title="Where LobbyStack fits as an AI appointment setter"
        intro="LobbyStack handles AI appointment booking for the calls that come to you."
        cards={[
          {
            icon: CalendarRange,
            title: "Callers who want to book now",
            body: "New customers, repeat customers and people calling after hours can all book a time on the first call.",
          },
          {
            icon: MessageSquareText,
            title: "Businesses that confirm by hand",
            body: "Prefer to approve each visit? Set it to save the caller's preferred time as a request for your team, or to take a message.",
          },
          {
            icon: Globe,
            title: "Callers in other languages",
            body: "Each call opens in your default language and switches when the caller speaks another one or asks to.",
          },
          {
            icon: PhoneOutgoing,
            title: "Not for outbound lead lists",
            body: "It doesn't dial lead lists or follow up on cold leads. The only outgoing calls it places are transfers.",
          },
        ]}
      />

      <FaqAndRelated
        heading="Questions about AI appointment setters"
        faqs={appointmentSchedulerFaqs}
        locale={locale}
        related={[
          { label: "AI phone answering service", href: "/solutions/ai-phone-answering/" },
          { label: "Dental AI receptionist", href: "/solutions/ai-receptionist-for-dental-offices/" },
          { label: "AI receptionist for salons", href: "/solutions/ai-receptionist-for-salons-and-spas/" },
          { label: "After-hours answering service", href: "/solutions/after-hours-answering-service/" },
          { label: "Pricing", href: "/pricing/" },
        ]}
      />

      <SolutionClosing
        title="Book your next caller while they're still on the line"
        body="Add your services, connect Google Calendar and call your number to book a test appointment. The free plan includes 30 voice minutes."
        primary={signupLink("Try for free", signup, "scheduler_closing")}
        secondary={{ label: "View pricing", href: "/pricing/" }}
        footnote="No credit card required. Cancel anytime."
      />
    </>
  )
}
