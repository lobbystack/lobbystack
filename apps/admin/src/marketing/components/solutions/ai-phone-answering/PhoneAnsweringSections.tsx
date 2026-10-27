import { AudioLines, BookOpen, Headset, ListChecks, ListOrdered, PhoneCall, PhoneForwarded, Voicemail } from "lucide-react"

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
import { TileFieldArt } from "@/marketing/components/system/art"
import { ButtonLink } from "@/marketing/components/system/ButtonLink"
import { appSignupUrl } from "@/marketing/lib/app-links"
import { aiPhoneAnsweringFaqs } from "@/marketing/lib/solution-faqs"

// /solutions/ai-phone-answering/ in English. Main keyword: AI phone answering service.

const locale = "en"
const signup = appSignupUrl(locale)

export function PhoneAnsweringSections() {
  return (
    <>
      <SolutionHero
        eyebrow="AI phone answering"
        title="An AI phone answering service for the calls you can't take"
        intro="When you're on a job or with a customer, the caller you can't answer dials the next business on their list. LobbyStack picks up on your number, books the visit into Google Calendar and rings your phone when a call is urgent."
        primary={signupLink("Try for free", signup, "phone_answering_hero")}
        secondary={{ label: "View pricing", href: "/pricing/" }}
        footnote="Free plan with 30 voice minutes. No credit card required."
        art={<SceneArt scene={{ product: "callCapture" }} locale={locale} fit="hero" />}
      />

      <SolutionFacts
        facts={[
          "Works on the business number you already have",
          "Books into Google Calendar during the call",
          "Transfers urgent calls to the number you set",
          "Spam calls and calls under 10 seconds use no minutes",
        ]}
      />

      <MediaPair
        id="on-a-call"
        title="Our AI phone answering service replies from your details and books the visit"
        intro="Callers talk the way they would to your front desk. LobbyStack answers what it knows, books what it can and passes the rest to you."
        cards={[
          {
            eyebrow: "Questions",
            title: "Answers from your own details",
            body: "A caller asks whether you cover their town or what a first visit costs. LobbyStack answers from the services, prices, hours and policies you added. Add a rule, and it takes a message whenever it isn't sure.",
            media: <SceneArt scene={{ product: "knowledge" }} locale={locale} fit="card" />,
          },
          {
            eyebrow: "Booking",
            title: "Books the visit before they hang up",
            body: "It offers open times from your Google Calendar, books the one the caller picks and, if they agree, texts a confirmation and a reminder the day before.",
            media: <SceneArt scene={{ product: "booking" }} locale={locale} fit="card" />,
          },
        ]}
      />

      <SplitSection
        id="transfers"
        eyebrow="Transfers"
        title="Urgent calls reach a person"
        body="Write what counts as urgent in plain words, such as water coming through a ceiling or a customer asking for the owner. LobbyStack asks the questions your rule needs, then transfers the call to your on-call number or to the employee the caller asks for."
        points={[
          "If nobody picks up, it tells the caller and offers to take a message",
          "Your team can get an alert when a transfer doesn't connect",
        ]}
        media={<SceneArt scene={{ product: "handoff" }} locale={locale} fit="panel" />}
      />

      <SplitSection
        id="after-the-call"
        reverse
        eyebrow="After the call"
        title="Know what each caller wanted before you call back"
        body="The dashboard lists each call with a one-line summary, the transcript and the recording, next to the caller's name and number."
        points={[
          "Messages and follow-ups wait in one list for your team",
          "A text or email alert when the receptionist takes a message",
        ]}
        media={<SceneArt scene={{ product: "summary" }} locale={locale} fit="panel" />}
      />

      <IconGrid
        id="setup"
        title="Set up AI phone answering on your own number"
        intro="Setup takes about 10 minutes, and you can hear it answer in your browser before a single customer calls."
        cards={[
          {
            icon: PhoneForwarded,
            title: "Connect a number",
            body: "Forward your line when it's busy, when nobody answers, after you close, or all the time. Starter and Pro include a number in the US, Canada, the UK, Australia or New Zealand.",
          },
          {
            icon: BookOpen,
            title: "Add what it should know",
            body: "Type in your hours, prices and policies, upload documents or import pages from your website. It answers callers from those sources.",
          },
          {
            icon: ListChecks,
            title: "Write your rules",
            body: "Use plain sentences, like \"Transfer anyone with no heat to the on-call phone.\" The receptionist reads your rules from the top of the list down.",
          },
          {
            icon: PhoneCall,
            title: "Place a test call",
            body: "Call it from the browser or from the trial number. The free plan includes 30 voice minutes and a US or Canadian number for 14 days.",
          },
        ]}
      />

      <IconGrid
        id="compare"
        title="How it compares with voicemail and live answering services"
        cards={[
          {
            icon: Voicemail,
            title: "Voicemail",
            body: "The caller leaves a message and waits. You learn what they wanted when you get to your voicemail.",
          },
          {
            icon: ListOrdered,
            title: "Phone menu",
            body: "Press 1 for service. A menu sends calls to the right line, but nobody answers the question or books the visit.",
          },
          {
            icon: Headset,
            title: "Live answering service",
            body: "A person reads your script and passes on a message. Most bill by the minute or by the call.",
          },
          {
            icon: AudioLines,
            title: "LobbyStack",
            body: "Answers, books and transfers by your rules, and a call at 2 a.m. costs the same as one at noon. Calls that need judgment still go to your team.",
          },
        ]}
      />

      <SplitSection
        id="open-source"
        eyebrow="Open source"
        title="Read the code that answers your phone"
        body="LobbyStack is open source under the MIT License. Use LobbyStack Cloud, or run it on your own server with your own Twilio and OpenAI accounts."
        media={<TileFieldArt />}
        action={
          <>
            <ButtonLink href="https://github.com/lobbystack/lobbystack" target="_blank" rel="noopener noreferrer">
              View on GitHub
            </ButtonLink>
            <ButtonLink href="/solutions/self-hosted-ai-receptionist/" variant="secondary">
              Self-host it
            </ButtonLink>
          </>
        }
      />

      <FaqAndRelated
        heading="Questions about AI phone answering services"
        faqs={aiPhoneAnsweringFaqs}
        locale={locale}
        related={[
          { label: "AI appointment setter", href: "/solutions/ai-appointment-scheduler/" },
          { label: "After-hours answering service", href: "/solutions/after-hours-answering-service/" },
          { label: "AI receptionist for home services", href: "/solutions/ai-receptionist-for-home-services/" },
          { label: "Missed-call calculator", href: "/missed-call-revenue-calculator/" },
          { label: "Pricing", href: "/pricing/" },
        ]}
      />

      <SolutionClosing
        title="Let LobbyStack answer the next call you can't take"
        body="Add your details, forward your number and call it yourself. The free plan includes 30 voice minutes."
        primary={signupLink("Try for free", signup, "phone_answering_closing")}
        secondary={{ label: "View pricing", href: "/pricing/" }}
        footnote="No credit card required. Cancel anytime."
      />
    </>
  )
}
