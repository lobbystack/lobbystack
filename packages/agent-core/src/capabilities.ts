import { canTextNumber, isTextChatChannel, normalizeAppointmentChangePolicy, normalizeBookingMode, type BookingMode, type BusinessContextSnapshot } from "@lobbystack/shared";

import type { AgentChannel, AgentToolContext } from "./tools";

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
  requestKeypadPasscode: { kind: "other", progress: "started the keypad PIN check" },
  cancelAppointment: { kind: "action", progress: "tried to cancel the appointment" },
  rescheduleAppointment: { kind: "action", progress: "tried to reschedule the appointment" },
  requestAppointmentCancellation: { kind: "action", progress: "tried to save the cancellation request" },
  transferCall: { kind: "action", progress: "tried to transfer the call" },
  requestTeamMember: { kind: "action", progress: "tried to ask the team to join the chat" },
  // Not an action: a call goes on after the caller called the hangup off, and the next request may end it again.
  endCall: { kind: "other", progress: "tried to end the call" },
} satisfies Record<string, { kind: ToolKind; progress: string }>;

export type ToolName = keyof typeof TOOL_USE;

/** A tool's kind and progress line. A name that isn't a receptionist tool counts as other. */
export function toolUse(name: string): { kind: ToolKind; progress: string } {
  return Object.hasOwn(TOOL_USE, name) ? TOOL_USE[name as ToolName] : { kind: "other", progress: `ran ${name}` };
}

/** What the decision reads from a conversation: the same fields the tools get. */
export type Conversation = Pick<AgentToolContext, "channel" | "callerPhone" | "callId" | "intakeOnly" | "callControl" | "conversationId" | "liveChat">;

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
  /** What GPT-Live does when the caller asks for a person on a browser call, which can't be transferred. Empty on a phone call. */
  livePersonRule: string;
  /** How GPT-Live asks for a keypad PIN on a phone call to a business that requires one. Empty otherwise. */
  liveKeypadPinRule: string;
};

const BOOKING_GUIDANCE: Record<BookingMode, string> = {
  instant: "You can book appointments. Use findAvailability to get open times and offer one or two. In the same reply, ask for anything the booking still needs that the caller hasn't given, such as their name or a phone number you don't have, so one yes books it. Once the caller accepts a time you offered, book it with bookAppointment without calling findAvailability again.",
  request: "You don't book directly. Collect the service, the caller's preferred day and time, their name and callback number, then use requestAppointment. Tell the caller the team will confirm the time.",
  off: "You don't book appointments. If the caller wants one, take a message so the team can follow up.",
};

// A website chat with live chat on: someone from the team can join the chat
// itself, during opening hours. When nobody can, the visitor gets a callback.
const LIVE_CHAT_GUIDANCE = [
  "Someone from the team can join this website chat, but the chat can't be transferred to a phone call.",
  "When the visitor asks for a person, or a rule says to transfer them, call requestTeamMember right away with what they need. It checks whether anyone can join now.",
  "When it succeeds, tell the visitor you've let the team know, someone will reply here shortly, and they can keep writing meanwhile. Never say or suggest someone has already joined.",
  "When it says nobody can join, offer to take a message so someone from the team calls them back: get their name and the best number to reach them, then save it with takeMessage.",
  "Never say or suggest the visitor is being transferred or connected to a phone call.",
].join(" ");

// Whether a phone call to the business can be put through to a person, under its transfer rule.
function takesTransfers(snapshot: BusinessContextSnapshot): boolean {
  return Boolean(snapshot.transferPolicy.transferNumber) && snapshot.transferPolicy.mode !== "never";
}

// Where someone on a browser call or a website chat can reach a person: the
// business's number, when a phone call there can be put through under its
// transfer rule. Otherwise nobody can be reached live.
function personFromWeb(snapshot: BusinessContextSnapshot): string {
  const phone = snapshot.contactChannels?.phoneNumber;
  if (!phone || !takesTransfers(snapshot)) return "tell them you can't connect them with anyone from here";
  switch (snapshot.transferPolicy.mode) {
    case "on_urgent": return `tell them that for something urgent they can call ${phone} and ask for a person`;
    case "during_business_hours": return `tell them they can call ${phone} during opening hours and ask for a person`;
    default: return `tell them they can call ${phone} and ask for a person`;
  }
}

/**
 * What to do when someone on a browser call or a website chat asks for a
 * person: neither can be transferred, so they get the number to call and the
 * offer of a callback. The business's rules and instructions are written for
 * phone calls and often say to transfer. `live` words it for GPT-Live, which
 * hands the callback request to the agent.
 */
function webPersonRule(snapshot: BusinessContextSnapshot, channel: Exclude<AgentChannel, "voice">, live = false): string {
  const who = channel === "web_chat" ? "visitor" : channel === "instagram" ? "person" : "caller";
  return [
    channel === "web_chat"
      ? "This website chat can't be transferred: you can't connect the visitor to a person or bring anyone else into the chat."
      : channel === "instagram"
        ? "This Instagram chat can't be transferred: you can't connect the person to someone from the team or bring anyone else into the chat."
        : "This call is in the caller's web browser, not on a phone line, so it can't be transferred: you can't connect the caller to a person or put anyone else on the call.",
    `Never say or suggest the ${who} is being transferred or connected to someone, even when a business rule or instruction says to transfer.`,
    channel === "instagram"
      // The team can answer in the same conversation, so a phone number is optional.
      ? `When the ${who} asks for a person, or a rule says to transfer them, ${personFromWeb(snapshot)}, and offer to take a message so someone from the team replies here: get their name, and a phone number only if they'd rather be called, then save it with takeMessage.`
      : `When the ${who} asks for a person, or a rule says to transfer them, ${personFromWeb(snapshot)}, and offer to take a message so someone from the team calls them back${live ? "." : ": get their name and the best number to reach them, then save it with takeMessage."}`,
  ].join(" ");
}

// Instant booking only offers times inside the opening hours, so without them
// nothing is bookable.
const NO_HOURS_GUIDANCE = "The business hasn't set its opening hours yet, so you can't book appointments. Don't offer times or say a time is taken. When a caller wants an appointment, take a message with their name, number, the service and their preferred time so the team can book it.";

// The caller's answer on file about texts (smsConsentOnFile) decides whether
// the agent asks. A caller answers once; after that the agent follows it. The
// answer has its own tool because GPT-Live may ask only after the booking.
const SAVE_TEXT_ANSWER = "Whenever the caller says whether they want texts, save their answer with recordTextPreference, even after the booking or cancellation is done. Their answer on this call replaces smsConsentOnFile: a no means no texts, even when it was subscribed. Only an answer about texts counts: a yes to a time or to booking isn't a yes to texts, and a no to texts isn't a no to the appointment. Once the caller answers, tell them whether they'll get texts only after recordTextPreference has saved it.";
const BOOKING_TEXT_GUIDANCE = "On a phone call, findAvailability returns smsConsentOnFile, the caller's earlier answer about texts from this business. When it's not_asked, or missing, ask together with the time you offer, in the language of the call: \"Can I text this number with your appointment confirmation and reminder? Message and data rates may apply. Reply STOP to opt out or HELP for help.\" When it's subscribed, don't ask: tell the caller they'll get a confirmation text. When it's declined or opted_out, don't ask and don't mention texts.";
const CANCELLATION_TEXT_GUIDANCE = "Once verifyAppointmentForChange or verifyAppointmentChangeOtp verifies a cancellation, its result has smsConsentOnFile. When it's not_asked, ask once, together with the final confirmation and in the language of the call: \"Can I text this number to confirm the cancellation? Message and data rates may apply. Reply STOP to opt out or HELP for help.\" When it's subscribed, don't ask: tell the caller they'll get a text confirming the cancellation. When it's declined or opted_out, don't ask and don't mention texts.";
// With a keypad PIN, the caller confirms right after the PIN, before the agent
// knows their answer about texts, so the question follows the cancellation.
const PIN_CANCELLATION_TEXT_GUIDANCE = "Once the keypad PIN check accepts a cancellation, its result has smsConsentOnFile. When it's not_asked, ask once, right after cancelling and in the language of the call: \"Can I text this number to confirm the cancellation? Message and data rates may apply. Reply STOP to opt out or HELP for help.\" When it's subscribed, don't ask: tell the caller they'll get a text confirming the cancellation. When it's declined or opted_out, don't ask and don't mention texts.";

// The business requires a PIN typed on the keypad. Only the call controller
// sees the digits; the agent learns the outcome in a later request.
const KEYPAD_PIN_GUIDANCE = "This business also requires the caller's PIN before any change. When verifyAppointmentForChange says a PIN is required, start the check with requestKeypadPasscode. The caller types the PIN on their phone keypad and the call checks it, so you never see it: never ask for the PIN aloud, and never accept one the caller says. The outcome appears under \"Keypad PIN check in this call\" in a later request. Once it's accepted, make the change when the caller confirms, with the verificationId and appointmentId it gives, and don't ask for the PIN again. When the check fails, or the caller has no PIN or it's locked, don't make the change: for a cancellation, save the request with requestAppointmentCancellation as above, and for anything else, offer to take a message.";
// GPT-Live never hears keypad presses: the worker checks the PIN and tells it the outcome.
const LIVE_KEYPAD_PIN_RULE = "When a backend result says the caller has to type their PIN on the keypad, ask them to type it on their phone keypad and press the pound key, then wait quietly while they do. Never ask them to say their PIN. If they say digits aloud, don't repeat them: ask them to use the keypad instead. You'll be told whether the PIN was accepted; until then, don't say it was.";

function employeeGuidance(snapshot: BusinessContextSnapshot, booking: BookingMode): string {
  if (!snapshot.employees?.length || booking === "off") return "";
  const names = snapshot.employees.map((employee) => employee.name).join(", ");
  return booking === "instant"
    ? `Callers can book with a specific employee: ${names}. Before you look up open times, ask whether the caller would like a specific employee, unless they already said. If they name one, pass that name as employeeName to findAvailability and bookAppointment. If they have no preference, leave employeeName out and whoever is available first gets the appointment. When bookAppointment's result names an employee, tell the caller who they're booked with.`
    : `Callers can ask for a specific employee: ${names}. Ask whether the caller would like one, and include their choice in the request's notes.`;
}

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
  // The business may also require a PIN typed on the keypad, which only a
  // phone call's controls can take.
  const keypadPin = changePolicy.verificationMode === "passcode_required";
  // The transfer tool still checks the rules for each request, such as on_urgent.
  const transfers = !intakeOnly && takesTransfers(snapshot);
  const callerTextable = channel === "voice" && canTextNumber(snapshot.contactChannels?.smsNumber, callerPhone);
  // Browser calls and website chats have no trusted caller number.
  const changes = Boolean(callerPhone) && (cancels || reschedules) && (!keypadPin || Boolean(callControl?.collectPasscode));
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
    sendAppointmentChangeOtp: changes && !keypadPin,
    verifyAppointmentChangeOtp: changes && !keypadPin,
    requestKeypadPasscode: changes && keypadPin,
    cancelAppointment: changes && cancels,
    rescheduleAppointment: changes && reschedules,
    // Offered next to cancelAppointment too, for an appointment the caller's
    // number doesn't find or verify.
    requestAppointmentCancellation: booking !== "off",
    // Only phone calls can transfer.
    transferCall: Boolean(callControl?.transfer) && transfers,
    // Website chats whose widget lets the team join: requestTeamMember checks the opening hours when it's used.
    requestTeamMember: channel === "web_chat" && Boolean(conversation.liveChat && conversation.conversationId) && !intakeOnly,
    endCall: Boolean(callControl),
  };
  const voice = !isTextChatChannel(channel);
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
      employeeGuidance(snapshot, booking),
      // A phone call can come from another number than the booking's, and
      // callers must not hang up thinking it's done.
      !offered.requestAppointmentCancellation
        ? ""
        : offered.cancelAppointment
          ? [
            "To verify an appointment the caller wants to change, you need its time or its service, not their name. When verification fails because the caller hasn't said either yet, ask for it and verify again. When it still fails with the time or service, or the caller isn't calling from the number it was booked with, don't take a message: ask for the name it's booked under and its date, time and service, save the request with requestAppointmentCancellation, and tell the caller the team will take care of the cancellation. Never say or suggest the appointment is already cancelled.",
            callerTextable ? (keypadPin ? PIN_CANCELLATION_TEXT_GUIDANCE : CANCELLATION_TEXT_GUIDANCE) : "This business can't text the caller's number, so don't offer or mention a text about a cancellation.",
          ].join("\n\n")
          : `You can't cancel appointments ${voice ? "on this call" : "in this chat"}. When the caller asks to cancel one, tell them that plainly and that the team will take care of the cancellation. Ask for the name it's booked under and its date, time and service, then save the request with requestAppointmentCancellation. Never say or suggest the appointment is already cancelled.`,
      offered.requestKeypadPasscode ? KEYPAD_PIN_GUIDANCE : "",
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
      // With live chat on, someone from the team can join the chat instead.
      offered.requestTeamMember
        ? LIVE_CHAT_GUIDANCE
        : channel === "voice" ? "Transfer to a person only when the transfer rules allow it; otherwise offer to take a message." : webPersonRule(snapshot, channel),
      offered.transferCall && phone && snapshot.employees?.length
        ? "When the caller asks to speak with a specific employee, pass that employee's name as employeeName to transferCall."
        : "",
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
          ? `- Appointment changes: ${changeVerbs} an appointment when the call comes from the phone number it was booked with${keypadPin ? " and the caller types their PIN on the phone keypad" : ""}. ${cancels ? `When it can't find or verify the appointment, as on a call from another number${keypadPin ? " or without the PIN" : ""}, the backend passes a cancellation request to the team, and the appointment stays booked until the team cancels it.` : "The backend passes a cancellation request to the team, and the appointment stays booked until the team cancels it."}`
          : phone
            ? "- Appointment cancellations: the backend passes a cancellation request to the team. The appointment stays booked until the team cancels it."
            : "- Appointment cancellations: a browser call has no phone number to identify the caller, so the backend passes a cancellation request to the team. The appointment stays booked until the team cancels it.",
      phone ? "- Messages: take a message for the team." : "- Messages: take a message for the team, such as a request to be called back.",
      phone && transfers
        ? snapshot.employees?.length
          ? "- Transfers: connect the caller to a person, or to an employee they ask for by name, when the business allows it."
          : "- Transfers: connect the caller to a person when the business allows it."
        : "",
      "- Ending the call: hang up when the caller is done, or on a spam or abusive call.",
    ].filter(Boolean),
    // After the business's own rules and instructions, which may say to transfer.
    livePersonRule: channel === "web_voice" ? webPersonRule(snapshot, channel, true) : "",
    liveKeypadPinRule: changeVerbs && keypadPin ? LIVE_KEYPAD_PIN_RULE : "",
  };
}
