import { BadgeDollarSign, MapPin, ShieldAlert, ShieldOff } from "lucide-react"

import { TranscriptScene, TranscriptText, type TranscriptLine } from "@/marketing/components/scenes/TranscriptScene"
import {
  FaqAndRelated,
  IconGrid,
  LinkGrid,
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
import { homeServicesFaqs } from "@/marketing/lib/home-services-faqs"

// /solutions/ai-receptionist-for-home-services/ in English.
// Main keyword: AI receptionist for home services.

const locale = "en"
const signup = appSignupUrl(locale)

// A quote call to a made-up plumbing company.
const quoteCall: TranscriptLine[] = [
  { at: "0:03", speaker: "caller", text: "Hi, I need a price to replace my water heater. It's about fifteen years old." },
  {
    at: "0:10",
    speaker: "lobbystack",
    text: "We do replacements. The price depends on the tank and how it's vented, so a technician looks at it first. Can I get your address?",
    note: "Explained the estimate visit",
  },
  { at: "0:21", speaker: "caller", text: "Sure, it's 41 Elm Street." },
  {
    at: "0:26",
    speaker: "lobbystack",
    text: "Thanks. I have Thursday at 10:00 AM or Friday at 1:00 PM for the estimate.",
    note: "Saved the address",
  },
  { at: "0:33", speaker: "caller", text: "Thursday works." },
  {
    at: "0:36",
    speaker: "lobbystack",
    text: "You're booked for an estimate visit on Thursday at 10:00 AM. You'll get a text confirmation.",
    note: "Booked Thursday at 10:00 AM",
  },
]

const sceneLines: TranscriptLine[] = [quoteCall[0]!, quoteCall[3]!, quoteCall[5]!]

const trades = [
  { href: "/solutions/ai-receptionist-for-plumbers/", title: "Plumbers", detail: "Leaks, clogs and water heaters" },
  { href: "/solutions/ai-receptionist-for-hvac/", title: "HVAC", detail: "No-heat and no-cooling calls" },
  { href: "/solutions/ai-receptionist-for-electricians/", title: "Electricians", detail: "Outages, panels and quotes" },
  { href: "/solutions/roofing-answering-service/", title: "Roofers", detail: "Storm leaks and inspections" },
  { href: "/solutions/ai-receptionist-for-garage-door-repair/", title: "Garage door repair", detail: "Broken springs and stuck doors" },
  { href: "/solutions/ai-receptionist-for-appliance-repair/", title: "Appliance repair", detail: "Model numbers and service visits" },
  { href: "/solutions/ai-receptionist-for-restoration-companies/", title: "Restoration", detail: "Water and fire damage at any hour" },
  { href: "/solutions/ai-receptionist-for-locksmiths/", title: "Locksmiths", detail: "Lockouts and rekeys" },
  {
    href: "/solutions/after-hours-answering-service-for-contractors/",
    title: "Contractors",
    detail: "Calls after the crew goes home",
  },
  { href: "/solutions/property-management-answering-service/", title: "Property managers", detail: "Tenant maintenance requests" },
]

export function HomeServicesSections() {
  return (
    <>
      <SolutionHero
        eyebrow="Home services"
        title="An AI receptionist for home services that books jobs while you work"
        intro="You can't answer from under a sink or on a roof. LobbyStack picks up, collects the address and the problem, books the visit into Google Calendar and transfers the emergencies you define to your on-call phone."
        primary={signupLink("Try for free", signup, "home_services_hero")}
        secondary={{ label: "View pricing", href: "/pricing/" }}
        footnote="Free plan with 30 voice minutes. Works with your existing business number."
        art={<SceneArt scene={{ product: "jobBooked" }} locale={locale} fit="hero" />}
      />

      <SolutionFacts
        facts={[
          "Answers on the number customers already call",
          "Transfers emergencies to your on-call phone",
          "Books estimates and service visits",
          "Hangs up on spam, which uses no minutes",
        ]}
      />

      <MediaPair
        id="calls"
        title="Our home services answering service separates emergencies from routine work"
        intro="You decide which calls are emergencies. Everything else gets booked or written up for you."
        cards={[
          {
            eyebrow: "Emergencies",
            title: "The burst pipe reaches your on-call tech",
            body: "Tell it what counts as an emergency, like water that won't stop or no heat in winter. It asks your questions, then transfers the call with the address and the problem in the transcript.",
            media: <SceneArt scene={{ product: "handoff" }} locale={locale} fit="card" />,
          },
          {
            eyebrow: "Routine work",
            title: "The tune-up lands on the calendar",
            body: "For jobs that can wait, it offers open times from your Google Calendar, books the visit and writes up the call so you know what to bring.",
            media: <SceneArt scene={{ product: "summary" }} locale={locale} fit="card" />,
          },
        ]}
      />

      <SplitSection
        id="quote-call"
        eyebrow="Example call"
        title="A quote request becomes an estimate visit"
        body="LobbyStack quotes only the prices you list. When a price depends on the job, it says so and books a visit. The call below went to Harbor Plumbing, a made-up company."
        media={
          <div className={`absolute inset-0 ${sceneFit("panel")}`}>
            <TranscriptScene lines={sceneLines} tilt="right" width={500} />
          </div>
        }
      >
        <TranscriptText
          className="mt-6"
          summary="Read the call"
          lines={quoteCall}
          speakerLabels={{ caller: "Caller", lobbystack: "LobbyStack" }}
          outcome="Estimate visit booked for Thursday at 10:00 AM."
        />
      </SplitSection>

      <SplitSection
        id="forwarding"
        reverse
        eyebrow="Your number"
        title="Keep the number on your truck"
        body="Forward your business line to LobbyStack through your phone carrier. Pick when it answers: when the line is busy, when nobody picks up, after you close, or on every call. Change it any time, such as for a holiday weekend."
        points={["Starter and Pro also include a number of your own", "Callers dial the number they already have"]}
        media={<SceneArt scene={{ solution: "forwarding" }} locale={locale} fit="panel" />}
      />

      <IconGrid
        id="trade-calls"
        title="Set up your AI receptionist for home services"
        intro="Setup takes about 10 minutes. Add these four things before you forward your first call."
        cards={[
          {
            icon: MapPin,
            title: "Your service area",
            body: "List the towns or zip codes you cover, and it answers \"Do you come out to Brookline?\" from that list.",
          },
          {
            icon: BadgeDollarSign,
            title: "Your prices",
            body: "Add your services with their prices. When a job needs a look first, it books an estimate visit instead of naming a number.",
          },
          {
            icon: ShieldAlert,
            title: "Your emergency rules",
            body: "Name the problems worth a call at night, like no heat or a sewer backup. Those are the calls that ring your on-call phone.",
          },
          {
            icon: ShieldOff,
            title: "What it should never promise",
            body: "Write limits as rules, such as \"Never promise a same-day visit.\" Put the ones that matter most at the top of the list.",
          },
        ]}
      />

      <LinkGrid
        id="trades"
        title="AI receptionists by trade"
        intro="Each page shows the calls that trade gets and how LobbyStack handles them."
        links={trades}
        locale={locale}
      />

      <FaqAndRelated
        heading="Questions about AI receptionists for home services"
        faqs={homeServicesFaqs}
        locale={locale}
        related={[
          { label: "After-hours answering service", href: "/solutions/after-hours-answering-service/" },
          { label: "AI phone answering service", href: "/solutions/ai-phone-answering/" },
          { label: "AI appointment setter", href: "/solutions/ai-appointment-scheduler/" },
          { label: "Missed-call calculator", href: "/missed-call-revenue-calculator/" },
          { label: "Pricing", href: "/pricing/" },
        ]}
      />

      <SolutionClosing
        title="Book the next job without leaving this one"
        body="Add your services, emergency rules and service area, forward your number and call it to test. The free plan includes 30 voice minutes."
        primary={signupLink("Try for free", signup, "home_services_closing")}
        secondary={{ label: "View pricing", href: "/pricing/" }}
        footnote="No credit card required. Cancel anytime."
      />
    </>
  )
}
