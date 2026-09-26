import type { BusinessContextSnapshot } from "@lobbystack/shared";
import { DateTime } from "luxon";

import type { AgentChannel } from "./tools";

function businessFacts(snapshot: BusinessContextSnapshot): string[] {
  const rules = (snapshot.rules ?? []).slice().sort((left, right) => left.order - right.order);
  return [
    `Business: ${snapshot.displayName}.`,
    `Summary: ${snapshot.summary}`,
    `Services: ${snapshot.services.map((service) => `${service.name} (${service.durationMinutes} min)`).join(", ") || "none configured"}.`,
    `Booking policy: ${snapshot.bookingPolicy}`,
    rules.length ? `Customer rules, in priority order:\n${rules.map((rule, index) => `${index + 1}. ${rule.title}: ${rule.content}`).join("\n")}` : "",
    snapshot.knowledgeSnippets?.length ? `FAQs:\n${snapshot.knowledgeSnippets.map((snippet) => `- ${snippet.title}: ${snippet.content}`).join("\n")}` : "",
  ].filter(Boolean);
}

// Instructions for the text agent that does the work. On voice it runs behind
// GPT-Live, so its reply is spoken to the caller by the live model.
export function buildAgentInstructions(snapshot: BusinessContextSnapshot, channel: AgentChannel): string {
  const now = DateTime.now().setZone(snapshot.timezone);
  return [
    `You are the receptionist for ${snapshot.displayName}. You represent this business, not the software platform.`,
    channel === "voice"
      ? "A live voice model is on the phone with the caller and hands you tasks. Reply with what it should say next: one or two short spoken sentences, no markdown, no lists, no URLs."
      : "You are chatting with a website visitor. Reply in short, plain paragraphs.",
    "Use tools for opening hours, appointment availability, and taking messages. Never state availability without calling findAvailability.",
    "Work out relative dates yourself (\"tomorrow\", \"next Tuesday\") from the current date below; never ask the caller for a calendar date they already described. Treat \"morning\" as 09:00 and \"afternoon\" as 13:00.",
    "If you are missing something you need (the service, the caller's name or number), say exactly what to ask the caller.",
    "Never invent business facts. If the facts below don't answer the question, say you're not sure and offer to take a message.",
    `Current date and time at the business: ${now.toFormat("cccc, LLLL d, yyyy, h:mm a")} (${snapshot.timezone}).`,
    ...businessFacts(snapshot),
  ].join("\n\n");
}

// Instructions for GPT-Live itself: talk naturally, delegate anything that needs
// a lookup or an action, and speak the backend's result.
export function buildLiveInstructions(snapshot: BusinessContextSnapshot): string {
  return [
    `You are the phone receptionist for ${snapshot.displayName}. You represent this business, not the software platform.`,
    `Greet the caller with: "${snapshot.greeting}"`,
    snapshot.voiceInstructions,
    "Speak briefly and warmly. Start in the language of the greeting and switch when the caller clearly uses another language.",
    "Delegate to the backend whenever the caller asks about opening hours, appointment availability, wants to leave a message, or asks a business question you can't answer from the summary below. Tell the caller you're checking while you wait, then say the backend's answer naturally.",
    "Never make up availability, prices, or policies.",
    `Business summary: ${snapshot.summary}`,
  ].join("\n\n");
}
