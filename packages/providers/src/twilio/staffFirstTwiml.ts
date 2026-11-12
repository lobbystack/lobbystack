import type { RuntimeLocale } from "@lobbystack/shared";
import twilio from "twilio";

// The TwiML behind staff answers first. See docs/specs/staff-answers-first.md.

type Response = InstanceType<typeof twilio.twiml.VoiceResponse>;

/** Amazon Polly has no Serbian, Vietnamese, Tagalog or Ukrainian voice, so those businesses' staff hear the English prompt and callers hear no message. */
const SAY_VOICES: Partial<Record<RuntimeLocale, { voice: `Polly.${string}`; language: string }>> = {
  en: { voice: "Polly.Joanna-Neural", language: "en-US" },
  fr: { voice: "Polly.Gabrielle-Neural", language: "fr-CA" },
  es: { voice: "Polly.Mia-Neural", language: "es-MX" },
  de: { voice: "Polly.Vicki-Neural", language: "de-DE" },
  pt: { voice: "Polly.Camila-Neural", language: "pt-BR" },
  it: { voice: "Polly.Bianca-Neural", language: "it-IT" },
  nl: { voice: "Polly.Laura-Neural", language: "nl-NL" },
  pl: { voice: "Polly.Ola-Neural", language: "pl-PL" },
  tr: { voice: "Polly.Burcu-Neural", language: "tr-TR" },
  sv: { voice: "Polly.Elin-Neural", language: "sv-SE" },
  // Polly has no neural Russian voice.
  ru: { voice: "Polly.Tatyana", language: "ru-RU" },
};

type StaffPromptCopy = { withCaller: (business: string, caller: string) => string; withheld: (business: string) => string };

const STAFF_PROMPTS: Partial<Record<RuntimeLocale, StaffPromptCopy>> & { en: StaffPromptCopy } = {
  en: { withCaller: (business, caller) => `Call for ${business} from ${caller}. Press 1 to answer.`, withheld: (business) => `Call for ${business} from a private number. Press 1 to answer.` },
  fr: { withCaller: (business, caller) => `Appel pour ${business} de ${caller}. Appuyez sur 1 pour répondre.`, withheld: (business) => `Appel pour ${business} d'un numéro masqué. Appuyez sur 1 pour répondre.` },
  es: { withCaller: (business, caller) => `Llamada para ${business} de ${caller}. Pulse 1 para contestar.`, withheld: (business) => `Llamada para ${business} de un número privado. Pulse 1 para contestar.` },
  de: { withCaller: (business, caller) => `Anruf für ${business} von ${caller}. Drücken Sie die 1, um anzunehmen.`, withheld: (business) => `Anruf für ${business} von einer unterdrückten Nummer. Drücken Sie die 1, um anzunehmen.` },
  pt: { withCaller: (business, caller) => `Chamada para ${business} de ${caller}. Pressione 1 para atender.`, withheld: (business) => `Chamada para ${business} de um número privado. Pressione 1 para atender.` },
  it: { withCaller: (business, caller) => `Chiamata per ${business} da ${caller}. Premi 1 per rispondere.`, withheld: (business) => `Chiamata per ${business} da un numero privato. Premi 1 per rispondere.` },
  nl: { withCaller: (business, caller) => `Oproep voor ${business} van ${caller}. Druk op 1 om op te nemen.`, withheld: (business) => `Oproep voor ${business} van een afgeschermd nummer. Druk op 1 om op te nemen.` },
  pl: { withCaller: (business, caller) => `Połączenie do ${business} od ${caller}. Naciśnij 1, aby odebrać.`, withheld: (business) => `Połączenie do ${business} z numeru zastrzeżonego. Naciśnij 1, aby odebrać.` },
  tr: { withCaller: (business, caller) => `${business} için ${caller} numarasından arama. Cevaplamak için 1'e basın.`, withheld: (business) => `${business} için gizli numaradan arama. Cevaplamak için 1'e basın.` },
  sv: { withCaller: (business, caller) => `Samtal till ${business} från ${caller}. Tryck 1 för att svara.`, withheld: (business) => `Samtal till ${business} från ett dolt nummer. Tryck 1 för att svara.` },
  ru: { withCaller: (business, caller) => `Звонок для ${business} от ${caller}. Нажмите 1, чтобы ответить.`, withheld: (business) => `Звонок для ${business} со скрытого номера. Нажмите 1, чтобы ответить.` },
};

/** How long a staff member gets to press 1 after each reading of the prompt. A phone's voicemail never presses it. */
const PRESS_SECONDS = 6;

/** Twilio adds this much to every <Dial> timeout. */
const DIAL_TIMEOUT_BUFFER_SECONDS = 5;
const DIAL_TIMEOUT_MIN_SECONDS = 5;

/** The longest a staff-answered call runs. Twilio's default is four hours, and these calls use no plan minutes. */
export const STAFF_CALL_LIMIT_SECONDS = 30 * 60;

function respond(build: (response: Response) => void): string {
  const response = new twilio.twiml.VoiceResponse();
  build(response);
  return response.toString();
}

function say(response: Response, locale: RuntimeLocale, text: string | undefined): void {
  const voice = SAY_VOICES[locale];
  if (text && voice) response.say(voice as Parameters<Response["say"]>[0], text);
}

export function rejectTwiml(): string {
  return respond((response) => response.reject({ reason: "busy" }));
}

export function hangupTwiml(): string {
  return respond((response) => response.hangup());
}

/** Ends a webhook with nothing to do: a call the caller already left, or a staff member who pressed 1, which bridges the call. */
export function emptyTwiml(): string {
  return respond(() => undefined);
}

export function forwardTwiml(to: string): string {
  return respond((response) => { response.dial(to); });
}

/** The optional message, then the staff phone. The caller hears ringing, and the staff leg answers `promptUrl` before it bridges. */
export function ringStaffTwiml(input: { staffPhone: string; ringSeconds: number; message?: string | undefined; locale: RuntimeLocale; actionUrl: string; promptUrl: string }): string {
  return respond((response) => {
    say(response, input.locale, input.message);
    const dial = response.dial({ answerOnBridge: true, action: input.actionUrl, method: "POST", timeout: Math.max(DIAL_TIMEOUT_MIN_SECONDS, input.ringSeconds - DIAL_TIMEOUT_BUFFER_SECONDS), timeLimit: STAFF_CALL_LIMIT_SECONDS });
    dial.number({ url: input.promptUrl, method: "POST" }, input.staffPhone);
  });
}

/**
 * Hands the call to GPT-Live. X-LobbyStack-Called is how /api/webhooks/openai/live
 * learns the dialled number, and `referUrl` is how a transfer leaves this leg:
 * without it, Twilio refuses the REFER with error 13802.
 */
export function dialAgentTwiml(input: { sipAddress: string; called: string; message?: string | undefined; locale: RuntimeLocale; actionUrl: string; referUrl: string }): string {
  return respond((response) => {
    say(response, input.locale, input.message);
    const dial = response.dial({ answerOnBridge: true, action: input.actionUrl, method: "POST", referUrl: input.referUrl, referMethod: "POST" });
    dial.sip(`${input.sipAddress}?X-LobbyStack-Called=tel:${input.called}`);
  });
}

/** Reads a phone number digit by digit, which is how a person takes it down. */
function spokenPhone(phone: string): string {
  return phone.replace(/\D/g, "").split("").join(", ");
}

/** What the staff leg hears. It hangs up unless someone presses 1, so a voicemail greeting leaves the call to the agent. */
export function staffPromptTwiml(input: { business: string; caller: { name?: string | null | undefined; phone?: string | undefined }; locale: RuntimeLocale; pressUrl: string }): string {
  const copy = STAFF_PROMPTS[input.locale] ?? STAFF_PROMPTS.en;
  const who = input.caller.name?.trim() || (input.caller.phone ? spokenPhone(input.caller.phone) : undefined);
  const text = who ? copy.withCaller(input.business, who) : copy.withheld(input.business);
  const voice = SAY_VOICES[input.locale] ?? SAY_VOICES.en!;
  return respond((response) => {
    const gather = response.gather({ numDigits: 1, timeout: PRESS_SECONDS, action: input.pressUrl, method: "POST" });
    gather.say({ ...voice, loop: 2 } as Parameters<typeof gather.say>[0], text);
    response.hangup();
  });
}

export function staffPressTwiml(digits: string | undefined): string {
  return digits === "1" ? emptyTwiml() : hangupTwiml();
}

/** Dials the target the agent chose. Twilio sends it as a phone number or a SIP or tel URI. */
export function referTwiml(target: string): string {
  return respond((response) => { response.dial({ answerOnBridge: true }, target); });
}

/** Whether the call is over for the caller: Twilio runs no more TwiML, so a webhook has nothing to answer with. */
function callerGone(params: Record<string, string | undefined>): boolean {
  return params.CallStatus === "completed" || params.CallStatus === "canceled";
}

/**
 * How a ring of the staff phone ended. Only DialBridged says a person took the
 * call: Twilio reports DialCallStatus=completed when a voicemail answers and
 * nobody presses 1.
 */
export function staffDialOutcome(params: Record<string, string | undefined>): "accepted" | "caller_gone" | "handover" {
  if (params.DialBridged === "true") return "accepted";
  return callerGone(params) ? "caller_gone" : "handover";
}

/**
 * How the <Sip> leg to GPT-Live ended. GPT-Live refusing the call reaches this
 * as a failed DialCallStatus. DialSipResponseCode says why when Twilio sends it,
 * and only a 603, a blocked caller, changes the answer: a 503 or 486, or a
 * refusal with no code, goes to the same fallback a trunk's refused call does.
 */
export function agentDialOutcome(params: Record<string, string | undefined>): "finished" | "blocked" | "refused" {
  if (params.DialBridged === "true" || params.DialCallStatus === "completed" || callerGone(params)) return "finished";
  return params.DialSipResponseCode === "603" ? "blocked" : "refused";
}

/** The phone number in a REFER's target, or undefined when it holds none: `+14165550100`, `tel:+14165550100` or `<sip:+14165550100@host>`. */
export function referTargetPhone(target: string | undefined): string | undefined {
  const digits = /(?:^|[:<])(\+?\d{6,15})(?=$|[@;>?])/.exec(target?.trim() ?? "")?.[1];
  if (!digits) return undefined;
  return digits.startsWith("+") ? digits : `+${digits}`;
}
