import { canTextNumber, normalizeAppointmentChangePolicy, normalizeBookingMode, type BookingMode, type BusinessContextSnapshot } from "@lobbystack/shared";

import type { AgentToolContext } from "./tools";

/**
 * What a call keeps from a tool's result for its next request:
 * - action: it changed something. The next request sees the result, so a
 *   changed request reschedules instead of booking twice.
 * - answer: the caller's answer about texts. The next request sees only the
 *   latest one, and saving it doesn't count as booking or changing anything.
 * - reusable_lookup: the next request can reuse the latest one instead of repeating it.
 * - other: nothing.
 */
export type ToolKind = "action" | "answer" | "reusable_lookup" | "other";

// Each tool's kind, and how a progress update on a call says it ran.
const TOOL_USE = {
  getBusinessHours: { kind: "other", progress: "looked up the opening hours" },
  getBusinessServices: { kind: "other", progress: "looked up the services" },
  searchKnowledge: { kind: "other", progress: "searched the business's documents" },
  takeMessage: { kind: "action", progress: "tried to save the message" },
  findAvailability: { kind: "reusable_lookup", progress: "looked up open times" },
  bookAppointment: { kind: "action", progress: "tried to book the appointment" },
  recordTextPreference: { kind: "answer", progress: "tried to save the caller's answer about texts" },
  requestAppointment: { kind: "action", progress: "tried to save the appointment request" },
  lookupAppointmentForChange: { kind: "other", progress: "looked up the caller's appointment" },
  verifyAppointmentForChange: { kind: "other", progress: "checked the caller's identity" },
  sendAppointmentChangeOtp: { kind: "other", progress: "sent a verification code" },
  verifyAppointmentChangeOtp: { kind: "other", progress: "checked the verification code" },
  cancelAppointment: { kind: "action", progress: "tried to cancel the appointment" },
  rescheduleAppointment: { kind: "action", progress: "tried to reschedule the appointment" },
  requestAppointmentCancellation: { kind: "action", progress: "tried to save the cancellation request" },
  transferCall: { kind: "action", progress: "tried to transfer the call" },
  // Not an action: a call goes on after the caller called the hangup off, and the next request may end it again.
  endCall: { kind: "other", progress: "tried to end the call" },
} satisfies Record<string, { kind: ToolKind; progress: string }>;

export type ToolName = keyof typeof TOOL_USE;

/** A tool's kind and progress line. A name that isn't a receptionist tool counts as other. */
export function toolUse(name: string): { kind: ToolKind; progress: string } {
  return Object.hasOwn(TOOL_USE, name) ? TOOL_USE[name as ToolName] : { kind: "other", progress: `ran ${name}` };
}

/** What the decision reads from a conversation: the same fields the tools get. */
export type Conversation = Pick<AgentToolContext, "channel" | "callerPhone" | "callId" | "intakeOnly" | "callControl">;

export type Capabilities = {
  /** The tools the agent gets. */
  tools: ToolName[];
  /**
   * A phone call the business can text back. Tool results then carry the
   * caller's answer on file about texts, which belongs to the call's own
   * number, never to one someone typed or said.
   */
  callerTextable: boolean;
  /** What the agent's instructions say about those tools. */
  guidance: string[];
  /**
   * The backend tools GPT-Live's instructions list for a call on this
   * channel. They're set before the caller's number is known, so a phone
   * call's list covers a call from the number an appointment was booked with.
   */
  live: string[];
};

const BOOKING_GUIDANCE: Record<BookingMode, string> = {
  instant: "You can book appointments. Use findAvailability to get open times and offer one or two. In the same reply, ask for anything the booking still needs that the caller hasn't given, such as their name or a phone number you don't have, so one yes books it. Once the caller accepts a time you offered, book it with bookAppointment without calling findAvailability again.",
  request: "You don't book directly. Collect the service, the caller's preferred day and time, their name and callback number, then use requestAppointment. Tell the caller the team will confirm the time.",
  off: "You don't book appointments. If the caller wants one, take a message so the team can follow up.",
};

// Instant booking only offers times inside the opening hours, so without them
// nothing is bookable.
const NO_HOURS_GUIDANCE = "The business hasn't set its opening hours yet, so you can't book appointments. Don't offer times or say a time is taken. When a caller wants an appointment, take a message with their name, number, the service and their preferred time so the team can book it.";

// The caller's answer on file about texts (smsConsentOnFile) decides whether
// the agent asks. A caller answers once; after that the agent follows it. The
// answer has its own tool because GPT-Live may ask only after the booking.
const SAVE_TEXT_ANSWER = "Whenever the caller says whether they want texts, save their answer with recordTextPreference, even after the booking or cancellation is done. Their answer on this call replaces smsConsentOnFile: a no means no texts, even when it was subscribed. Only an answer about texts counts: a yes to a time or to booking isn't a yes to texts, and a no to texts isn't a no to the appointment. Once the caller answers, tell them whether they'll get texts only after recordTextPreference has saved it.";
const BOOKING_TEXT_GUIDANCE = "On a phone call, findAvailability returns smsConsentOnFile, the caller's earlier answer about texts from this business. When it's not_asked, or missing, ask together with the time you offer, in the language of the call: \"Can I text this number with your appointment confirmation and reminder? Message and data rates may apply. Reply STOP to opt out or HELP for help.\" When it's subscribed, don't ask: tell the caller they'll get a confirmation text. When it's declined or opted_out, don't ask and don't mention texts.";
const CANCELLATION_TEXT_GUIDANCE = "Once verifyAppointmentForChange or verifyAppointmentChangeOtp verifies a cancellation, its result has smsConsentOnFile. When it's not_asked, ask once, together with the final confirmation and in the language of the call: \"Can I text this number to confirm the cancellation? Message and data rates may apply. Reply STOP to opt out or HELP for help.\" When it's subscribed, don't ask: tell the caller they'll get a text confirming the cancellation. When it's declined or opted_out, don't ask and don't mention texts.";

/**
 * Which tools the agent gets on a conversation, what its instructions say
 * about them, and what GPT-Live hears the backend can do. Every place that
 * offers or describes a tool reads this one decision.
 */
export function receptionistCapabilities(snapshot: BusinessContextSnapshot, conversation: Conversation): Capabilities {
  const { channel, callerPhone, callControl, intakeOnly } = conversation;
  // Prospect demos only answer questions and take messages: no booking, no transfers.
  const booking: BookingMode = intakeOnly ? "off" : normalizeBookingMode(snapshot.bookingMode);
  // Changing an appointment identifies the caller by a trusted phone number.
  // The business can turn it off, or leave every change to its team.
  const changePolicy = normalizeAppointmentChangePolicy(snapshot.appointmentChangePolicy);
  const selfService = booking !== "off" && changePolicy.enabled && changePolicy.verificationMode !== "operator_only";
  const cancels = selfService && changePolicy.allowCancel;
  const reschedules = selfService && changePolicy.allowReschedule && booking === "instant";
  // The transfer tool still checks the rules for each request, such as on_urgent.
  const transfers = !intakeOnly && Boolean(snapshot.transferPolicy.transferNumber) && snapshot.transferPolicy.mode !== "never";
  const callerTextable = channel === "voice" && canTextNumber(snapshot.contactChannels?.smsNumber, callerPhone);
  // Browser calls and website chats have no trusted caller number.
  const changes = Boolean(callerPhone) && (cancels || reschedules);
  const offered: Record<ToolName, boolean> = {
    getBusinessHours: true,
    getBusinessServices: true,
    searchKnowledge: true,
    takeMessage: true,
    findAvailability: booking === "instant",
    bookAppointment: booking === "instant",
    recordTextPreference: callerTextable && Boolean(conversation.callId) && booking !== "off",
    requestAppointment: booking === "request",
    lookupAppointmentForChange: changes,
    verifyAppointmentForChange: changes,
    sendAppointmentChangeOtp: changes,
    verifyAppointmentChangeOtp: changes,
    cancelAppointment: changes && cancels,
    rescheduleAppointment: changes && reschedules,
    // Offered next to cancelAppointment too, for an appointment the caller's
    // number doesn't find or verify.
    requestAppointmentCancellation: booking !== "off",
    // Only phone calls can transfer.
    transferCall: Boolean(callControl?.transfer) && transfers,
    endCall: Boolean(callControl),
  };
  const voice = channel !== "web_chat";
  // GPT-Live's list. Live calls are phone or browser calls, and every one can be ended.
  const phone = channel === "voice";
  const changeVerbs = phone ? [reschedules ? "reschedule" : "", cancels ? "cancel" : ""].filter(Boolean).join(" or ") : "";
  return {
    tools: (Object.keys(offered) as ToolName[]).filter((name) => offered[name]),
    callerTextable,
    guidance: [
      intakeOnly
        ? "This is a demo of the receptionist. Answer questions and take messages only. Don't book or check appointments, don't transfer the call, and don't promise texts or emails."
        : BOOKING_GUIDANCE[booking],
      // A phone call can come from another number than the booking's, and
      // callers must not hang up thinking it's done.
      !offered.requestAppointmentCancellation
        ? ""
        : offered.cancelAppointment
          ? [
            "To verify an appointment the caller wants to change, you need its time or its service, not their name. When verification fails because the caller hasn't said either yet, ask for it and verify again. When it still fails with the time or service, or the caller isn't calling from the number it was booked with, don't take a message: ask for the name it's booked under and its date, time and service, save the request with requestAppointmentCancellation, and tell the caller the team will take care of the cancellation. Never say or suggest the appointment is already cancelled.",
            callerTextable ? CANCELLATION_TEXT_GUIDANCE : "This business can't text the caller's number, so don't offer or mention a text about a cancellation.",
          ].join("\n\n")
          : `You can't cancel appointments ${voice ? "on this call" : "in this chat"}. When the caller asks to cancel one, tell them that plainly and that the team will take care of the cancellation. Ask for the name it's booked under and its date, time and service, then save the request with requestAppointmentCancellation. Never say or suggest the appointment is already cancelled.`,
      offered.bookAppointment
        ? snapshot.hours.length
          ? "When a booking tool says a time isn't available, tell the caller the reason it gives. Say a time is taken only when the tool says it's already booked."
          : NO_HOURS_GUIDANCE
        : "",
      offered.bookAppointment
        ? callerTextable
          ? BOOKING_TEXT_GUIDANCE
          : channel === "voice"
            ? "This business can't text the caller's number, so don't offer a text confirmation or reminder."
            : "Texts can only be set up on a phone call, so don't offer or promise a text confirmation or reminder."
        : "",
      // Once, for the booking and the cancellation question alike.
      offered.recordTextPreference ? SAVE_TEXT_ANSWER : "",
      // The voice model says goodbye once it hears the call is ending, and a
      // reply here would be a second one.
      offered.endCall
        ? "When the request is that the caller is done or is saying goodbye, end the call with endCall and the reason caller_finished, and don't write a reply: the voice model says goodbye when it hears the call is ending. For a spam or abusive call, use the reason spam or abuse."
        : "",
    ].filter(Boolean),
    live: [
      "- Knowledge: business facts not listed below, such as prices, policies, parking and what to bring.",
      booking === "instant" && snapshot.hours.length ? "- Appointments: check open times and book appointments." : "",
      // Without opening hours nothing is bookable, so the backend takes the request as a message.
      booking === "instant" && !snapshot.hours.length ? "- Appointment requests: the business hasn't set opening hours, so the backend can't book. It takes the caller's preferred time as a message for the team." : "",
      booking === "request" ? "- Appointment requests: pass a requested day and time to the team, who confirm it." : "",
      booking === "off"
        ? ""
        : changeVerbs
          ? `- Appointment changes: ${changeVerbs} an appointment when the call comes from the phone number it was booked with. ${cancels ? "When it can't find or verify the appointment, as on a call from another number, the backend passes a cancellation request to the team, and the appointment stays booked until the team cancels it." : "The backend passes a cancellation request to the team, and the appointment stays booked until the team cancels it."}`
          : "- Appointment cancellations: the backend passes a cancellation request to the team. The appointment stays booked until the team cancels it.",
      "- Messages: take a message for the team.",
      phone && transfers ? "- Transfers: connect the caller to a person when the business allows it." : "",
      "- Ending the call: hang up when the caller is done, or on a spam or abusive call.",
    ].filter(Boolean),
  };
}
