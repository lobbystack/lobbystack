import { createHash } from "node:crypto";

import nodemailer, { type Transporter } from "nodemailer";
import { DEFAULT_APP_NAME, assertCertificationRecipient, type EmailBrand } from "@lobbystack/shared";

export type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
  from: string;
};

type TemplateName = "existing_account" | "account_setup" | "verify_email" | "password_reset" | "invitation" | "operator_alert" | "feedback_submission" | "onboarding_followup" | "number_trial" | "number_release";

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
   * sender, the email goes out from EMAIL_FROM.
   */
  async sendTemplate(input: { template: TemplateName; to: string; subject?: string; variables: Record<string, string>; brand: EmailBrand; idempotencyKey?: string; from?: string; replyTo?: string }): Promise<{ messageId: string }> {
    assertCertificationRecipient("email", input.to);
    const brand = shownBrand(input.brand);
    const subject = input.subject ?? templateSubject(input.template, input.variables, brand);
    const email = renderTemplate(input.template, subject, input.variables, brand);
    const result = await this.transporter.sendMail({
      from: input.from ?? this.config.from,
      ...(input.replyTo ? { replyTo: input.replyTo } : {}),
      to: input.to,
      subject,
      text: email.text,
      ...(email.html ? { html: email.html } : {}),
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
    case "account_setup":
      return (SETUP_SUBJECTS[variables.locale ?? "en"] ?? SETUP_SUBJECTS.en!)(name);
    case "number_trial":
      return numberTrialEmailSubject(variables);
    case "number_release":
      return numberReleaseEmailSubject(variables);
    default:
      return `${name} notification`;
  }
}

function renderTemplate(template: TemplateName, subject: string, variables: Record<string, string>, brand: EmailBrand): { text: string; html?: string } {
  const text = templateBody(template, variables, brand);

  if (template !== "verify_email" || !variables.code) {
    return { text };
  }

  const code = escapeHtml(variables.code);
  return {
    text,
    html: renderEmailLayout({
      brand,
      previewText: subject,
      content: [
        '<h1 style="margin:0 0 24px;font-size:28px;font-weight:600;line-height:1.25;color:#0B0B0D;text-align:center;">Verify your email address</h1>',
        `<p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:#3D3D3D;text-align:center;">Enter this verification code to finish setting up your ${escapeHtml(brand.name)} account.</p>`,
        `<p style="margin:0 0 24px;padding:16px 24px;background-color:#F3F4F6;border-radius:16px;font-size:32px;font-weight:600;line-height:1.25;letter-spacing:8px;color:#0B0B0D;text-align:center;">${code}</p>`,
        '<p style="margin:0 0 12px;font-size:14px;line-height:1.5;color:#6B7280;text-align:center;">This code expires in 10 minutes.</p>',
        '<p style="margin:0;font-size:14px;line-height:1.5;color:#6B7280;text-align:center;">If you did not request this code, you can safely ignore this email.</p>',
      ].join(""),
    }),
  };
}

// The account, invitation and alert emails a partner's client may get name the
// brand. Feedback, the founder check-in, and the trial and release emails with
// the host's prices are the host's own, and keep LobbyStack.
function templateBody(template: TemplateName, variables: Record<string, string>, brand: EmailBrand): string {
  const name = brand.name;
  const url = dashboardLink(variables.url, brand) ?? "";
  switch (template) {
    case "existing_account":
      return existingAccountBody(variables, brand);
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
      return `You have been invited to join ${name}. Accept the invitation here: ${url}`;
    case "operator_alert":
      return variables.message ?? `${name} operator notification`;
    case "feedback_submission":
      return variables.body ?? "LobbyStack dashboard feedback";
    case "onboarding_followup":
      return onboardingFollowupBody(variables);
    case "number_trial":
      return numberTrialBody(variables);
    case "number_release":
      return numberReleaseBody(variables);
  }
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

function numberReleaseBody(variables: Record<string, string>): string {
  const copy = numberReleaseCopy(variables);
  const greet = TRIAL_GREETINGS[variables.locale ?? "en"] ?? TRIAL_GREETINGS.en!;
  return [greet(variables.firstName ?? ""), "", ...copy.lines.flatMap((line) => [line, ""]), `${copy.button}: ${variables.url ?? ""}`, "", variables.senderName ?? "LobbyStack"].join("\n");
}

type TrialEmailKind = "day10" | "day13" | "ended" | "minutes_out";
type TrialCopy = { subject: string; lines: string[]; button: string };

// The trial emails, written to be urgent and true: the trial does end, the
// receptionist does stop answering, and we do release the number afterwards.
function numberTrialCopy(kind: TrialEmailKind, locale: string | undefined, v: Record<string, string>): TrialCopy {
  const calls = Number(v.calls ?? "0");
  const num = v.trialNumber ?? "";
  const fwd = v.forwardTo ?? "";
  const business = v.businessName ?? "";
  if (locale === "fr") {
    const answered = calls > 0 ? [`Votre réceptionniste a déjà répondu à ${calls} appel${calls > 1 ? "s" : ""} pour ${business}.`] : [];
    switch (kind) {
      case "day10": return { subject: `Plus que 4 jours pour garder le ${num}`, lines: [`Votre essai gratuit se termine le ${v.endDate}.`, ...answered, `À la fin de l'essai, votre réceptionniste cesse de répondre au ${num} et nous libérons le numéro. Choisissez un forfait pour le garder. Starter coûte 30 $ par mois pour 150 minutes.`], button: "Garder mon numéro" };
      case "day13": return { subject: `Demain, dernier jour avec le ${num}`, lines: ["Votre essai gratuit se termine demain à minuit.", ...answered, `Ensuite, les appels au ${num} restent sans réponse et nous libérons le numéro. Gardez-le pour 30 $ par mois avec Starter.`], button: "Garder mon numéro" };
      case "ended": return { subject: `Votre essai est terminé. Le ${num} ne répond plus`, lines: [`Votre essai de 14 jours s'est terminé hier, alors votre réceptionniste ne répond plus au ${num}. Nous libérons le numéro. Abonnez-vous dès maintenant si vous voulez le garder. Starter coûte 30 $ par mois pour 150 minutes.`], button: "Garder mon numéro" };
      case "minutes_out": return { subject: `Vos minutes sont épuisées. Les appels vont maintenant au ${fwd}`, lines: [`${business} a utilisé ses 30 minutes gratuites, alors votre réceptionniste ne répond plus au ${num}. Les appels sonnent maintenant au ${fwd}. Passez à un forfait payant pour retrouver votre réceptionniste. Starter coûte 30 $ par mois pour 150 minutes, et vous gardez votre numéro.`], button: "Retrouver ma réceptionniste" };
    }
  }
  if (locale === "es") {
    const answered = calls > 0 ? [`Su recepcionista ya contestó ${calls} llamada${calls > 1 ? "s" : ""} para ${business}.`] : [];
    switch (kind) {
      case "day10": return { subject: `Quedan 4 días para conservar el ${num}`, lines: [`Su prueba gratuita termina el ${v.endDate}.`, ...answered, `Cuando termine la prueba, su recepcionista dejará de contestar el ${num} y liberaremos el número. Elija un plan para conservarlo. Starter cuesta 30 USD al mes por 150 minutos.`], button: "Conservar mi número" };
      case "day13": return { subject: `Mañana es su último día con el ${num}`, lines: ["Su prueba gratuita termina mañana a medianoche.", ...answered, `Después, las llamadas al ${num} quedarán sin respuesta y liberaremos el número. Consérvelo por 30 USD al mes con Starter.`], button: "Conservar mi número" };
      case "ended": return { subject: `Su prueba terminó. El ${num} dejó de contestar`, lines: [`Su prueba de 14 días terminó ayer, así que su recepcionista dejó de contestar el ${num}. Estamos liberando el número. Suscríbase ahora si quiere conservarlo. Starter cuesta 30 USD al mes por 150 minutos.`], button: "Conservar mi número" };
      case "minutes_out": return { subject: `Se acabaron sus minutos. Las llamadas ahora van al ${fwd}`, lines: [`${business} usó sus 30 minutos gratuitos, así que su recepcionista dejó de contestar el ${num}. Las llamadas ahora suenan en el ${fwd}. Mejore su plan ahora para recuperar a su recepcionista. Starter cuesta 30 USD al mes por 150 minutos, y conserva su número.`], button: "Recuperar a mi recepcionista" };
    }
  }
  if (locale === "sr") {
    const answered = calls > 0 ? [`Vaš recepcioner je već odgovorio na ${calls} ${calls === 1 ? "poziv" : "poziva"} za ${business}.`] : [];
    switch (kind) {
      case "day10": return { subject: `Još 4 dana da zadržite broj ${num}`, lines: [`Vaša besplatna proba ističe ${v.endDate}.`, ...answered, `Kada proba istekne, recepcioner prestaje da odgovara na ${num} i mi oslobađamo broj. Izaberite paket da biste ga zadržali. Starter košta 30 USD mesečno za 150 minuta.`], button: "Zadrži moj broj" };
      case "day13": return { subject: `Sutra je Vaš poslednji dan sa brojem ${num}`, lines: ["Vaša besplatna proba ističe sutra u ponoć.", ...answered, `Nakon toga, pozivi na ${num} ostaju bez odgovora i mi oslobađamo broj. Zadržite ga za 30 USD mesečno uz Starter.`], button: "Zadrži moj broj" };
      case "ended": return { subject: `Proba je istekla. ${num} više ne odgovara`, lines: [`Vaša proba od 14 dana istekla je juče, pa recepcioner više ne odgovara na ${num}. Oslobađamo broj. Pretplatite se sada ako želite da ga zadržite. Starter košta 30 USD mesečno za 150 minuta.`], button: "Zadrži moj broj" };
      case "minutes_out": return { subject: `Potrošili ste minute. Pozivi sada idu na ${fwd}`, lines: [`${business} je potrošio 30 besplatnih minuta, pa recepcioner više ne odgovara na ${num}. Pozivi sada zvone na ${fwd}. Pređite na plaćeni paket da biste vratili recepcionera. Starter košta 30 USD mesečno za 150 minuta, a broj ostaje Vaš.`], button: "Vrati mog recepcionera" };
    }
  }
  const answered = calls > 0 ? [`So far your receptionist has answered ${calls} call${calls > 1 ? "s" : ""} for ${business}.`] : [];
  switch (kind) {
    case "day10": return { subject: `4 days left to keep ${num}`, lines: [`Your free trial ends on ${v.endDate}.`, ...answered, `When it ends, your receptionist stops answering ${num} and we release the number. Choose a plan to keep it. Starter is $30 a month for 150 minutes.`], button: "Keep my number" };
    case "day13": return { subject: `Tomorrow is your last day with ${num}`, lines: ["Your free trial ends at midnight tomorrow.", ...answered, `After that, calls to ${num} go unanswered and we release the number. Keep it for $30 a month with Starter.`], button: "Keep my number" };
    case "ended": return { subject: `Your trial ended. ${num} stopped answering`, lines: [`Your 14-day trial ended yesterday, so your receptionist stopped answering ${num}. We're releasing the number. Subscribe now if you want to keep it. Starter is $30 a month for 150 minutes.`], button: "Keep my number" };
    case "minutes_out": return { subject: `You're out of minutes. Calls now go to ${fwd}`, lines: [`${business} used its 30 free minutes, so your receptionist stopped answering ${num}. Calls now ring ${fwd}. Upgrade now to get your receptionist back. Starter is $30 a month for 150 minutes, and you keep your number.`], button: "Get my receptionist back" };
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

function numberTrialBody(variables: Record<string, string>): string {
  const copy = numberTrialCopy(trialKind(variables.kind), variables.locale, variables);
  const greet = TRIAL_GREETINGS[variables.locale ?? "en"] ?? TRIAL_GREETINGS.en!;
  return [greet(variables.firstName ?? ""), "", ...copy.lines.flatMap((line) => [line, ""]), `${copy.button}: ${variables.url ?? ""}`, "", variables.senderName ?? "LobbyStack"].join("\n");
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

function onboardingFollowupBody(variables: Record<string, string>): string {
  const sender = variables.senderName ?? "";
  const business = variables.businessName ?? "";
  if (variables.locale === "es") {
    return [
      variables.firstName ? `Hola, ${variables.firstName}:` : "Hola:",
      "",
      `Soy ${sender}, fundador de LobbyStack. Ayer configuró una recepcionista para ${business}. Gracias por probarla.`,
      "",
      "Me encantaría saber qué le pareció:",
      "",
      "1. ¿Le gustó? ¿Qué funcionó bien y qué no le convenció?",
      "2. ¿Qué deberíamos mejorar?",
      "3. ¿Piensa usarla de verdad, con su propio número de teléfono? Si no, ¿qué se lo impide?",
      "",
      "Puede responder a este correo. ¡Con dos líneas basta!",
      "",
      "Gracias de nuevo,",
      sender,
      "Fundador, LobbyStack",
    ].join("\n");
  }
  if (variables.locale === "sr") {
    return [
      variables.firstName ? `Zdravo, ${variables.firstName},` : "Zdravo,",
      "",
      `Ja sam ${sender}, osnivač LobbyStacka. Juče ste podesili recepcionera za ${business}. Hvala što ste ga isprobali.`,
      "",
      "Voleo bih da čujem Vaše utiske:",
      "",
      "1. Da li Vam se dopao? Šta je dobro radilo, a šta Vam nije delovalo kako treba?",
      "2. Šta bi trebalo da poboljšamo?",
      "3. Da li planirate da ga zaista koristite, sa svojim brojem telefona? Ako ne, šta Vas sprečava?",
      "",
      "Možete da odgovorite na ovaj imejl, i dva reda su sasvim dovoljna!",
      "",
      "Hvala još jednom,",
      sender,
      "Osnivač, LobbyStack",
    ].join("\n");
  }
  if (variables.locale === "fr") {
    return [
      variables.firstName ? `Bonjour ${variables.firstName},` : "Bonjour,",
      "",
      `Je suis ${sender}, le fondateur de LobbyStack. Vous avez configuré une réceptionniste pour ${business} hier. Merci de l'avoir essayée.`,
      "",
      "J'aimerais savoir ce que vous en avez pensé :",
      "",
      "1. Avez-vous aimé l'expérience ? Qu'est-ce qui a bien fonctionné, et qu'est-ce qui clochait ?",
      "2. Que devrions-nous améliorer ?",
      "3. Comptez-vous l'utiliser pour vrai, avec votre propre numéro de téléphone ? Sinon, qu'est-ce qui vous en empêche ?",
      "",
      "Vous pouvez répondre à ce courriel, et deux lignes suffiraient !",
      "",
      "Merci encore,",
      sender,
      "Fondateur, LobbyStack",
    ].join("\n");
  }
  return [
    variables.firstName ? `Hi ${variables.firstName},` : "Hi,",
    "",
    `I'm ${sender}, the founder of LobbyStack. You set up a receptionist for ${business} yesterday. Thanks for giving it a try.`,
    "",
    "I'd love to hear what you thought:",
    "",
    "1. Did you like it? What worked, and what felt off?",
    "2. What should we improve?",
    "3. Do you plan to use it for real, with your own phone number? If not, what's stopping you?",
    "",
    "You can reply to this email, and two lines would be plenty!",
    "",
    "Thanks again,",
    sender,
    "Founder, LobbyStack",
  ].join("\n");
}

// LobbyStack's mark, which only LobbyStack's own name gets (the dashboard's rule too).
const LOBBYSTACK_MARK = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="-30 -30 278 291" role="img" aria-label="LobbyStack"><g transform="translate(0.000000,231.000000) scale(0.100000,-0.100000)" fill="#0B0B0D" stroke="none"><path d="M968 2280 c-42 -16 -195 -79 -340 -141 -144 -62 -317 -133 -383 -159 -90 -36 -130 -58 -162 -88 -85 -82 -78 2 -81 -976 -3 -968 -6 -916 63 -916 19 0 54 9 77 20 24 10 147 62 273 114 338 138 342 140 365 178 20 32 20 48 20 763 0 702 1 731 19 761 12 19 34 37 54 43 33 11 54 4 398 -133 267 -107 370 -152 387 -171 26 -31 23 42 25 -725 l2 -673 c0 -50 8 -86 19 -86 11 -12 31 -21 47 -21 24 0 296 106 358 140 11 5 30 27 43 47 l23 38 l0 654 0 836 -27 46 c-48 81 -77 98 -404 233 -170 71 -371 155 -447 187 -165 71 -208 75 -329 29z"/></g></svg>`;

/**
 * What heads an email: the brand's logo, LobbyStack's mark while the name is
 * LobbyStack, or else the name on its own. A logo saved as a path on the
 * dashboard gets the brand's origin, since a mail client has no page to resolve it against.
 */
function emailHeader(brand: EmailBrand): string {
  if (brand.logoUrl) {
    const src = brand.logoUrl.startsWith("/") ? `${brand.origin}${brand.logoUrl}` : brand.logoUrl;
    return `<img src="${escapeHtml(src)}" alt="${escapeHtml(brand.name)}" height="48" style="height:48px;width:auto;max-width:240px;border:0;" />`;
  }
  if (brand.name === DEFAULT_APP_NAME) return LOBBYSTACK_MARK;
  return `<p style="margin:0;font-size:20px;font-weight:600;line-height:1.25;color:#0B0B0D;text-align:center;">${escapeHtml(brand.name)}</p>`;
}

function renderEmailLayout({ brand, previewText, content }: { brand: EmailBrand; previewText: string; content: string }): string {
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
              <td align="center" style="padding-bottom:32px;">
                ${emailHeader(brand)}
              </td>
            </tr>
            <tr>
              <td>
                ${content}
              </td>
            </tr>
          </table>
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
