import { createHash } from "node:crypto";

import nodemailer, { type Transporter } from "nodemailer";
import { assertCertificationRecipient } from "@lobbystack/shared";

export type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
  from: string;
  replyTo?: string;
};

type TemplateName = "existing_account" | "verify_email" | "password_reset" | "invitation" | "operator_alert" | "feedback_submission" | "onboarding_followup" | "number_trial" | "number_release";

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

  async sendTemplate(input: { template: TemplateName; to: string; subject: string; variables: Record<string, string>; idempotencyKey?: string; from?: string; replyTo?: string }): Promise<{ messageId: string }> {
    assertCertificationRecipient("email", input.to);
    const email = renderTemplate(input.template, input.subject, input.variables);
    // A per-message sender (the founder check-in) replaces the default reply-to
    // too, so replies reach that sender rather than the shared inbox.
    const replyTo = input.from ? input.replyTo : input.replyTo ?? this.config.replyTo;
    const result = await this.transporter.sendMail({
      from: input.from ?? this.config.from,
      ...(replyTo ? { replyTo } : {}),
      to: input.to,
      subject: input.subject,
      text: email.text,
      ...(email.html ? { html: email.html } : {}),
      ...(input.idempotencyKey ? { messageId: `<${createHash("sha256").update(input.idempotencyKey).digest("hex")}@mail.lobbystack.internal>` } : {}),
    });
    return { messageId: result.messageId };
  }
}

function renderTemplate(template: TemplateName, subject: string, variables: Record<string, string>): { text: string; html?: string } {
  const text = templateBody(template, variables);

  if (template !== "verify_email" || !variables.code) {
    return { text };
  }

  const code = escapeHtml(variables.code);
  return {
    text,
    html: renderEmailLayout({
      previewText: subject,
      content: [
        '<h1 style="margin:0 0 24px;font-size:28px;font-weight:600;line-height:1.25;color:#0B0B0D;text-align:center;">Verify your email address</h1>',
        '<p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:#3D3D3D;text-align:center;">Enter this verification code to finish setting up your LobbyStack account.</p>',
        `<p style="margin:0 0 24px;padding:16px 24px;background-color:#F3F4F6;border-radius:16px;font-size:32px;font-weight:600;line-height:1.25;letter-spacing:8px;color:#0B0B0D;text-align:center;">${code}</p>`,
        '<p style="margin:0 0 12px;font-size:14px;line-height:1.5;color:#6B7280;text-align:center;">This code expires in 10 minutes.</p>',
        '<p style="margin:0;font-size:14px;line-height:1.5;color:#6B7280;text-align:center;">If you did not request this code, you can safely ignore this email.</p>',
      ].join(""),
    }),
  };
}

function templateBody(template: TemplateName, variables: Record<string, string>): string {
  switch (template) {
    case "existing_account":
      return existingAccountBody(variables);
    case "verify_email":
      return variables.code
        ? `Your LobbyStack email verification code is: ${variables.code}. It expires in 10 minutes.`
        : `Verify your LobbyStack email address using this link: ${variables.url ?? ""}`;
    case "password_reset":
      return variables.code
        ? `Your LobbyStack password reset code is: ${variables.code}. It expires in 10 minutes.`
        : `Reset your LobbyStack password using this link: ${variables.url ?? ""}`;
    case "invitation":
      return `You have been invited to join LobbyStack. Accept the invitation here: ${variables.url ?? ""}`;
    case "operator_alert":
      return variables.message ?? "LobbyStack operator notification";
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

function existingAccountBody(variables: Record<string, string>): string {
  const signIn = variables.signInUrl;
  const reset = variables.resetUrl;
  switch (variables.locale) {
    case "fr":
      return `Vous avez déjà un compte LobbyStack. Connectez-vous pour continuer : ${signIn}. Mot de passe oublié ? ${reset}. Si vous n’avez pas demandé la création d’un compte, ignorez cet e-mail.`;
    case "es":
      return `Ya tiene una cuenta de LobbyStack. Inicie sesión para continuar: ${signIn}. ¿Olvidó su contraseña? ${reset}. Si no solicitó una cuenta, ignore este correo.`;
    case "sr":
      return `Već imate LobbyStack nalog. Prijavite se da biste nastavili: ${signIn}. Zaboravili ste lozinku? ${reset}. Ako niste zatražili nalog, zanemarite ovaj imejl.`;
    default:
      return `You already have a LobbyStack account. Sign in to continue: ${signIn}. Forgot your password? ${reset}. If you did not request an account, ignore this email.`;
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

function renderEmailLayout({ previewText, content }: { previewText: string; content: string }): string {
  const escapedPreviewText = escapeHtml(previewText);
  const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="-30 -30 278 291" role="img" aria-label="LobbyStack"><g transform="translate(0.000000,231.000000) scale(0.100000,-0.100000)" fill="#0B0B0D" stroke="none"><path d="M968 2280 c-42 -16 -195 -79 -340 -141 -144 -62 -317 -133 -383 -159 -90 -36 -130 -58 -162 -88 -85 -82 -78 2 -81 -976 -3 -968 -6 -916 63 -916 19 0 54 9 77 20 24 10 147 62 273 114 338 138 342 140 365 178 20 32 20 48 20 763 0 702 1 731 19 761 12 19 34 37 54 43 33 11 54 4 398 -133 267 -107 370 -152 387 -171 26 -31 23 42 25 -725 l2 -673 c0 -50 8 -86 19 -86 11 -12 31 -21 47 -21 24 0 296 106 358 140 11 5 30 27 43 47 l23 38 l0 654 0 836 -27 46 c-48 81 -77 98 -404 233 -170 71 -371 155 -447 187 -165 71 -208 75 -329 29z"/></g></svg>`;

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
                ${logoSvg}
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
