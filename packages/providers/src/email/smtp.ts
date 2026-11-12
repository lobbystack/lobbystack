import { createHash } from "node:crypto";

import { parsePhoneNumberFromString } from "libphonenumber-js";
import nodemailer, { type Transporter } from "nodemailer";
import { DEFAULT_APP_NAME, assertCertificationRecipient, intlLocale, type CallSummaryEmailDetails, type EmailBrand } from "@lobbystack/shared";

export type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
  from: string;
};

export type TemplateName = "existing_account" | "account_setup" | "verify_email" | "password_reset" | "passkey_added" | "invitation" | "operator_alert" | "feedback_submission" | "welcome" | "plan_reminder" | "number_trial" | "number_release" | "partner_pool_alert" | "business_allowance_alert" | "partner_business_allowance_alert" | "business_released" | "business_deleted" | "call_summary";

/**
 * The marketing emails: the host's lifecycle emails that sell or nudge, which
 * the law and the mailbox providers say a person must be able to stop. Each
 * carries a List-Unsubscribe header with one-click unsubscribe (RFC 8058) and
 * an Unsubscribe link in its footer, and the worker skips one to a person who
 * unsubscribed. A new lifecycle email joins this list to get all three.
 *
 * - Marketing: `welcome` (after onboarding) and `plan_reminder` (both reminders to choose a plan).
 * - Transactional, always sent: the number trial emails (day10, day13, ended,
 *   minutes_out) and `number_release`, which tell an owner what happens to a
 *   number they hold; sign-in and account emails (`verify_email`,
 *   `password_reset`, `existing_account`, `account_setup`, `passkey_added`);
 *   `invitation`; `operator_alert` and `call_summary`, which the business's
 *   notification settings control; `feedback_submission`; the pool and
 *   allowance alerts; and the notices that a business was released or deleted.
 */
export const MARKETING_EMAIL_TEMPLATES = ["welcome", "plan_reminder"] as const satisfies readonly TemplateName[];

export function isMarketingEmailTemplate(template: unknown): template is (typeof MARKETING_EMAIL_TEMPLATES)[number] {
  return typeof template === "string" && (MARKETING_EMAIL_TEMPLATES as readonly string[]).includes(template);
}

/** Where a marketing email's recipient unsubscribes: the page its footer links to, and the URL mail apps POST to for one-click unsubscribe. */
export type EmailUnsubscribeLinks = { pageUrl: string; oneClickUrl: string };

/**
 * Whether the mail provider refused the message for good. An SMTP 5xx
 * response names a permanent rejection, such as a sender domain the API key
 * may not use, so retrying the same message cannot succeed.
 */
export function isPermanentSmtpRejection(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { responseCode, response } = error as { responseCode?: unknown; response?: unknown };
  if (typeof responseCode === "number") return responseCode >= 500 && responseCode <= 599;
  if (typeof response === "string") {
    const code = Number(/^\s*(\d{3})\b/.exec(response)?.[1]);
    return code >= 500 && code <= 599;
  }
  return false;
}

export class SmtpEmailProvider {
  private readonly transporter: Transporter;
  private readonly config: SmtpConfig;

  constructor(config: SmtpConfig, transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.username, pass: config.password },
  })) {
    this.config = config;
    this.transporter = transporter;
  }

  /**
   * Sends one email under `brand`: the template writes the brand's name, logo
   * and links, and the subject when the caller gives none. The caller picks
   * the sender and Reply-To (emailSender in @lobbystack/shared); with no
   * sender, the email goes out from EMAIL_FROM. A marketing email needs its
   * recipient's unsubscribe links, and goes out with them in its headers and
   * footer; any other email ignores them.
   */
  async sendTemplate(input: { template: TemplateName; to: string; subject?: string; variables: Record<string, string>; brand: EmailBrand; idempotencyKey?: string; from?: string; replyTo?: string; unsubscribe?: EmailUnsubscribeLinks }): Promise<{ messageId: string }> {
    assertCertificationRecipient("email", input.to);
    const unsubscribe = isMarketingEmailTemplate(input.template) ? input.unsubscribe : undefined;
    if (isMarketingEmailTemplate(input.template) && !unsubscribe) throw new Error(`The ${input.template} email needs its recipient's unsubscribe links.`);
    const brand = shownBrand(input.brand);
    const subject = input.subject ?? templateSubject(input.template, input.variables, brand);
    const email = renderTemplate(input.template, subject, input.variables, brand, unsubscribe);
    const result = await this.transporter.sendMail({
      from: input.from ?? this.config.from,
      ...(input.replyTo ? { replyTo: input.replyTo } : {}),
      to: input.to,
      subject,
      text: email.text,
      ...(email.html ? { html: email.html } : {}),
      ...(unsubscribe ? { headers: unsubscribeHeaders(unsubscribe) } : {}),
      ...(input.idempotencyKey ? { messageId: `<${createHash("sha256").update(input.idempotencyKey).digest("hex")}@mail.lobbystack.internal>` } : {}),
    });
    return { messageId: result.messageId };
  }
}

/**
 * What an email shows of its brand. The host's emails still say LobbyStack and
 * carry its mark whatever the deployment's branding, as docs/branding.md lists
 * under "Still branded"; a partner's show the partner's name and logo. Links
 * go to the brand's origin either way.
 */
function shownBrand(brand: EmailBrand): EmailBrand {
  return brand.kind === "host" ? { kind: "host", name: DEFAULT_APP_NAME, logoUrl: null, origin: brand.origin } : brand;
}

/**
 * A link to the dashboard, on the brand's origin. Producers queue whole links,
 * so a worker on the previous release can still send them. The path and query
 * stay as queued, and the origin is the brand's when the email goes out. The
 * host's links go out exactly as queued, as they always have, so a worker
 * without the admin's APP_BASE_URL can't send them to the wrong origin.
 */
function dashboardLink(value: string | undefined, brand: EmailBrand): string | undefined {
  if (!value || brand.kind === "host") return value;
  try {
    const origin = new URL(brand.origin).origin;
    const link = new URL(value, origin);
    if (link.protocol !== "http:" && link.protocol !== "https:") return value;
    return link.origin === origin && value.startsWith(origin) ? value : `${origin}${link.pathname}${link.search}${link.hash}`;
  } catch {
    return value;
  }
}

const SETUP_SUBJECTS: Record<string, (name: string) => string> = {
  en: (name) => `Make your ${name} account`,
  fr: (name) => `Créez votre compte ${name}`,
  es: (name) => `Cree su cuenta de ${name}`,
  sr: (name) => `Napravite svoj ${name} nalog`,
};

// The subjects of the email sign-up sends to an address that already has an account.
const EXISTING_ACCOUNT_SUBJECTS: Record<string, (name: string) => string> = {
  en: (name) => `You already have a ${name} account`,
  fr: (name) => `Votre compte ${name} existe déjà`,
  es: (name) => `Ya tiene una cuenta de ${name}`,
  sr: (name) => `Već imate ${name} nalog`,
};

// The subjects of the alert that a passkey joined the account.
const PASSKEY_ADDED_SUBJECTS: Record<string, (name: string) => string> = {
  en: (name) => `New passkey on your ${name} account`,
  fr: (name) => `Nouvelle clé d’accès sur votre compte ${name}`,
  es: (name) => `Nueva llave de acceso en su cuenta de ${name}`,
  sr: (name) => `Novi pristupni ključ na vašem ${name} nalogu`,
};

/**
 * The subject of an email whose payload names none, under the brand it goes
 * out under. A link to confirm an email change says so in `purpose`.
 */
function templateSubject(template: TemplateName, variables: Record<string, string>, brand: EmailBrand): string {
  const name = brand.name;
  switch (template) {
    case "verify_email":
      if (variables.code) return `Your ${name} verification code`;
      return variables.purpose === "email_change" ? `Confirm your ${name} email change` : `Verify your ${name} email`;
    case "password_reset":
      return `Reset your ${name} password`;
    case "existing_account":
      return (EXISTING_ACCOUNT_SUBJECTS[variables.locale ?? "en"] ?? EXISTING_ACCOUNT_SUBJECTS.en!)(name);
    case "passkey_added":
      return (PASSKEY_ADDED_SUBJECTS[variables.locale ?? "en"] ?? PASSKEY_ADDED_SUBJECTS.en!)(name);
    case "account_setup":
      return (SETUP_SUBJECTS[variables.locale ?? "en"] ?? SETUP_SUBJECTS.en!)(name);
    case "plan_reminder":
      return planReminderCopy(variables).subject;
    case "number_trial":
      return numberTrialEmailSubject(variables);
    case "number_release":
      return numberReleaseEmailSubject(variables);
    case "partner_pool_alert":
      return partnerPoolAlertCopy(variables).subject;
    case "business_allowance_alert":
      return businessAllowanceAlertCopy(variables, name).subject;
    case "partner_business_allowance_alert":
      return partnerBusinessAllowanceAlertCopy(variables).subject;
    case "invitation":
      return variables.businessName ? `Join ${variables.businessName} on ${name}` : `Join the ${name} team`;
    case "business_released":
      return `${variables.businessName ?? "Your business"} is yours to run on ${name}`;
    case "business_deleted":
      return `${name} deleted ${variables.businessName ?? "your business"}`;
    case "call_summary":
      return callSummaryCopy(variables).subject;
    default:
      return `${name} notification`;
  }
}

function renderTemplate(template: TemplateName, subject: string, variables: Record<string, string>, brand: EmailBrand, unsubscribe?: EmailUnsubscribeLinks): { text: string; html?: string } {
  const label = UNSUBSCRIBE_LABELS[emailCopyLocale(variables.locale)];
  const body = templateBody(template, variables, brand);
  // French puts a space before the colon.
  const text = unsubscribe ? `${body}\n\n${label}${variables.locale === "fr" ? " : " : ": "}${unsubscribe.pageUrl}` : body;
  const html = templateHtml(template, subject, variables, brand)?.replace(EMAIL_FOOTER_SLOT, unsubscribe ? renderUnsubscribeFooter(label, unsubscribe.pageUrl) : "");
  return html ? { text, html } : { text };
}

/** The footer link of a marketing email, in the recipient's language. */
const UNSUBSCRIBE_LABELS: Record<"en" | "fr" | "es" | "sr", string> = {
  en: "Unsubscribe",
  fr: "Se désabonner",
  es: "Cancelar la suscripción",
  sr: "Odjavi se",
};

/**
 * The headers mail apps read to offer their own unsubscribe button. A POST of
 * `List-Unsubscribe=One-Click` to the URL unsubscribes at once (RFC 8058).
 * The host has no inbound address, so there is no mailto.
 */
export function unsubscribeHeaders(links: EmailUnsubscribeLinks): Record<string, string> {
  return { "List-Unsubscribe": `<${links.oneClickUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" };
}

/** Where renderEmailLayout leaves room for a footer under the card. */
const EMAIL_FOOTER_SLOT = "<!--email-footer-->";

function renderUnsubscribeFooter(label: string, url: string): string {
  return `<p style="margin:24px 0 0;font-size:13px;line-height:1.5;color:#6B7280;text-align:center;"><a href="${escapeHtml(url)}" style="color:#6B7280;text-decoration:underline;">${escapeHtml(label)}</a></p>`;
}

/** The HTML of an email, in the shared layout. */
function templateHtml(template: TemplateName, subject: string, variables: Record<string, string>, brand: EmailBrand): string | undefined {
  const url = dashboardLink(variables.url, brand);
  switch (template) {
    case "invitation":
    case "business_released":
    case "business_deleted":
      return renderNoticeHtml(brand, subject, noticeCopy(template, variables, brand), url);
    case "passkey_added":
      return renderPasskeyAddedHtml(variables, brand, subject);
    case "existing_account":
      return renderExistingAccountHtml(variables, brand, subject);
    case "account_setup":
      return renderAccountSetupHtml(variables, brand, subject);
    case "verify_email":
      if (variables.code) return renderCodeHtml(brand, subject, "Verify your email address", `Enter this verification code to finish setting up your ${brand.name} account.`, variables.code);
      // One wording for a new account and an email change: emails queued before payloads carried a purpose have no way to tell them apart.
      return renderNoticeHtml(brand, subject, { heading: "Confirm your email address", lines: [`Confirm this email address for your ${brand.name} account.`, "If you did not ask for this, you can safely ignore this email."], action: "Confirm email" }, url);
    case "password_reset":
      return variables.code
        ? renderCodeHtml(brand, subject, "Reset your password", `Enter this code to reset your ${brand.name} password.`, variables.code)
        : renderNoticeHtml(brand, subject, { heading: "Reset your password", lines: [`Use the link below to choose a new ${brand.name} password.`, "If you did not ask for a reset, you can safely ignore this email."], action: "Reset password" }, url);
    case "operator_alert":
      return renderMessageHtml(brand, subject, variables.message ?? `${brand.name} operator notification`);
    case "call_summary":
      return renderCallSummaryHtml(brand, subject, variables);
    case "feedback_submission":
      return renderMessageHtml(brand, subject, variables.body ?? "LobbyStack dashboard feedback");
    case "number_trial": {
      const copy = numberTrialCopy(trialKind(variables.kind), variables.locale, variables);
      return renderLetterHtml(brand, subject, variables, copy.lines, copy.button, variables.url, brand.name);
    }
    case "plan_reminder": {
      const copy = planReminderCopy(variables);
      // The plan reminders end on their button, with no signature.
      return renderLetterHtml(brand, subject, variables, copy.lines, copy.button, variables.url, null);
    }
    case "number_release": {
      const copy = numberReleaseCopy(variables);
      return renderLetterHtml(brand, subject, variables, copy.lines, copy.button, variables.url, brand.name);
    }
    case "partner_pool_alert": {
      const copy = partnerPoolAlertCopy(variables);
      return renderLetterHtml(brand, subject, variables, copy.lines, copy.action, variables.url, brand.name);
    }
    case "business_allowance_alert": {
      const copy = businessAllowanceAlertCopy(variables, brand.name);
      return renderLetterHtml(brand, subject, variables, copy.lines, copy.action, url, brand.name);
    }
    case "partner_business_allowance_alert": {
      const copy = partnerBusinessAllowanceAlertCopy(variables);
      return renderLetterHtml(brand, subject, variables, copy.lines, copy.action, variables.url, brand.name);
    }
    case "welcome":
      return renderWelcomeHtml(brand, subject, variables);
  }
}

function renderCodeHtml(brand: EmailBrand, subject: string, heading: string, intro: string, code: string): string {
  return renderEmailLayout({
    brand,
    previewText: subject,
    content: [
      `<h1 style="margin:0 0 24px;font-size:28px;font-weight:600;line-height:1.25;color:#0B0B0D;text-align:center;">${escapeHtml(heading)}</h1>`,
      `<p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:#3D3D3D;text-align:center;">${escapeHtml(intro)}</p>`,
      `<p style="margin:0 0 24px;padding:16px 24px;background-color:#F3F4F6;border-radius:16px;font-size:32px;font-weight:600;line-height:1.25;letter-spacing:8px;color:#0B0B0D;text-align:center;">${escapeHtml(code)}</p>`,
      '<p style="margin:0 0 12px;font-size:14px;line-height:1.5;color:#6B7280;text-align:center;">This code expires in 10 minutes.</p>',
      '<p style="margin:0;font-size:14px;line-height:1.5;color:#6B7280;text-align:center;">If you did not request this code, you can safely ignore this email.</p>',
    ].join(""),
  });
}

const ACTION_BUTTON_STYLE = "display:inline-block;padding:12px 24px;background-color:#0B0B0D;border-radius:9999px;color:#FFFFFF;font-size:16px;font-weight:600;text-decoration:none;";

/** A greeting, the copy, a button and a signature, left-aligned like a letter: the trial, release and allowance emails. A null signature leaves it out. */
function renderLetterHtml(brand: EmailBrand, subject: string, variables: Record<string, string>, lines: string[], action: string, url: string | undefined, signature: string | null): string {
  const greet = TRIAL_GREETINGS[variables.locale ?? "en"] ?? TRIAL_GREETINGS.en!;
  return renderEmailLayout({
    brand,
    previewText: subject,
    align: "left",
    content: [
      `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#3D3D3D;">${escapeHtml(greet(variables.firstName ?? ""))}</p>`,
      ...lines.map((line) => `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#3D3D3D;">${escapeHtml(line)}</p>`),
      ...(url ? [`<p style="margin:24px 0 ${signature === null ? 0 : 32}px;"><a href="${escapeHtml(url)}" style="${ACTION_BUTTON_STYLE}">${escapeHtml(action)}</a></p>`] : []),
      ...(signature === null ? [] : [`<p style="margin:0;font-size:16px;line-height:1.6;color:#3D3D3D;">${escapeHtml(signature)}</p>`]),
    ].join(""),
  });
}

/** A free-form message for the team, such as an operator alert or dashboard feedback: its paragraphs and line breaks as written. */
function renderMessageHtml(brand: EmailBrand, subject: string, message: string): string {
  return renderEmailLayout({
    brand,
    previewText: subject,
    align: "left",
    content: message
      .split(/\n{2,}/)
      .map((paragraph) => `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#3D3D3D;">${escapeHtml(paragraph).replaceAll("\n", "<br />")}</p>`)
      .join(""),
  });
}

type CallSummaryCopy = {
  subject: string;
  heading: string;
  unknownCaller: string;
  labels: { caller: string; phone: string; when: string; duration: string; outcome: string; summary: string };
  /** What follows a label in the plain-text email: French puts a space before the colon. */
  colon: string;
  duration: (minutes: number, seconds: number) => string;
  booked: (service: string, when: string) => string;
  transferred: string;
  action: string;
  footnote: string;
  settings: string;
};

const CALL_SUMMARY_COPY: Record<"en" | "fr" | "es" | "sr", (business: string, caller: string) => CallSummaryCopy> = {
  en: (business, caller) => ({
    subject: caller ? `New call from ${caller}` : `New call for ${business}`,
    heading: `New call for ${business}`,
    unknownCaller: "Unknown caller",
    labels: { caller: "Caller", phone: "Phone", when: "When", duration: "Duration", outcome: "Outcome", summary: "Summary" },
    colon: ": ",
    duration: (m, s) => (m ? `${m} min ${s} sec` : `${s} sec`),
    booked: (service, when) => (service ? `Booked ${service} for ${when}` : `Booked an appointment for ${when}`),
    transferred: "Transferred to your team",
    action: "View call",
    footnote: "You get this email for each call your agent answers.",
    settings: "Change alerts",
  }),
  fr: (business, caller) => ({
    subject: caller ? `Nouvel appel de ${caller}` : `Nouvel appel pour ${business}`,
    heading: `Nouvel appel pour ${business}`,
    unknownCaller: "Appelant inconnu",
    labels: { caller: "Appelant", phone: "Téléphone", when: "Date", duration: "Durée", outcome: "Résultat", summary: "Résumé" },
    colon: " : ",
    duration: (m, s) => (m ? `${m} min ${s} s` : `${s} s`),
    booked: (service, when) => (service ? `Rendez-vous réservé : ${service}, ${when}` : `Rendez-vous réservé : ${when}`),
    transferred: "Transféré à votre équipe",
    action: "Voir l’appel",
    footnote: "Vous recevez ce courriel pour chaque appel auquel votre agent répond.",
    settings: "Modifier les alertes",
  }),
  es: (business, caller) => ({
    subject: caller ? `Nueva llamada de ${caller}` : `Nueva llamada para ${business}`,
    heading: `Nueva llamada para ${business}`,
    unknownCaller: "Desconocido",
    labels: { caller: "Quién llamó", phone: "Teléfono", when: "Fecha", duration: "Duración", outcome: "Resultado", summary: "Resumen" },
    colon: ": ",
    duration: (m, s) => (m ? `${m} min ${s} s` : `${s} s`),
    booked: (service, when) => (service ? `Cita reservada: ${service}, ${when}` : `Cita reservada: ${when}`),
    transferred: "Transferida a su equipo",
    action: "Ver la llamada",
    footnote: "Recibe este correo por cada llamada que contesta su agente.",
    settings: "Cambiar alertas",
  }),
  sr: (business, caller) => ({
    subject: caller ? `Novi poziv: ${caller}` : `Novi poziv za ${business}`,
    heading: `Novi poziv za ${business}`,
    unknownCaller: "Nepoznat pozivalac",
    labels: { caller: "Pozivalac", phone: "Telefon", when: "Vreme", duration: "Trajanje", outcome: "Ishod", summary: "Rezime" },
    colon: ": ",
    duration: (m, s) => (m ? `${m} min ${s} s` : `${s} s`),
    booked: (service, when) => (service ? `Zakazan termin: ${service}, ${when}` : `Zakazan termin: ${when}`),
    transferred: "Prebačen Vašem timu",
    action: "Pogledaj poziv",
    footnote: "Ovaj imejl dobijate za svaki poziv na koji Vaš agent odgovori.",
    settings: "Promeni obaveštenja",
  }),
};

/** The interface language an email is written in: English unless the recipient reads French, Spanish or Serbian. */
function emailCopyLocale(value: string | undefined): "en" | "fr" | "es" | "sr" {
  return value === "fr" || value === "es" || value === "sr" ? value : "en";
}

/** A time in the business's time zone, written in the reader's language. */
function callSummaryTime(value: string, locale: string, timeZone: string, withWeekday: boolean): string {
  const date = new Date(value);
  if (!value || !Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat(intlLocale(locale), { ...(withWeekday ? { weekday: "long" } : {}), month: "long", day: "numeric", hour: "numeric", minute: "2-digit", ...(timeZone ? { timeZone } : {}) }).format(date);
}

/** A call's length as the email shows it, or "" when it isn't known. */
function callSummaryDuration(copy: CallSummaryCopy, value: string): string {
  if (!value.trim()) return "";
  const seconds = Math.max(0, Math.round(Number(value)) || 0);
  return copy.duration(Math.floor(seconds / 60), seconds % 60);
}

/**
 * The alert for a call the agent answered, in the reader's language: who
 * called, when, for how long, what came of it, and the call's summary.
 * Rows without a value stay out.
 */
function callSummaryCopy(variables: Record<string, string>) {
  const details: Partial<CallSummaryEmailDetails> = variables;
  const locale = emailCopyLocale(details.locale);
  const timezone = details.timezone ?? "";
  const copy = CALL_SUMMARY_COPY[locale](details.businessName ?? "", details.callerName || details.callerPhone || "");
  const outcome = details.outcome === "booked" && details.bookedAt
    ? copy.booked(details.bookedService ?? "", callSummaryTime(details.bookedAt, locale, timezone, false))
    : details.outcome === "transferred" ? copy.transferred : "";
  const rows = [
    [copy.labels.caller, details.callerName || copy.unknownCaller],
    [copy.labels.phone, details.callerPhone ?? ""],
    [copy.labels.when, callSummaryTime(details.startedAt ?? "", locale, timezone, true)],
    [copy.labels.duration, callSummaryDuration(copy, details.durationSeconds ?? "")],
    [copy.labels.outcome, outcome],
  ].filter((row): row is [string, string] => Boolean(row[1]));
  return { ...copy, rows, summary: details.summary?.trim() ?? "" };
}

/** The notification settings page, on the same origin as the call link. */
function notificationSettingsLink(callUrl: string | undefined): string | undefined {
  return callUrl ? new URL("/account/notifications", callUrl).href : undefined;
}

/** The grey box an email sets its facts or steps in, around rows of a table. */
function renderPanel(rows: string, margin: string, padding: string): string {
  return `<table role="presentation" border="0" cellspacing="0" cellpadding="0" width="100%" style="margin:${margin};background-color:#F9FAFB;border:1px solid #E5E7EB;border-radius:16px;"><tr><td style="padding:${padding};"><table role="presentation" border="0" cellspacing="0" cellpadding="0" width="100%">${rows}</table></td></tr></table>`;
}

function callSummaryBody(variables: Record<string, string>, brand: EmailBrand): string {
  const copy = callSummaryCopy(variables);
  const url = dashboardLink(variables.url, brand);
  const settings = notificationSettingsLink(url);
  return [
    copy.heading,
    "",
    ...copy.rows.map(([label, value]) => `${label}${copy.colon}${value}`),
    ...(copy.summary ? ["", `${copy.labels.summary}${copy.colon.trimEnd()}`, copy.summary] : []),
    ...(url ? ["", `${copy.action}${copy.colon}${url}`] : []),
    "",
    copy.footnote,
    ...(settings ? [`${copy.settings}${copy.colon}${settings}`] : []),
  ].join("\n");
}

function renderCallSummaryHtml(brand: EmailBrand, subject: string, variables: Record<string, string>): string {
  const copy = callSummaryCopy(variables);
  const url = dashboardLink(variables.url, brand);
  const settings = notificationSettingsLink(url);
  const rows = copy.rows
    .map(([label, value]) => `<tr><td style="width:112px;padding:6px 16px 6px 0;font-size:14px;line-height:1.5;color:#6B7280;vertical-align:top;">${escapeHtml(label)}</td><td style="padding:6px 0;font-size:15px;line-height:1.5;color:#0B0B0D;vertical-align:top;">${escapeHtml(value)}</td></tr>`)
    .join("");
  return renderEmailLayout({
    brand,
    previewText: subject,
    align: "left",
    content: [
      `<h1 style="margin:0 0 24px;font-size:24px;font-weight:600;line-height:1.25;color:#0B0B0D;">${escapeHtml(copy.heading)}</h1>`,
      renderPanel(rows, "0 0 24px", "14px 20px"),
      ...(copy.summary ? [
        `<p style="margin:0 0 6px;font-size:14px;line-height:1.5;color:#6B7280;">${escapeHtml(copy.labels.summary)}</p>`,
        `<p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:#3D3D3D;">${escapeHtml(copy.summary).replaceAll("\n", "<br />")}</p>`,
      ] : []),
      ...(url ? [`<p style="margin:8px 0 0;"><a href="${escapeHtml(url)}" style="${ACTION_BUTTON_STYLE}">${escapeHtml(copy.action)}</a></p>`] : []),
      `<p style="margin:32px 0 0;padding-top:24px;border-top:1px solid #E5E7EB;font-size:14px;line-height:1.5;color:#6B7280;">${escapeHtml(copy.footnote)}${settings ? ` <a href="${escapeHtml(settings)}" style="color:#6B7280;text-decoration:underline;">${escapeHtml(copy.settings)}</a>` : ""}</p>`,
    ].join(""),
  });
}

type ActionCopy = { heading: string; lines: string[]; action: string; footnote: string };

function existingAccountCopy(locale: string | undefined, name: string): ActionCopy & { forgot: string } {
  switch (locale) {
    case "fr":
      return { heading: "Votre compte existe déjà", lines: [`Vous avez déjà un compte ${name}. Connectez-vous pour continuer.`], action: "Se connecter", forgot: "Mot de passe oublié ?", footnote: "Si vous n’avez pas demandé la création d’un compte, ignorez cet e-mail." };
    case "es":
      return { heading: "Ya tiene una cuenta", lines: [`Ya tiene una cuenta de ${name}. Inicie sesión para continuar.`], action: "Iniciar sesión", forgot: "¿Olvidó su contraseña?", footnote: "Si no solicitó una cuenta, ignore este correo." };
    case "sr":
      return { heading: "Već imate nalog", lines: [`Već imate ${name} nalog. Prijavite se da biste nastavili.`], action: "Prijavi se", forgot: "Zaboravili ste lozinku?", footnote: "Ako niste zatražili nalog, zanemarite ovaj imejl." };
    default:
      return { heading: "You already have an account", lines: [`You already have a ${name} account. Sign in to continue.`], action: "Sign in", forgot: "Forgot your password?", footnote: "If you did not request an account, ignore this email." };
  }
}

function renderExistingAccountHtml(variables: Record<string, string>, brand: EmailBrand, subject: string): string {
  const copy = existingAccountCopy(variables.locale, brand.name);
  const signIn = dashboardLink(variables.signInUrl, brand);
  const reset = dashboardLink(variables.resetUrl, brand);
  return renderEmailLayout({
    brand,
    previewText: subject,
    content: [
      `<h1 style="margin:0 0 24px;font-size:28px;font-weight:600;line-height:1.25;color:#0B0B0D;text-align:center;">${escapeHtml(copy.heading)}</h1>`,
      ...copy.lines.map((line) => `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#3D3D3D;text-align:center;">${escapeHtml(line)}</p>`),
      ...(signIn ? [`<p style="margin:24px 0 0;text-align:center;"><a href="${escapeHtml(signIn)}" style="${ACTION_BUTTON_STYLE}">${escapeHtml(copy.action)}</a></p>`] : []),
      ...(reset ? [`<p style="margin:24px 0 0;text-align:center;"><a href="${escapeHtml(reset)}" style="font-size:14px;font-weight:600;color:#0B0B0D;text-decoration:underline;">${escapeHtml(copy.forgot)}</a></p>`] : []),
      `<p style="margin:32px 0 0;padding-top:24px;border-top:1px solid #E5E7EB;font-size:14px;line-height:1.5;color:#6B7280;text-align:center;">${escapeHtml(copy.footnote)}</p>`,
    ].join(""),
  });
}

function accountSetupCopy(locale: string | undefined, name: string, email: string): ActionCopy {
  switch (locale) {
    case "fr":
      return { heading: "Créez votre compte", lines: [`On vous a invité à créer un compte ${name} avec l’adresse ${email}.`, "Créez-le avec cette adresse."], action: "Créer mon compte", footnote: "Si vous ne l’attendiez pas, ignorez cet e-mail." };
    case "es":
      return { heading: "Cree su cuenta", lines: [`Le invitaron a crear una cuenta de ${name} con la dirección ${email}.`, "Créela con esta dirección."], action: "Crear mi cuenta", footnote: "Si no lo esperaba, ignore este correo." };
    case "sr":
      return { heading: "Napravite svoj nalog", lines: [`Pozvani ste da napravite ${name} nalog sa adresom ${email}.`, "Napravite ga sa ovom adresom."], action: "Napravi nalog", footnote: "Ako ovo niste očekivali, zanemarite ovaj imejl." };
    default:
      return { heading: "Make your account", lines: [`You were invited to make a ${name} account with ${email}.`, "Make it with this address."], action: "Make my account", footnote: "If you weren't expecting this, ignore this email." };
  }
}

function renderAccountSetupHtml(variables: Record<string, string>, brand: EmailBrand, subject: string): string {
  const copy = accountSetupCopy(variables.locale, brand.name, variables.email ?? "");
  const url = dashboardLink(variables.url, brand);
  return renderEmailLayout({
    brand,
    previewText: subject,
    content: [
      `<h1 style="margin:0 0 24px;font-size:28px;font-weight:600;line-height:1.25;color:#0B0B0D;text-align:center;">${escapeHtml(copy.heading)}</h1>`,
      ...copy.lines.map((line) => `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#3D3D3D;text-align:center;">${escapeHtml(line)}</p>`),
      ...(url ? [`<p style="margin:24px 0 0;text-align:center;"><a href="${escapeHtml(url)}" style="${ACTION_BUTTON_STYLE}">${escapeHtml(copy.action)}</a></p>`] : []),
      `<p style="margin:32px 0 0;padding-top:24px;border-top:1px solid #E5E7EB;font-size:14px;line-height:1.5;color:#6B7280;text-align:center;">${escapeHtml(copy.footnote)}</p>`,
    ].join(""),
  });
}

// The account, invitation and alert emails a partner's client may get name the
// brand. Feedback, the welcome email, the plan reminder, and the trial and
// release emails with the host's prices are the host's own, and keep LobbyStack.
function templateBody(template: TemplateName, variables: Record<string, string>, brand: EmailBrand): string {
  const name = brand.name;
  const url = dashboardLink(variables.url, brand) ?? "";
  switch (template) {
    case "existing_account":
      return existingAccountBody(variables, brand);
    case "passkey_added":
      return passkeyAddedBody(variables, brand);
    case "account_setup":
      return accountSetupBody(variables, brand);
    case "verify_email":
      return variables.code
        ? `Your ${name} email verification code is: ${variables.code}. It expires in 10 minutes.`
        : `Verify your ${name} email address using this link: ${url}`;
    case "password_reset":
      return variables.code
        ? `Your ${name} password reset code is: ${variables.code}. It expires in 10 minutes.`
        : `Reset your ${name} password using this link: ${url}`;
    case "invitation":
    case "business_released":
    case "business_deleted": {
      const copy = noticeCopy(template, variables, brand);
      return [...copy.lines.flatMap((line) => [line, ""]), ...(copy.action && url ? [`${copy.action}: ${url}`, ""] : []), name].join("\n");
    }
    case "operator_alert":
      return variables.message ?? `${name} operator notification`;
    case "call_summary":
      return callSummaryBody(variables, brand);
    case "feedback_submission":
      return variables.body ?? "LobbyStack dashboard feedback";
    case "welcome":
      return welcomeBody(variables, brand);
    case "plan_reminder":
      return planReminderBody(variables);
    case "number_trial":
      return numberTrialBody(variables, brand);
    case "number_release":
      return numberReleaseBody(variables, brand);
    case "partner_pool_alert":
      return partnerPoolAlertBody(variables, brand);
    case "business_allowance_alert":
      return businessAllowanceAlertBody(variables, brand);
    case "partner_business_allowance_alert":
      return partnerBusinessAllowanceAlertBody(variables, brand);
  }
}

type PoolAlertCopy = { subject: string; lines: string[]; action: string };

/**
 * The host's alert to a partner's owners and admins at 80% or 100% of its
 * pool's minutes or chats, or of its overage cap. What happens past the pool
 * depends on `overage`: on, off by the owner's switch, or none on Free or on
 * a pool the host set. When `pool` is `host`, the deployment sells no tiers,
 * so the alert asks the partner to contact the host instead of picking one.
 * The domain formats the counts, amounts and month in the reader's language.
 */
function partnerPoolAlertCopy(v: Record<string, string>): PoolAlertCopy {
  const full = v.threshold === "100";
  const kind = v.kind === "chats" || v.kind === "cap" ? v.kind : "minutes";
  const on = v.overage === "on";
  const capped = Boolean(v.cap);
  const partner = v.partnerName ?? "";
  const used = v.used ?? "";
  const included = v.included ?? "";
  const month = v.month ?? "";
  const cap = v.cap ?? "";
  const host = v.pool === "host";
  // What the owner can do next, from where the pool stands.
  const choice = host ? "host" : kind === "cap" || (on && capped) ? "raise" : on ? "tier" : v.overage === "off" ? "enable" : "pay";
  if (v.locale === "fr") {
    const upTo = capped ? `, jusqu'à votre plafond de ${cap}` : "";
    const action = { raise: "Relevez votre plafond ou choisissez un palier supérieur sur la page Facturation", tier: "Choisissez un palier supérieur sur la page Facturation", enable: "Activez le dépassement ou choisissez un palier supérieur sur la page Facturation", pay: "Choisissez un palier payant et sa réserve plus grande sur la page Facturation", host: "Consultez l'utilisation du mois sur la page Facturation" }[choice];
    if (kind === "cap") {
      return full
        ? { subject: "Vous avez atteint votre plafond de dépassement", lines: [`Le dépassement de votre réserve en ${month} a atteint votre plafond de ${included}.`, "Jusqu'au mois prochain, ou jusqu'à ce que vous releviez le plafond, les appels vont au numéro de transfert de chaque entreprise ou au téléphone de son propriétaire, et le clavardage du site ne répond plus."], action }
        : { subject: "Vous avez utilisé 80 % de votre plafond de dépassement", lines: [`Le dépassement de votre réserve en ${month} coûte ${used} jusqu'ici, soit 80 % de votre plafond de ${included}.`, "Au plafond, les appels iront au numéro de transfert de chaque entreprise ou au téléphone de son propriétaire, et le clavardage du site cessera de répondre."], action };
    }
    const noun = kind === "minutes" ? "minutes" : "clavardages";
    const first = full ? `Chez ${partner}, vos entreprises ont utilisé les ${included} ${noun} de votre réserve en ${month}.` : `Chez ${partner}, vos entreprises ont utilisé ${used} des ${included} ${noun} de votre réserve en ${month}.`;
    const past = kind === "minutes"
      ? on ? `${full ? "Elles" : "Au-delà de la réserve, elles"} continuent de répondre aux appels, et vous payez chaque minute supplémentaire au tarif de dépassement de votre palier${upTo}.` : full ? "Jusqu'au mois prochain, les appels vont au numéro de transfert de chaque entreprise ou au téléphone de son propriétaire." : "Une fois la réserve épuisée, les appels iront au numéro de transfert de chaque entreprise ou au téléphone de son propriétaire jusqu'au mois prochain."
      : on ? `${full ? "Elles" : "Au-delà de la réserve, elles"} continuent de répondre sur leur site, et vous payez chaque clavardage supplémentaire au tarif de dépassement de votre palier${upTo}.` : full ? "Jusqu'au mois prochain, le clavardage de leur site ne répond plus." : "Une fois la réserve épuisée, le clavardage de leur site cessera de répondre jusqu'au mois prochain.";
    return { subject: full ? `Vos entreprises ont utilisé ${kind === "minutes" ? "toutes les minutes" : "tous les clavardages"} du mois` : `Vos entreprises ont utilisé 80 % des ${noun} du mois`, lines: [first, past, ...(host ? ["Nous fixons votre réserve. Contactez-nous pour la modifier."] : [])], action };
  }
  if (v.locale === "es") {
    const upTo = capped ? `, hasta su límite de ${cap}` : "";
    const action = { raise: "Suba su límite o elija un nivel mayor en la página Facturación", tier: "Elija un nivel mayor en la página Facturación", enable: "Active el excedente o elija un nivel mayor en la página Facturación", pay: "Elija un nivel de pago, con una bolsa más grande, en la página Facturación", host: "Consulte el uso del mes en la página Facturación" }[choice];
    if (kind === "cap") {
      return full
        ? { subject: "Llegó a su límite de excedente", lines: [`El excedente de su bolsa de ${month} llegó a su límite de ${included}.`, "Hasta el próximo mes, o hasta que suba el límite, las llamadas se desvían al número de transferencia de cada negocio o al teléfono de su propietario, y el chat del sitio deja de responder."], action }
        : { subject: "Usó el 80 % de su límite de excedente", lines: [`El excedente de su bolsa de ${month} cuesta ${used} hasta ahora, el 80 % de su límite de ${included}.`, "Al llegar al límite, las llamadas se desviarán al número de transferencia de cada negocio o al teléfono de su propietario, y el chat del sitio dejará de responder."], action };
    }
    const noun = kind === "minutes" ? "minutos" : "chats";
    const first = full ? `Los negocios de ${partner} usaron los ${included} ${noun} de su bolsa de ${month}.` : `Los negocios de ${partner} usaron ${used} de los ${included} ${noun} de su bolsa de ${month}.`;
    const past = kind === "minutes"
      ? on ? `${full ? "Siguen" : "Pasada la bolsa, siguen"} contestando llamadas, y usted paga cada minuto adicional a la tarifa de excedente de su nivel${upTo}.` : full ? "Hasta el próximo mes, las llamadas se desvían al número de transferencia de cada negocio o al teléfono de su propietario." : "Cuando se agote la bolsa, las llamadas se desviarán al número de transferencia de cada negocio o al teléfono de su propietario hasta el próximo mes."
      : on ? `${full ? "Siguen" : "Pasada la bolsa, siguen"} respondiendo en su sitio, y usted paga cada chat adicional a la tarifa de excedente de su nivel${upTo}.` : full ? "Hasta el próximo mes, el chat de su sitio deja de responder." : "Cuando se agote la bolsa, el chat de su sitio dejará de responder hasta el próximo mes.";
    return { subject: full ? `Sus negocios usaron todos los ${noun} del mes` : `Sus negocios usaron el 80 % de los ${noun} del mes`, lines: [first, past, ...(host ? ["Nosotros fijamos su bolsa. Contáctenos para cambiarla."] : [])], action };
  }
  if (v.locale === "sr") {
    const upTo = capped ? `, do Vašeg limita od ${cap}` : "";
    const action = { raise: "Povećajte limit ili izaberite veći nivo na stranici Naplata", tier: "Izaberite veći nivo na stranici Naplata", enable: "Uključite prekoračenje ili izaberite veći nivo na stranici Naplata", pay: "Izaberite plaćeni nivo, sa većim fondom, na stranici Naplata", host: "Pogledajte potrošnju za ovaj mesec na stranici Naplata" }[choice];
    if (kind === "cap") {
      return full
        ? { subject: "Dostigli ste limit prekoračenja", lines: [`Prekoračenje Vašeg fonda za ${month} dostiglo je Vaš limit od ${included}.`, "Do sledećeg meseca, ili dok ne povećate limit, pozivi idu na broj za prebacivanje svake firme ili na telefon njenog vlasnika, a čet na sajtu ne odgovara."], action }
        : { subject: "Potrošili ste 80% limita prekoračenja", lines: [`Prekoračenje Vašeg fonda za ${month} zasad košta ${used}, što je 80% Vašeg limita od ${included}.`, "Kada dostignete limit, pozivi će ići na broj za prebacivanje svake firme ili na telefon njenog vlasnika, a čet na sajtu će prestati da odgovara."], action };
    }
    const noun = kind === "minutes" ? "minuta" : "četova";
    const first = full ? `Firme partnera ${partner} potrošile su svih ${included} ${noun} iz Vašeg fonda za ${month}.` : `Firme partnera ${partner} potrošile su ${used} od ${included} ${noun} iz Vašeg fonda za ${month}.`;
    const past = kind === "minutes"
      ? on ? `${full ? "Nastavljaju" : "Kada potroše fond, nastavljaju"} da odgovaraju na pozive, a Vi plaćate svaki dodatni minut po ceni prekoračenja Vašeg nivoa${upTo}.` : full ? "Do sledećeg meseca, pozivi idu na broj za prebacivanje svake firme ili na telefon njenog vlasnika." : "Kada potroše fond, pozivi će ići na broj za prebacivanje svake firme ili na telefon njenog vlasnika do sledećeg meseca."
      : on ? `${full ? "Nastavljaju" : "Kada potroše fond, nastavljaju"} da odgovaraju na sajtu, a Vi plaćate svaki dodatni čet po ceni prekoračenja Vašeg nivoa${upTo}.` : full ? "Do sledećeg meseca, čet na njihovom sajtu ne odgovara." : "Kada potroše fond, čet na njihovom sajtu će prestati da odgovara do sledećeg meseca.";
    return { subject: full ? `Vaše firme su potrošile sve ${kind === "minutes" ? "minute" : "četove"} ovog meseca` : `Vaše firme su potrošile 80% ${noun} ovog meseca`, lines: [first, past, ...(host ? ["Mi određujemo Vaš fond. Javite nam se da biste ga promenili."] : [])], action };
  }
  const upTo = capped ? `, up to your ${cap} cap` : "";
  const action = { raise: "Raise your cap or pick a bigger tier on the Billing page", tier: "Pick a bigger tier on the Billing page", enable: "Turn on overage or pick a bigger tier on the Billing page", pay: "Pick a paid tier, with a bigger pool, on the Billing page", host: "See this month's usage on the Billing page" }[choice];
  if (kind === "cap") {
    return full
      ? { subject: "You reached your overage cap", lines: [`Your pool's overage for ${month} reached your ${included} cap.`, "Until next month, or until you raise the cap, calls forward to each business's transfer number or its owner's phone, and website chat stops replying."], action }
      : { subject: "You've used 80% of your overage cap", lines: [`Your pool's overage for ${month} costs ${used} so far, 80% of your ${included} cap.`, "At the cap, calls will forward to each business's transfer number or its owner's phone, and website chat will stop replying."], action };
  }
  const noun = kind === "minutes" ? "minutes" : "website chats";
  const first = full ? `${partner}'s businesses used all ${included} ${noun} in your pool for ${month}.` : `${partner}'s businesses used ${used} of the ${included} ${noun} in your pool for ${month}.`;
  const past = kind === "minutes"
    ? on ? `${full ? "They" : "Past the pool, they"} keep answering calls, and you pay your tier's overage rate for each extra minute${upTo}.` : full ? "Until next month, calls forward to each business's transfer number or its owner's phone." : "Once the pool runs out, calls will forward to each business's transfer number or its owner's phone until next month."
    : on ? `${full ? "They" : "Past the pool, they"} keep replying on their websites, and you pay your tier's overage rate for each extra chat${upTo}.` : full ? "Until next month, their website chat stops replying." : "Once the pool runs out, their website chat will stop replying until next month.";
  return { subject: full ? `Your businesses used all of this month's ${kind === "minutes" ? "minutes" : "chats"}` : `Your businesses used 80% of this month's ${kind === "minutes" ? "minutes" : "chats"}`, lines: [first, past, ...(host ? ["We set your pool. Contact us to change it."] : [])], action };
}

function partnerPoolAlertBody(variables: Record<string, string>, brand: EmailBrand): string {
  const copy = partnerPoolAlertCopy(variables);
  const greet = TRIAL_GREETINGS[variables.locale ?? "en"] ?? TRIAL_GREETINGS.en!;
  return [greet(variables.firstName ?? ""), "", ...copy.lines.flatMap((line) => [line, ""]), `${copy.action}: ${variables.url ?? ""}`, "", brand.name].join("\n");
}

/**
 * A partner's alert to a business's owners and admins at 80% or 100% of its
 * package's minutes or chats, under the partner's brand, so `partner` is the
 * brand's name. What happens past the allowance depends on `overage`: on,
 * up to a monthly limit when `capped`, or off. Like the business's
 * dashboard, it names no prices. The domain formats the counts and month in
 * the reader's language.
 */
function businessAllowanceAlertCopy(v: Record<string, string>, partner: string): PoolAlertCopy {
  const full = v.threshold === "100";
  const minutes = v.kind !== "chats";
  const on = v.overage === "on";
  const capped = on && v.capped === "yes";
  const business = v.businessName ?? "";
  const used = v.used ?? "";
  const included = v.included ?? "";
  const month = v.month ?? "";
  if (v.locale === "fr") {
    const noun = minutes ? "minutes" : "clavardages";
    const limit = capped ? " jusqu'à une limite mensuelle" : "";
    const past = minutes
      ? on ? `${full ? "Votre" : "Au-delà, votre"} agent continue de répondre aux appels${limit}, et ${partner} vous facture chaque minute supplémentaire.` : full ? "Jusqu'au mois prochain, les appels vont à votre numéro de transfert ou au téléphone du propriétaire." : "Une fois les minutes épuisées, les appels iront à votre numéro de transfert ou au téléphone du propriétaire jusqu'au mois prochain."
      : on ? `${full ? "Le" : "Au-delà, le"} clavardage de votre site continue de répondre${limit}, et ${partner} vous facture chaque clavardage supplémentaire.` : full ? "Jusqu'au mois prochain, le clavardage de votre site ne répond plus." : "Une fois les clavardages épuisés, le clavardage de votre site cessera de répondre jusqu'au mois prochain.";
    return {
      subject: full ? `${business} a utilisé ${minutes ? "toutes ses minutes" : "tous ses clavardages"} du mois` : `${business} a utilisé 80 % de ses ${noun} du mois`,
      lines: [full ? `${business} a utilisé les ${included} ${noun} ${minutes ? "incluses" : "inclus"} en ${month}.` : `${business} a utilisé ${used} des ${included} ${noun} ${minutes ? "incluses" : "inclus"} en ${month}.`, past],
      action: "Voir votre utilisation",
    };
  }
  if (v.locale === "es") {
    const noun = minutes ? "minutos" : "chats";
    const limit = capped ? " hasta un tope mensual" : "";
    const past = minutes
      ? on ? `${full ? "Su" : "Después, su"} agente sigue contestando llamadas${limit}, y ${partner} le cobra cada minuto adicional.` : full ? "Hasta el próximo mes, las llamadas se desvían a su número de transferencia o al teléfono del propietario." : "Cuando se agoten, las llamadas se desviarán a su número de transferencia o al teléfono del propietario hasta el próximo mes."
      : on ? `${full ? "El" : "Después, el"} chat de su sitio sigue respondiendo${limit}, y ${partner} le cobra cada chat adicional.` : full ? "Hasta el próximo mes, el chat de su sitio deja de responder." : "Cuando se agoten, el chat de su sitio dejará de responder hasta el próximo mes.";
    return {
      subject: full ? `${business} usó todos sus ${noun} del mes` : `${business} usó el 80 % de sus ${noun} del mes`,
      lines: [full ? `${business} usó los ${included} ${noun} incluidos en ${month}.` : `${business} usó ${used} de los ${included} ${noun} incluidos en ${month}.`, past],
      action: "Vea su uso",
    };
  }
  if (v.locale === "sr") {
    const noun = minutes ? "minuta" : "četova";
    const limit = capped ? " do mesečnog limita" : "";
    const past = minutes
      ? on ? full ? `Vaš agent nastavlja da odgovara na pozive${limit}, a ${partner} Vam naplaćuje svaki dodatni minut.` : `Kada ih potroši, Vaš agent će nastaviti da odgovara na pozive${limit}, a ${partner} će Vam naplatiti svaki dodatni minut.` : full ? "Do sledećeg meseca, pozivi idu na Vaš broj za prebacivanje ili na telefon vlasnika." : "Kada ih potroši, pozivi će ići na Vaš broj za prebacivanje ili na telefon vlasnika do sledećeg meseca."
      : on ? full ? `Čet na Vašem sajtu nastavlja da odgovara${limit}, a ${partner} Vam naplaćuje svaki dodatni čet.` : `Kada ih potroši, čet na Vašem sajtu će nastaviti da odgovara${limit}, a ${partner} će Vam naplatiti svaki dodatni čet.` : full ? "Do sledećeg meseca, čet na Vašem sajtu ne odgovara." : "Kada ih potroši, čet na Vašem sajtu će prestati da odgovara do sledećeg meseca.";
    return {
      subject: full ? `Firma ${business} je potrošila sve ${minutes ? "minute" : "četove"} ovog meseca` : `Firma ${business} je potrošila 80% ${noun} ovog meseca`,
      lines: [full ? `Firma ${business} je potrošila svih ${included} uključenih ${noun} za ${month}.` : `Firma ${business} je potrošila ${used} od ${included} uključenih ${noun} za ${month}.`, past],
      action: "Pogledajte potrošnju",
    };
  }
  const noun = minutes ? "minutes" : "website chats";
  const limit = capped ? ", up to a monthly limit" : "";
  const past = minutes
    ? on ? `${full ? "Your" : "Past them, your"} agent keeps answering calls${limit}, and ${partner} bills you for each extra minute.` : full ? "Until next month, calls forward to your transfer number or the owner's phone." : "Once they run out, calls forward to your transfer number or the owner's phone until next month."
    : on ? `${full ? "Your" : "Past them, your"} website chat keeps replying${limit}, and ${partner} bills you for each extra chat.` : full ? "Until next month, your website chat stops replying." : "Once they run out, your website chat stops replying until next month.";
  return {
    subject: full ? `${business} used all of this month's ${noun}` : `${business} used 80% of this month's ${noun}`,
    lines: [full ? `${business} used all ${included} of its ${noun} for ${month}.` : `${business} used ${used} of its ${included} ${noun} for ${month}.`, past],
    action: "See your usage",
  };
}

function businessAllowanceAlertBody(variables: Record<string, string>, brand: EmailBrand): string {
  const copy = businessAllowanceAlertCopy(variables, brand.name);
  const greet = TRIAL_GREETINGS[variables.locale ?? "en"] ?? TRIAL_GREETINGS.en!;
  return [greet(variables.firstName ?? ""), "", ...copy.lines.flatMap((line) => [line, ""]), `${copy.action}: ${dashboardLink(variables.url, brand) ?? ""}`, "", brand.name].join("\n");
}

/**
 * The host's alert to a partner's owners and admins at 80% or 100% of one
 * business's package minutes or chats, under the host's brand, since the
 * partner is the host's customer. What happens past the package depends on
 * the business's `overage`: on, up to the partner's monthly cap when
 * `capped`, or off. It names no prices. The domain formats the counts and
 * month in the reader's language.
 */
function partnerBusinessAllowanceAlertCopy(v: Record<string, string>): PoolAlertCopy {
  const full = v.threshold === "100";
  const minutes = v.kind !== "chats";
  const on = v.overage === "on";
  const capped = on && v.capped === "yes";
  const business = v.businessName ?? "";
  const used = v.used ?? "";
  const included = v.included ?? "";
  const month = v.month ?? "";
  if (v.locale === "fr") {
    const noun = minutes ? "minutes" : "clavardages";
    const limit = capped ? " jusqu'au plafond mensuel que vous avez fixé" : "";
    const past = minutes
      ? on ? `${full ? "L'entreprise" : "Au-delà, l'entreprise"} continue de répondre aux appels${limit}, et vous lui facturez chaque minute supplémentaire.` : full ? "Son dépassement est désactivé : jusqu'au mois prochain, les appels vont à son numéro de transfert ou au téléphone du propriétaire." : "Son dépassement est désactivé : une fois les minutes épuisées, les appels iront à son numéro de transfert ou au téléphone du propriétaire jusqu'au mois prochain."
      : on ? `${full ? "Le" : "Au-delà, le"} clavardage de son site continue de répondre${limit}, et vous lui facturez chaque clavardage supplémentaire.` : full ? "Son dépassement est désactivé : jusqu'au mois prochain, le clavardage de son site ne répond plus." : "Son dépassement est désactivé : une fois les clavardages épuisés, le clavardage de son site cessera de répondre jusqu'au mois prochain.";
    const all = minutes ? "toutes les" : "tous les";
    return {
      subject: full ? `${business} a utilisé ${all} ${noun} de sa formule` : `${business} a utilisé 80 % des ${noun} de sa formule`,
      lines: [full ? `${business} a utilisé ${all} ${included} ${noun} de sa formule en ${month}.` : `${business} a utilisé ${used} des ${included} ${noun} de sa formule en ${month}.`, past],
      action: on ? "Modifiez son dépassement sur la page Entreprises" : "Activez son dépassement sur la page Entreprises",
    };
  }
  if (v.locale === "es") {
    const noun = minutes ? "minutos" : "chats";
    const limit = capped ? " hasta el límite mensual que usted fijó" : "";
    const past = minutes
      ? on ? `${full ? "El negocio" : "Después, el negocio"} sigue contestando llamadas${limit}, y usted le cobra cada minuto adicional.` : full ? "Su excedente está desactivado: hasta el próximo mes, las llamadas se desvían a su número de transferencia o al teléfono del propietario." : "Su excedente está desactivado: cuando se agoten, las llamadas se desviarán a su número de transferencia o al teléfono del propietario hasta el próximo mes."
      : on ? `${full ? "El" : "Después, el"} chat de su sitio sigue respondiendo${limit}, y usted le cobra cada chat adicional.` : full ? "Su excedente está desactivado: hasta el próximo mes, el chat de su sitio deja de responder." : "Su excedente está desactivado: cuando se agoten, el chat de su sitio dejará de responder hasta el próximo mes.";
    return {
      subject: full ? `${business} usó todos los ${noun} de su paquete` : `${business} usó el 80 % de los ${noun} de su paquete`,
      lines: [full ? `${business} usó los ${included} ${noun} de su paquete en ${month}.` : `${business} usó ${used} de los ${included} ${noun} de su paquete en ${month}.`, past],
      action: on ? "Cambie su excedente en la página Negocios" : "Active su excedente en la página Negocios",
    };
  }
  if (v.locale === "sr") {
    const noun = minutes ? "minuta" : "četova";
    const limit = capped ? " do mesečnog limita koji ste postavili" : "";
    const past = minutes
      ? on ? full ? `Firma nastavlja da odgovara na pozive${limit}, a Vi joj naplaćujete svaki dodatni minut.` : `Kada ih potroši, firma će nastaviti da odgovara na pozive${limit}, a Vi ćete joj naplatiti svaki dodatni minut.` : full ? "Prekoračenje je isključeno, pa do sledećeg meseca pozivi idu na njen broj za prebacivanje ili na telefon vlasnika." : "Prekoračenje je isključeno, pa kada ih potroši, pozivi će ići na njen broj za prebacivanje ili na telefon vlasnika do sledećeg meseca."
      : on ? full ? `Čet na sajtu firme nastavlja da odgovara${limit}, a Vi joj naplaćujete svaki dodatni čet.` : `Kada ih potroši, čet na sajtu firme će nastaviti da odgovara${limit}, a Vi ćete joj naplatiti svaki dodatni čet.` : full ? "Prekoračenje je isključeno, pa do sledećeg meseca čet na sajtu firme ne odgovara." : "Prekoračenje je isključeno, pa kada ih potroši, čet na sajtu firme će prestati da odgovara do sledećeg meseca.";
    return {
      subject: full ? `Firma ${business} je potrošila sve ${minutes ? "minute" : "četove"} iz svoje ponude` : `Firma ${business} je potrošila 80% ${noun} iz svoje ponude`,
      lines: [full ? `Firma ${business} je potrošila svih ${included} ${noun} iz svoje ponude za ${month}.` : `Firma ${business} je potrošila ${used} od ${included} ${noun} iz svoje ponude za ${month}.`, past],
      action: on ? "Promenite prekoračenje na stranici Firme" : "Uključite prekoračenje na stranici Firme",
    };
  }
  const noun = minutes ? "minutes" : "website chats";
  const limit = capped ? " until its overage reaches the monthly cap you set" : "";
  const past = minutes
    ? on ? `${full ? "Its" : "Past them, its"} agent keeps answering calls${limit}, and you bill the business for each extra minute.` : full ? "Its overage is off, so calls forward to its transfer number or the owner's phone until next month." : "Its overage is off, so once they run out, calls forward to its transfer number or the owner's phone until next month."
    : on ? `${full ? "Its" : "Past them, its"} website chat keeps replying${limit}, and you bill the business for each extra chat.` : full ? "Its overage is off, so its website chat stops replying until next month." : "Its overage is off, so once they run out, its website chat stops replying until next month.";
  return {
    subject: full ? `${business} used all of its package's ${noun}` : `${business} used 80% of its package's ${noun}`,
    lines: [full ? `${business} used all ${included} ${noun} in its package for ${month}.` : `${business} used ${used} of the ${included} ${noun} in its package for ${month}.`, past],
    action: on ? "Change its overage on the Businesses page" : "Turn on its overage on the Businesses page",
  };
}

function partnerBusinessAllowanceAlertBody(variables: Record<string, string>, brand: EmailBrand): string {
  const copy = partnerBusinessAllowanceAlertCopy(variables);
  const greet = TRIAL_GREETINGS[variables.locale ?? "en"] ?? TRIAL_GREETINGS.en!;
  return [greet(variables.firstName ?? ""), "", ...copy.lines.flatMap((line) => [line, ""]), `${copy.action}: ${variables.url ?? ""}`, "", brand.name].join("\n");
}

// After a paid plan ends we keep the number 30 days, then release it.
function numberReleaseCopy(variables: Record<string, string>): TrialCopy {
  const num = variables.number ?? "";
  const canceled = variables.kind === "canceled";
  const ends = variables.periodEnd ?? "";
  const release = variables.releaseDate ?? "";
  switch (variables.locale) {
    case "fr":
      return canceled
        ? { subject: `Votre forfait se termine le ${ends}`, lines: [`Votre forfait reste actif jusqu'au ${ends}. Nous gardons ensuite le ${num} pendant 30 jours, jusqu'au ${release}, puis nous le libérons. Réabonnez-vous d'ici là pour le garder.`], button: "Garder mon numéro" }
        : { subject: `Nous libérons le ${num} le ${release}`, lines: [`Votre forfait est terminé, et nous gardons les numéros pendant 30 jours. Le ${num} sera libéré le ${release}. Réabonnez-vous d'ici là pour le garder.`], button: "Garder mon numéro" };
    case "es":
      return canceled
        ? { subject: `Su plan termina el ${ends}`, lines: [`Su plan sigue activo hasta el ${ends}. Después conservamos el ${num} durante 30 días, hasta el ${release}, y luego lo liberamos. Vuelva a suscribirse antes para conservarlo.`], button: "Conservar mi número" }
        : { subject: `Liberaremos el ${num} el ${release}`, lines: [`Su plan terminó, y conservamos los números durante 30 días. El ${num} se liberará el ${release}. Vuelva a suscribirse antes para conservarlo.`], button: "Conservar mi número" };
    case "sr":
      return canceled
        ? { subject: `Vaš paket ističe ${ends}`, lines: [`Vaš paket je aktivan do ${ends}. Nakon toga čuvamo broj ${num} još 30 dana, do ${release}, a zatim ga oslobađamo. Obnovite pretplatu do tada da biste ga zadržali.`], button: "Zadrži moj broj" }
        : { subject: `Oslobađamo broj ${num} ${release}`, lines: [`Vaš paket je istekao, a brojeve čuvamo 30 dana. Broj ${num} oslobađamo ${release}. Obnovite pretplatu do tada da biste ga zadržali.`], button: "Zadrži moj broj" };
    default:
      return canceled
        ? { subject: `Your plan ends on ${ends}`, lines: [`Your plan stays active until ${ends}. After that, we keep ${num} for 30 days, until ${release}, then release it. Resubscribe before then to keep it.`], button: "Keep my number" }
        : { subject: `We release ${num} on ${release}`, lines: [`Your plan ended, and we keep numbers for 30 days. ${num} goes on ${release}. Resubscribe before then to keep it.`], button: "Keep my number" };
  }
}

/** The subject of a number release email, in the owner's language. */
export function numberReleaseEmailSubject(variables: Record<string, string>): string {
  return numberReleaseCopy(variables).subject;
}

function numberReleaseBody(variables: Record<string, string>, brand: EmailBrand): string {
  const copy = numberReleaseCopy(variables);
  const greet = TRIAL_GREETINGS[variables.locale ?? "en"] ?? TRIAL_GREETINGS.en!;
  return [greet(variables.firstName ?? ""), "", ...copy.lines.flatMap((line) => [line, ""]), `${copy.button}: ${variables.url ?? ""}`, "", brand.name].join("\n");
}

/**
 * A phone number as the dashboard shows it: a North American number in its
 * national form, any other in its international one, and anything that
 * can't be a phone number as given.
 */
export function formatEmailPhoneNumber(value: string): string {
  const parsed = parsePhoneNumberFromString(value.trim());
  if (!parsed?.isPossible()) return value;
  return parsed.countryCallingCode === "1" ? parsed.formatNational() : parsed.formatInternational();
}

/**
 * The reminder to an owner who reached the plans and left without choosing
 * one: their number is live, and one click on the plans finishes setup with
 * the free trial.
 */
function planReminderCopy(v: Record<string, string>): TrialCopy {
  const num = formatEmailPhoneNumber(v.number ?? "");
  const business = v.businessName?.trim() ?? "";
  if (v.kind === "second") return secondPlanReminderCopy(v.locale, num, business);
  switch (v.locale) {
    case "fr":
      return { subject: `Votre numéro ${num} est actif`, lines: [business ? `Votre numéro ${num} est actif et votre agent répond à ses appels pour ${business}.` : `Votre numéro ${num} est actif et votre agent répond à ses appels.`, "Commencez votre essai gratuit de 14 jours pour terminer la configuration. Il suffit d'un clic, sans carte bancaire."], button: "Commencer l'essai gratuit de 14 jours" };
    case "es":
      return { subject: `Su número ${num} ya está activo`, lines: [business ? `Su número ${num} ya está activo y su agente contesta sus llamadas para ${business}.` : `Su número ${num} ya está activo y su agente contesta sus llamadas.`, "Empiece su prueba gratuita de 14 días para terminar la configuración. Es un solo clic y no necesita tarjeta."], button: "Empezar la prueba gratuita de 14 días" };
    case "sr":
      return { subject: `Vaš broj ${num} je aktivan`, lines: [business ? `Vaš broj ${num} je aktivan i agent na njemu odgovara na pozive za ${business}.` : `Vaš broj ${num} je aktivan i agent na njemu odgovara na pozive.`, "Započnite besplatnu probu od 14 dana da biste završili podešavanje. Potreban je samo jedan klik, bez kartice."], button: "Započnite besplatnu probu od 14 dana" };
    default:
      return { subject: `Your number ${num} is live`, lines: [business ? `Your number ${num} is live, and your agent answers its calls for ${business}.` : `Your number ${num} is live, and your agent answers its calls.`, "Start your 14-day free trial to finish setup. It takes one click, and you won't need a card."], button: "Start your 14-day free trial" };
  }
}

/**
 * The second and last reminder, a day after the owner reached the plans and
 * still on them. Its button is the first reminder's.
 */
function secondPlanReminderCopy(locale: string | undefined, num: string, business: string): TrialCopy {
  switch (locale) {
    case "fr":
      return { subject: `Terminez la configuration du ${num}`, lines: [business ? `Vous n'avez pas encore choisi de forfait pour ${business}, donc la configuration n'est pas terminée.` : "Vous n'avez pas encore choisi de forfait, donc la configuration n'est pas terminée.", `L'essai gratuit vous donne 14 jours pour voir comment votre agent répond aux appels au ${num}. Aucune carte bancaire n'est nécessaire.`], button: "Commencer l'essai gratuit de 14 jours" };
    case "es":
      return { subject: `Termine de configurar el ${num}`, lines: [business ? `Todavía no eligió un plan para ${business}, así que la configuración no está terminada.` : "Todavía no eligió un plan, así que la configuración no está terminada.", `La prueba gratuita le da 14 días para ver cómo su agente contesta las llamadas al ${num}. No necesita tarjeta.`], button: "Empezar la prueba gratuita de 14 días" };
    case "sr":
      return { subject: `Završite podešavanje broja ${num}`, lines: [business ? `Još niste izabrali paket za ${business}, pa podešavanje nije završeno.` : "Još niste izabrali paket, pa podešavanje nije završeno.", `Besplatna proba Vam daje 14 dana da vidite kako agent odgovara na pozive na ${num}. Kartica nije potrebna.`], button: "Započnite besplatnu probu od 14 dana" };
    default:
      return { subject: `Finish setting up ${num}`, lines: [business ? `You haven't chosen a plan for ${business} yet, so setup isn't finished.` : "You haven't chosen a plan yet, so setup isn't finished.", `The free trial gives you 14 days to see how your agent handles calls to ${num}. You won't need a card.`], button: "Start your 14-day free trial" };
  }
}

function planReminderBody(variables: Record<string, string>): string {
  const copy = planReminderCopy(variables);
  const greet = TRIAL_GREETINGS[variables.locale ?? "en"] ?? TRIAL_GREETINGS.en!;
  // French puts a space before the colon that follows the button's words.
  const colon = variables.locale === "fr" ? " : " : ": ";
  return [greet(variables.firstName ?? ""), "", ...copy.lines.flatMap((line) => [line, ""]), `${copy.button}${colon}${variables.url ?? ""}`].join("\n");
}

type TrialEmailKind = "day10" | "day13" | "ended" | "minutes_out";
type TrialCopy = { subject: string; lines: string[]; button: string };

// The trial emails, written to be urgent and true: the trial does end, the
// agent does stop answering, and we do release the number afterwards.
function numberTrialCopy(kind: TrialEmailKind, locale: string | undefined, v: Record<string, string>): TrialCopy {
  const calls = Number(v.calls ?? "0");
  const num = v.trialNumber ?? "";
  const fwd = v.forwardTo ?? "";
  // A trial started without a verified mobile has no forward to name when it runs out.
  const hasFwd = Boolean(fwd);
  const business = v.businessName ?? "";
  if (locale === "fr") {
    const answered = calls > 0 ? [`Votre agent a déjà répondu à ${calls} appel${calls > 1 ? "s" : ""} pour ${business}.`] : [];
    switch (kind) {
      case "day10": return { subject: `Plus que 4 jours pour garder le ${num}`, lines: [`Votre essai gratuit se termine le ${v.endDate}.`, ...answered, `À la fin de l'essai, votre agent cesse de répondre au ${num} et nous libérons le numéro. Choisissez un forfait pour le garder. Starter coûte 30 $ par mois pour 150 minutes.`], button: "Garder mon numéro" };
      case "day13": return { subject: `Demain, dernier jour avec le ${num}`, lines: ["Votre essai gratuit se termine demain à minuit.", ...answered, `Ensuite, les appels au ${num} restent sans réponse et nous libérons le numéro. Gardez-le pour 30 $ par mois avec Starter.`], button: "Garder mon numéro" };
      case "ended": return { subject: `Votre essai est terminé. Le ${num} ne répond plus`, lines: [`Votre essai de 14 jours s'est terminé hier, alors votre agent ne répond plus au ${num}. Nous libérons le numéro. Abonnez-vous dès maintenant si vous voulez le garder. Starter coûte 30 $ par mois pour 150 minutes.`], button: "Garder mon numéro" };
      case "minutes_out": return hasFwd
        ? { subject: `Vos minutes sont épuisées. Les appels vont maintenant au ${fwd}`, lines: [`${business} a utilisé ses 30 minutes gratuites, alors votre agent ne répond plus au ${num}. Les appels sonnent maintenant au ${fwd}. Passez à un forfait payant pour retrouver votre agent. Starter coûte 30 $ par mois pour 150 minutes, et vous gardez votre numéro.`], button: "Retrouver mon agent" }
        : { subject: "Vos minutes sont épuisées. Les appels restent sans réponse", lines: [`${business} a utilisé ses 30 minutes gratuites, alors votre agent ne répond plus au ${num}. Les appels restent maintenant sans réponse. Passez à un forfait payant pour retrouver votre agent. Starter coûte 30 $ par mois pour 150 minutes, et vous gardez votre numéro.`], button: "Retrouver mon agent" };
    }
  }
  if (locale === "es") {
    const answered = calls > 0 ? [`Su agente ya contestó ${calls} llamada${calls > 1 ? "s" : ""} para ${business}.`] : [];
    switch (kind) {
      case "day10": return { subject: `Quedan 4 días para conservar el ${num}`, lines: [`Su prueba gratuita termina el ${v.endDate}.`, ...answered, `Cuando termine la prueba, su agente dejará de contestar el ${num} y liberaremos el número. Elija un plan para conservarlo. Starter cuesta 30 USD al mes por 150 minutos.`], button: "Conservar mi número" };
      case "day13": return { subject: `Mañana es su último día con el ${num}`, lines: ["Su prueba gratuita termina mañana a medianoche.", ...answered, `Después, las llamadas al ${num} quedarán sin respuesta y liberaremos el número. Consérvelo por 30 USD al mes con Starter.`], button: "Conservar mi número" };
      case "ended": return { subject: `Su prueba terminó. El ${num} dejó de contestar`, lines: [`Su prueba de 14 días terminó ayer, así que su agente dejó de contestar el ${num}. Estamos liberando el número. Suscríbase ahora si quiere conservarlo. Starter cuesta 30 USD al mes por 150 minutos.`], button: "Conservar mi número" };
      case "minutes_out": return hasFwd
        ? { subject: `Se acabaron sus minutos. Las llamadas ahora van al ${fwd}`, lines: [`${business} usó sus 30 minutos gratuitos, así que su agente dejó de contestar el ${num}. Las llamadas ahora suenan en el ${fwd}. Mejore su plan ahora para recuperar a su agente. Starter cuesta 30 USD al mes por 150 minutos, y conserva su número.`], button: "Recuperar a mi agente" }
        : { subject: "Se acabaron sus minutos. Las llamadas quedan sin respuesta", lines: [`${business} usó sus 30 minutos gratuitos, así que su agente dejó de contestar el ${num}. Las llamadas ahora quedan sin respuesta. Mejore su plan para recuperar a su agente. Starter cuesta 30 USD al mes por 150 minutos, y conserva su número.`], button: "Recuperar a mi agente" };
    }
  }
  if (locale === "sr") {
    const answered = calls > 0 ? [`Vaš agent je već odgovorio na ${calls} ${calls === 1 ? "poziv" : "poziva"} za ${business}.`] : [];
    switch (kind) {
      case "day10": return { subject: `Još 4 dana da zadržite broj ${num}`, lines: [`Vaša besplatna proba ističe ${v.endDate}.`, ...answered, `Kada proba istekne, agent prestaje da odgovara na ${num} i mi oslobađamo broj. Izaberite paket da biste ga zadržali. Starter košta 30 USD mesečno za 150 minuta.`], button: "Zadrži moj broj" };
      case "day13": return { subject: `Sutra je Vaš poslednji dan sa brojem ${num}`, lines: ["Vaša besplatna proba ističe sutra u ponoć.", ...answered, `Nakon toga, pozivi na ${num} ostaju bez odgovora i mi oslobađamo broj. Zadržite ga za 30 USD mesečno uz Starter.`], button: "Zadrži moj broj" };
      case "ended": return { subject: `Proba je istekla. ${num} više ne odgovara`, lines: [`Vaša proba od 14 dana istekla je juče, pa agent više ne odgovara na ${num}. Oslobađamo broj. Pretplatite se sada ako želite da ga zadržite. Starter košta 30 USD mesečno za 150 minuta.`], button: "Zadrži moj broj" };
      case "minutes_out": return hasFwd
        ? { subject: `Potrošili ste minute. Pozivi sada idu na ${fwd}`, lines: [`${business} je potrošio 30 besplatnih minuta, pa agent više ne odgovara na ${num}. Pozivi sada zvone na ${fwd}. Pređite na plaćeni paket da biste vratili agenta. Starter košta 30 USD mesečno za 150 minuta, a broj ostaje Vaš.`], button: "Vrati mog agenta" }
        : { subject: "Potrošili ste minute. Pozivi ostaju bez odgovora", lines: [`${business} je potrošio 30 besplatnih minuta, pa agent više ne odgovara na ${num}. Pozivi sada ostaju bez odgovora. Pređite na plaćeni paket da biste vratili agenta. Starter košta 30 USD mesečno za 150 minuta, a broj ostaje Vaš.`], button: "Vrati mog agenta" };
    }
  }
  const answered = calls > 0 ? [`So far your agent has answered ${calls} call${calls > 1 ? "s" : ""} for ${business}.`] : [];
  switch (kind) {
    case "day10": return { subject: `4 days left to keep ${num}`, lines: [`Your free trial ends on ${v.endDate}.`, ...answered, `When it ends, your agent stops answering ${num} and we release the number. Choose a plan to keep it. Starter is $30 a month for 150 minutes.`], button: "Keep my number" };
    case "day13": return { subject: `Tomorrow is your last day with ${num}`, lines: ["Your free trial ends at midnight tomorrow.", ...answered, `After that, calls to ${num} go unanswered and we release the number. Keep it for $30 a month with Starter.`], button: "Keep my number" };
    case "ended": return { subject: `Your trial ended. ${num} stopped answering`, lines: [`Your 14-day trial ended yesterday, so your agent stopped answering ${num}. We're releasing the number. Subscribe now if you want to keep it. Starter is $30 a month for 150 minutes.`], button: "Keep my number" };
    case "minutes_out": return hasFwd
      ? { subject: `You're out of minutes. Calls now go to ${fwd}`, lines: [`${business} used its 30 free minutes, so your agent stopped answering ${num}. Calls now ring ${fwd}. Upgrade now to get your agent back. Starter is $30 a month for 150 minutes, and you keep your number.`], button: "Get my agent back" }
      : { subject: "You're out of minutes. Calls are not being answered", lines: [`${business} used its 30 free minutes, so your agent stopped answering ${num}. Calls now go unanswered. Choose a paid plan to get your agent back. Starter is $30 a month for 150 minutes, and you keep your number.`], button: "Get my agent back" };
  }
}

const TRIAL_GREETINGS: Record<string, (name: string) => string> = {
  fr: (name) => (name ? `Bonjour ${name},` : "Bonjour,"),
  es: (name) => (name ? `Hola, ${name}:` : "Hola:"),
  sr: (name) => (name ? `Zdravo, ${name},` : "Zdravo,"),
  en: (name) => (name ? `Hi ${name},` : "Hi,"),
};

function trialKind(value: string | undefined): TrialEmailKind {
  return value === "day10" || value === "day13" || value === "ended" ? value : "minutes_out";
}

/** The subject of a trial email, in the owner's language. */
export function numberTrialEmailSubject(variables: Record<string, string>): string {
  return numberTrialCopy(trialKind(variables.kind), variables.locale, variables).subject;
}

function numberTrialBody(variables: Record<string, string>, brand: EmailBrand): string {
  const copy = numberTrialCopy(trialKind(variables.kind), variables.locale, variables);
  const greet = TRIAL_GREETINGS[variables.locale ?? "en"] ?? TRIAL_GREETINGS.en!;
  return [greet(variables.firstName ?? ""), "", ...copy.lines.flatMap((line) => [line, ""]), `${copy.button}: ${variables.url ?? ""}`, "", brand.name].join("\n");
}

/** For an owner a platform key invited: the link opens sign-up, where they make their account with this address. */
function accountSetupBody(variables: Record<string, string>, brand: EmailBrand): string {
  const name = brand.name;
  const url = dashboardLink(variables.url, brand);
  const email = variables.email;
  switch (variables.locale) {
    case "fr":
      return `On vous a invité à créer un compte ${name} avec l’adresse ${email}. Créez-le ici, avec cette adresse : ${url}. Si vous ne l’attendiez pas, ignorez cet e-mail.`;
    case "es":
      return `Le invitaron a crear una cuenta de ${name} con la dirección ${email}. Créela aquí, con esta dirección: ${url}. Si no lo esperaba, ignore este correo.`;
    case "sr":
      return `Pozvani ste da napravite ${name} nalog sa adresom ${email}. Napravite ga ovde, sa ovom adresom: ${url}. Ako ovo niste očekivali, zanemarite ovaj imejl.`;
    default:
      return `You were invited to make a ${name} account with ${email}. Make it here, with this address: ${url}. If you weren't expecting this, ignore this email.`;
  }
}

function passkeyAddedBody(variables: Record<string, string>, brand: EmailBrand): string {
  const name = brand.name;
  const settings = dashboardLink(variables.settingsUrl, brand);
  const reset = dashboardLink(variables.resetUrl, brand);
  switch (variables.locale) {
    case "fr":
      return `Quelqu’un a ajouté une clé d’accès à votre compte ${name}. Si c’était vous, vous n’avez rien à faire. Consultez vos clés d’accès : ${settings}. Si ce n’était pas vous, réinitialisez votre mot de passe maintenant : ${reset}. La réinitialisation supprime toutes vos clés d’accès et déconnecte tous vos appareils.`;
    case "es":
      return `Alguien añadió una llave de acceso a su cuenta de ${name}. Si fue usted, no tiene que hacer nada. Vea sus llaves de acceso: ${settings}. Si no fue usted, restablezca su contraseña ahora: ${reset}. Al restablecerla, se eliminan todas sus llaves de acceso y se cierra la sesión en todos sus dispositivos.`;
    case "sr":
      return `Neko je dodao pristupni ključ na vaš ${name} nalog. Ako ste to bili vi, ne morate ništa da radite. Pogledajte svoje pristupne ključeve: ${settings}. Ako to niste bili vi, odmah resetujte lozinku: ${reset}. Resetovanje uklanja sve vaše pristupne ključeve i odjavljuje sve vaše uređaje.`;
    default:
      return `Someone added a passkey to your ${name} account. If it was you, you're all set. See your passkeys: ${settings}. If it wasn't you, reset your password now: ${reset}. A reset removes all your passkeys and signs out all your devices.`;
  }
}

type PasskeyAddedCopy = { heading: string; lines: string[]; settings: string; warning: string; reset: string };

function passkeyAddedCopy(locale: string | undefined, name: string): PasskeyAddedCopy {
  switch (locale) {
    case "fr":
      return { heading: "Nouvelle clé d’accès ajoutée", lines: [`Quelqu’un a ajouté une clé d’accès à votre compte ${name}.`, "Si c’était vous, vous n’avez rien à faire."], settings: "Voir mes clés d’accès", warning: "Ce n’était pas vous ? Réinitialisez votre mot de passe maintenant. La réinitialisation supprime toutes vos clés d’accès et déconnecte tous vos appareils.", reset: "Réinitialiser mon mot de passe" };
    case "es":
      return { heading: "Nueva llave de acceso añadida", lines: [`Alguien añadió una llave de acceso a su cuenta de ${name}.`, "Si fue usted, no tiene que hacer nada."], settings: "Ver mis llaves de acceso", warning: "¿No fue usted? Restablezca su contraseña ahora. Al restablecerla, se eliminan todas sus llaves de acceso y se cierra la sesión en todos sus dispositivos.", reset: "Restablecer mi contraseña" };
    case "sr":
      return { heading: "Dodat je novi pristupni ključ", lines: [`Neko je dodao pristupni ključ na vaš ${name} nalog.`, "Ako ste to bili vi, ne morate ništa da radite."], settings: "Pogledaj moje pristupne ključeve", warning: "Niste bili vi? Odmah resetujte lozinku. Resetovanje uklanja sve vaše pristupne ključeve i odjavljuje sve vaše uređaje.", reset: "Resetuj moju lozinku" };
    default:
      return { heading: "New passkey added", lines: [`Someone added a passkey to your ${name} account.`, "If it was you, you're all set."], settings: "See your passkeys", warning: "Wasn't you? Reset your password now. A reset removes all your passkeys and signs out all your devices.", reset: "Reset my password" };
  }
}

function renderPasskeyAddedHtml(variables: Record<string, string>, brand: EmailBrand, subject: string): string {
  const copy = passkeyAddedCopy(variables.locale, brand.name);
  const settings = dashboardLink(variables.settingsUrl, brand);
  const reset = dashboardLink(variables.resetUrl, brand);
  return renderEmailLayout({
    brand,
    previewText: subject,
    content: [
      `<h1 style="margin:0 0 24px;font-size:28px;font-weight:600;line-height:1.25;color:#0B0B0D;text-align:center;">${escapeHtml(copy.heading)}</h1>`,
      ...copy.lines.map((line) => `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#3D3D3D;text-align:center;">${escapeHtml(line)}</p>`),
      ...(settings ? [`<p style="margin:24px 0 0;text-align:center;"><a href="${escapeHtml(settings)}" style="display:inline-block;padding:12px 24px;background-color:#0B0B0D;border-radius:9999px;color:#FFFFFF;font-size:16px;font-weight:600;text-decoration:none;">${escapeHtml(copy.settings)}</a></p>`] : []),
      `<p style="margin:32px 0 16px;padding-top:24px;border-top:1px solid #E5E7EB;font-size:14px;line-height:1.5;color:#6B7280;text-align:center;">${escapeHtml(copy.warning)}</p>`,
      ...(reset ? [`<p style="margin:0;text-align:center;"><a href="${escapeHtml(reset)}" style="font-size:14px;font-weight:600;color:#0B0B0D;text-decoration:underline;">${escapeHtml(copy.reset)}</a></p>`] : []),
    ].join(""),
  });
}

function existingAccountBody(variables: Record<string, string>, brand: EmailBrand): string {
  const name = brand.name;
  const signIn = dashboardLink(variables.signInUrl, brand);
  const reset = dashboardLink(variables.resetUrl, brand);
  switch (variables.locale) {
    case "fr":
      return `Vous avez déjà un compte ${name}. Connectez-vous pour continuer : ${signIn}. Mot de passe oublié ? ${reset}. Si vous n’avez pas demandé la création d’un compte, ignorez cet e-mail.`;
    case "es":
      return `Ya tiene una cuenta de ${name}. Inicie sesión para continuar: ${signIn}. ¿Olvidó su contraseña? ${reset}. Si no solicitó una cuenta, ignore este correo.`;
    case "sr":
      return `Već imate ${name} nalog. Prijavite se da biste nastavili: ${signIn}. Zaboravili ste lozinku? ${reset}. Ako niste zatražili nalog, zanemarite ovaj imejl.`;
    default:
      return `You already have a ${name} account. Sign in to continue: ${signIn}. Forgot your password? ${reset}. If you did not request an account, ignore this email.`;
  }
}

type WelcomeGoal = "answer_calls" | "book_appointments" | "answer_website_visitors" | "answer_instagram_messages" | "none";

type WelcomeCopy = {
  heading: (firstName: string) => string;
  intro: (business: string) => string;
  lead: string;
  hear: { title: string; text: Record<WelcomeGoal, string> };
  teach: { title: string; text: string; booking: string };
  forward: { title: (number: string) => string; text: string; action: string };
  claim: { title: string; text: string; action: string };
  close: string;
  signature: string;
};

const WELCOME_COPY: Record<"en" | "fr" | "es" | "sr", WelcomeCopy> = {
  en: {
    heading: (name) => (name ? `Welcome to LobbyStack, ${name}` : "Welcome to LobbyStack"),
    intro: (business) => `We're glad you're here. Your agent for ${business} is set up and ready to pick up the calls you can't.`,
    lead: "Three steps and it's answering your customers:",
    hear: {
      title: "Hear your agent",
      text: {
        answer_calls: "Call it from your dashboard and ask what your callers ask most.",
        book_appointments: "Call it from your dashboard and ask it to book an appointment.",
        answer_website_visitors: "Call it from your dashboard and ask what people ask on your website.",
        answer_instagram_messages: "Call it from your dashboard and ask what people ask on Instagram.",
        none: "Call it from your dashboard and ask what your customers ask most.",
      },
    },
    teach: { title: "Teach it your business", text: "Add your hours, prices and FAQs so it answers the way your team does.", booking: "Add your services, hours and booking rules so it books the way your team does." },
    forward: { title: (number) => `Forward your calls to ${number}`, text: "Your phone rings first. When you miss a call, your agent picks up.", action: "Forward my missed calls" },
    claim: { title: "Get a phone number", text: "Give your agent its own number, then forward the calls you miss to it.", action: "Answer my missed calls" },
    close: "Questions or stuck on a step? Reply to this email and we'll help.",
    signature: "The LobbyStack team",
  },
  fr: {
    heading: (name) => (name ? `Bienvenue chez LobbyStack, ${name}` : "Bienvenue chez LobbyStack"),
    intro: (business) => `Nous sommes ravis de vous accueillir. Votre agent pour ${business} est prêt à répondre aux appels que vous ne pouvez pas prendre.`,
    lead: "Trois étapes et il répond à vos clients :",
    hear: {
      title: "Écoutez votre agent",
      text: {
        answer_calls: "Appelez-le depuis votre tableau de bord et posez la question que vos appelants posent le plus.",
        book_appointments: "Appelez-le depuis votre tableau de bord et demandez-lui de prendre un rendez-vous.",
        answer_website_visitors: "Appelez-le depuis votre tableau de bord et posez les questions qu'on vous pose sur votre site.",
        answer_instagram_messages: "Appelez-le depuis votre tableau de bord et posez les questions qu'on vous pose sur Instagram.",
        none: "Appelez-le depuis votre tableau de bord et posez la question que vos clients posent le plus.",
      },
    },
    teach: { title: "Présentez-lui votre entreprise", text: "Ajoutez vos heures, vos tarifs et vos FAQ pour qu'il réponde comme votre équipe.", booking: "Ajoutez vos services, vos heures et vos règles de réservation pour qu'il réserve comme votre équipe." },
    forward: { title: (number) => `Transférez vos appels vers le ${number}`, text: "Votre téléphone sonne d'abord. Si vous ne répondez pas, votre agent prend l'appel.", action: "Transférer mes appels manqués" },
    claim: { title: "Obtenez un numéro de téléphone", text: "Donnez un numéro à votre agent, puis transférez-y les appels que vous manquez.", action: "Répondre à mes appels manqués" },
    close: "Une question ou bloqué à une étape ? Répondez à ce courriel et nous vous aiderons.",
    signature: "L'équipe LobbyStack",
  },
  es: {
    heading: (name) => (name ? `Le damos la bienvenida a LobbyStack, ${name}` : "Le damos la bienvenida a LobbyStack"),
    intro: (business) => `Nos alegra tenerle aquí. Su agente para ${business} está listo para atender las llamadas que usted no puede contestar.`,
    lead: "Tres pasos y estará atendiendo a sus clientes:",
    hear: {
      title: "Escuche a su agente",
      text: {
        answer_calls: "Llámelo desde su panel y pregúntele lo que más le preguntan quienes llaman.",
        book_appointments: "Llámelo desde su panel y pídale que reserve una cita.",
        answer_website_visitors: "Llámelo desde su panel y pregúntele lo que la gente pregunta en su sitio web.",
        answer_instagram_messages: "Llámelo desde su panel y pregúntele lo que la gente pregunta en Instagram.",
        none: "Llámelo desde su panel y pregúntele lo que más preguntan sus clientes.",
      },
    },
    teach: { title: "Enséñele su negocio", text: "Agregue su horario, sus precios y sus preguntas frecuentes para que responda como su equipo.", booking: "Agregue sus servicios, su horario y sus reglas de reserva para que reserve como su equipo." },
    forward: { title: (number) => `Desvíe sus llamadas al ${number}`, text: "Su teléfono suena primero. Si no contesta, su agente atiende la llamada.", action: "Desviar mis llamadas perdidas" },
    claim: { title: "Consiga un número de teléfono", text: "Dé a su agente su propio número y desvíe a él las llamadas que no contesta.", action: "Atender mis llamadas perdidas" },
    close: "¿Tiene preguntas o se atascó en un paso? Responda a este correo y le ayudaremos.",
    signature: "El equipo de LobbyStack",
  },
  sr: {
    heading: (name) => (name ? `Dobro došli u LobbyStack, ${name}` : "Dobro došli u LobbyStack"),
    intro: (business) => `Drago nam je što ste tu. Vaš agent za ${business} je spreman da preuzme pozive koje ne stignete da javite.`,
    lead: "Tri koraka i odgovara Vašim klijentima:",
    hear: {
      title: "Poslušajte svog agenta",
      text: {
        answer_calls: "Pozovite ga iz kontrolne table i pitajte ono što Vas pozivaoci najčešće pitaju.",
        book_appointments: "Pozovite ga iz kontrolne table i zamolite ga da zakaže termin.",
        answer_website_visitors: "Pozovite ga iz kontrolne table i pitajte ono što ljudi pitaju na Vašem sajtu.",
        answer_instagram_messages: "Pozovite ga iz kontrolne table i pitajte ono što ljudi pitaju na Instagramu.",
        none: "Pozovite ga iz kontrolne table i pitajte ono što Vas klijenti najčešće pitaju.",
      },
    },
    teach: { title: "Upoznajte ga sa svojim poslom", text: "Dodajte radno vreme, cene i česta pitanja da bi odgovarao kao Vaš tim.", booking: "Dodajte usluge, radno vreme i pravila zakazivanja da bi zakazivao kao Vaš tim." },
    forward: { title: (number) => `Preusmerite pozive na ${number}`, text: "Vaš telefon zvoni prvi. Kada ne javite, javlja se agent.", action: "Preusmeri propuštene pozive" },
    claim: { title: "Nabavite broj telefona", text: "Dodelite agentu sopstveni broj, pa na njega preusmerite pozive koje propustite.", action: "Odgovaraj na propuštene pozive" },
    close: "Imate pitanje ili ste zapeli na nekom koraku? Odgovorite na ovaj imejl i pomoći ćemo Vam.",
    signature: "Tim LobbyStacka",
  },
};

/**
 * The welcome email, sent when onboarding finishes, in the owner's language.
 * Its three steps match Getting started on Home, and its button leads to the
 * third: forwarding calls to the number the owner took, or getting one.
 */
function welcomeCopy(variables: Record<string, string>) {
  const locale = emailCopyLocale(variables.locale);
  const copy = WELCOME_COPY[locale];
  const goal: WelcomeGoal = variables.goal === "answer_calls" || variables.goal === "book_appointments" || variables.goal === "answer_website_visitors" || variables.goal === "answer_instagram_messages" ? variables.goal : "none";
  const number = variables.number?.trim() ?? "";
  const phone = number ? { title: copy.forward.title(number), text: copy.forward.text, action: copy.forward.action } : copy.claim;
  return {
    heading: copy.heading(variables.firstName?.trim() ?? ""),
    lines: [copy.intro(variables.businessName ?? ""), copy.lead],
    steps: [
      { title: copy.hear.title, text: copy.hear.text[goal] },
      { title: copy.teach.title, text: goal === "book_appointments" ? copy.teach.booking : copy.teach.text },
      { title: phone.title, text: phone.text },
    ],
    action: phone.action,
    // French puts a space before the colon that follows the button's words in the plain-text email.
    colon: locale === "fr" ? " : " : ": ",
    close: copy.close,
    signature: copy.signature,
  };
}

function welcomeBody(variables: Record<string, string>, brand: EmailBrand): string {
  const copy = welcomeCopy(variables);
  const url = dashboardLink(variables.url, brand) ?? "";
  return [
    copy.heading,
    "",
    ...copy.lines.flatMap((line) => [line, ""]),
    ...copy.steps.flatMap((step, index) => [`${index + 1}. ${step.title}`, step.text, ""]),
    `${copy.action}${copy.colon}${url}`,
    "",
    copy.close,
    "",
    copy.signature,
  ].join("\n");
}

function renderWelcomeHtml(brand: EmailBrand, subject: string, variables: Record<string, string>): string {
  const copy = welcomeCopy(variables);
  const url = dashboardLink(variables.url, brand);
  const steps = copy.steps
    .map((step, index) => `<tr><td style="width:40px;padding:4px 0;vertical-align:top;"><div style="width:28px;height:28px;border-radius:9999px;background-color:#0B0B0D;color:#FFFFFF;font-size:14px;font-weight:600;line-height:28px;text-align:center;">${index + 1}</div></td><td style="padding:4px 0 ${index === copy.steps.length - 1 ? 4 : 14}px;vertical-align:top;"><p style="margin:0;font-size:15px;font-weight:600;line-height:1.5;color:#0B0B0D;">${escapeHtml(step.title)}</p><p style="margin:0;font-size:15px;line-height:1.5;color:#3D3D3D;">${escapeHtml(step.text)}</p></td></tr>`)
    .join("");
  return renderEmailLayout({
    brand,
    previewText: subject,
    align: "left",
    content: [
      `<h1 style="margin:0 0 20px;font-size:28px;font-weight:600;line-height:1.2;color:#0B0B0D;">${escapeHtml(copy.heading)}</h1>`,
      `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#3D3D3D;">${escapeHtml(copy.lines[0]!)}</p>`,
      `<p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:#3D3D3D;">${escapeHtml(copy.lines[1]!)}</p>`,
      renderPanel(steps, "0 0 28px", "18px 20px"),
      ...(url ? [`<p style="margin:0;"><a href="${escapeHtml(url)}" style="${ACTION_BUTTON_STYLE}">${escapeHtml(copy.action)}</a></p>`] : []),
      `<p style="margin:28px 0 0;font-size:16px;line-height:1.6;color:#3D3D3D;">${escapeHtml(copy.close)}</p>`,
      `<p style="margin:16px 0 0;font-size:16px;line-height:1.6;color:#3D3D3D;">${escapeHtml(copy.signature)}</p>`,
    ].join(""),
  });
}

type NoticeCopy = { heading: string; lines: string[]; action: string | null };

/**
 * An invitation, or the note to a business's owner that its partner released
 * or deleted it. An invitation to a business names the business; one without
 * a business is to the brand's own team. A released business now runs under
 * the host, whose brand the email goes out under, and `partnerName` names who
 * released it. A deleted business is gone, so its note has no link.
 */
function noticeCopy(template: "invitation" | "business_released" | "business_deleted", v: Record<string, string>, brand: EmailBrand): NoticeCopy {
  const name = brand.name;
  const business = v.businessName ?? "";
  if (template === "invitation") {
    return business
      ? { heading: `Join ${business}`, lines: [`You've been invited to join ${business} on ${name}.`, "The link works for 7 days."], action: "Accept the invitation" }
      : { heading: `Join the ${name} team`, lines: [`You've been invited to join the ${name} team.`, "The link works for 7 days."], action: "Accept the invitation" };
  }
  if (template === "business_released") {
    const partner = v.partnerName ?? "Your partner";
    return { heading: `${business} is yours to run`, lines: [`${partner} handed ${business} over to you. Its agent, calls and settings stay as they were, and it's on ${name}'s Free plan now.`, `Sign in to ${name} with this email address to run it and choose a plan.`], action: `Sign in to ${name}` };
  }
  return { heading: `${business} was deleted`, lines: [`${name} deleted ${business}, with its calls, chats, contacts, appointments and settings. Its agent no longer answers.`, `If you didn't expect this, contact ${name}.`], action: null };
}

function renderNoticeHtml(brand: EmailBrand, subject: string, copy: NoticeCopy, url: string | undefined): string {
  return renderEmailLayout({
    brand,
    previewText: subject,
    content: [
      `<h1 style="margin:0 0 24px;font-size:28px;font-weight:600;line-height:1.25;color:#0B0B0D;text-align:center;">${escapeHtml(copy.heading)}</h1>`,
      ...copy.lines.map((line) => `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#3D3D3D;text-align:center;">${escapeHtml(line)}</p>`),
      ...(copy.action && url ? [`<p style="margin:24px 0 0;text-align:center;"><a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 24px;background-color:#0B0B0D;border-radius:9999px;color:#FFFFFF;font-size:16px;font-weight:600;text-decoration:none;">${escapeHtml(copy.action)}</a></p>`] : []),
    ].join(""),
  });
}

// LobbyStack's mark, which only LobbyStack's own name gets (the dashboard's rule too).
const LOBBYSTACK_MARK = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="-30 -30 278 291" role="img" aria-label="LobbyStack"><g transform="translate(0.000000,231.000000) scale(0.100000,-0.100000)" fill="#0B0B0D" stroke="none"><path d="M968 2280 c-42 -16 -195 -79 -340 -141 -144 -62 -317 -133 -383 -159 -90 -36 -130 -58 -162 -88 -85 -82 -78 2 -81 -976 -3 -968 -6 -916 63 -916 19 0 54 9 77 20 24 10 147 62 273 114 338 138 342 140 365 178 20 32 20 48 20 763 0 702 1 731 19 761 12 19 34 37 54 43 33 11 54 4 398 -133 267 -107 370 -152 387 -171 26 -31 23 42 25 -725 l2 -673 c0 -50 8 -86 19 -86 11 -12 31 -21 47 -21 24 0 296 106 358 140 11 5 30 27 43 47 l23 38 l0 654 0 836 -27 46 c-48 81 -77 98 -404 233 -170 71 -371 155 -447 187 -165 71 -208 75 -329 29z"/></g></svg>`;

/**
 * What heads an email: the brand's logo unless mail clients can't show it,
 * LobbyStack's mark while the name is LobbyStack, or else the name on its own. A logo saved as a path on the
 * dashboard gets the brand's origin, since a mail client has no page to resolve it against.
 */
function emailHeader(brand: EmailBrand, align: EmailAlign): string {
  const logoUrl = brand.emailLogoUrl === undefined ? brand.logoUrl : brand.emailLogoUrl;
  if (logoUrl) {
    const src = logoUrl.startsWith("/") ? `${brand.origin}${logoUrl}` : logoUrl;
    return `<img src="${escapeHtml(src)}" alt="${escapeHtml(brand.name)}" height="48" style="height:48px;width:auto;max-width:240px;border:0;" />`;
  }
  if (brand.name === DEFAULT_APP_NAME) return LOBBYSTACK_MARK;
  return `<p style="margin:0;font-size:20px;font-weight:600;line-height:1.25;color:#0B0B0D;text-align:${align};">${escapeHtml(brand.name)}</p>`;
}

/**
 * Where an email's logo sits: centered over the centered account emails, and
 * on the left over the ones whose text reads left-aligned, like a letter.
 */
type EmailAlign = "center" | "left";

function renderEmailLayout({ brand, previewText, content, align = "center" }: { brand: EmailBrand; previewText: string; content: string; align?: EmailAlign }): string {
  const escapedPreviewText = escapeHtml(previewText);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <meta name="supported-color-schemes" content="light" />
    <title>${escapedPreviewText}</title>
    <style>
      :root { color-scheme: light; }
      @media only screen and (max-width: 620px) {
        .email-container { width: 100% !important; padding: 24px 16px !important; }
      }
    </style>
  </head>
  <body style="margin:0;padding:0;background-color:#F3F4F6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" border="0" cellspacing="0" cellpadding="0" width="100%">
      <tr>
        <td align="center" style="padding:48px 16px;">
          <table role="presentation" class="email-container" border="0" cellspacing="0" cellpadding="0" width="600" style="width:600px;max-width:600px;background-color:#FFFFFF;border-radius:24px;padding:48px;">
            <tr>
              <td align="${align}" style="padding-bottom:32px;">
                ${emailHeader(brand, align)}
              </td>
            </tr>
            <tr>
              <td>
                ${content}
              </td>
            </tr>
          </table>${EMAIL_FOOTER_SLOT}
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
