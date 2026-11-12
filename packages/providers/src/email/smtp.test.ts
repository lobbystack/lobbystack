import { afterEach, describe, expect, it, vi } from "vitest";
import { emailSender, hostBrand, resolveBrandLinks, type Brand } from "@lobbystack/shared";

import hostEmails from "./__fixtures__/host-emails.json";
import { SmtpEmailProvider, isPermanentSmtpRejection } from "./smtp";

afterEach(() => vi.unstubAllEnvs());

type SendInput = Parameters<SmtpEmailProvider["sendTemplate"]>[0];
type FixtureInput = Omit<SendInput, "brand">;

/** The host brand of a deployment on app.example.test that sends from EMAIL_FROM with a shared Reply-To. */
function host(environment: Record<string, string> = {}, saved: { appName: string | null; logoVersion: string | null } | null = null): Brand {
  return hostBrand({ environment: { APP_BASE_URL: "https://app.example.test", EMAIL_REPLY_TO: "support@example.test", ...environment }, saved, links: resolveBrandLinks({}) });
}

const brand = host();

const partner: Brand = {
  kind: "partner",
  partnerId: "partner-1",
  name: "Bright Desk",
  logoUrl: null,
  faviconUrl: null,
  color: null,
  origin: "https://bright.example.test",
  links: { website: null, terms: null, privacy: null, support: null },
  email: { fromName: "Bright Desk", fromAddress: "no-reply@bright.example.test", replyTo: "help@bright.example.test" },
};

function capture(from = "no-reply@example.test") {
  const sendMail = vi.fn().mockResolvedValue({ messageId: "provider-id" });
  const provider = new SmtpEmailProvider({ host: "localhost", port: 1025, secure: false, username: "", password: "", from }, { sendMail } as never);
  return { provider, sendMail, sent: (index = 0) => sendMail.mock.calls[index]?.[0] };
}

/** Sends as the worker does: under a brand, with the sender and Reply-To the brand gives. */
async function send(provider: SmtpEmailProvider, input: FixtureInput, under: Brand = brand) {
  await provider.sendTemplate({ ...input, brand: under, ...emailSender(under, { from: input.from ?? null, replyTo: input.replyTo ?? null }) });
}

const fixtures = hostEmails.map((email) => [email.name, email.input as unknown as FixtureInput, email.sent] as const);

// The templates whose subject the worker writes under the brand, when the payload names none.
const BRAND_SUBJECTS = new Set(["verify_email", "password_reset", "existing_account", "account_setup", "invitation"]);

describe("emails under the host brand", () => {
  // host-emails.json holds every template in every language as the provider
  // sent it before emails had a brand: sender, Reply-To, subject, text, HTML
  // and Message-ID.
  it.each(fixtures)("sends %s exactly as before", async (_name, input, before) => {
    const { provider, sent } = capture("LobbyStack <no-reply@example.test>");
    await send(provider, input);
    expect(sent()).toEqual(before);
  });

  it.each(fixtures.filter(([name, input]) => BRAND_SUBJECTS.has(input.template) && name !== "verify_email escaped code"))("writes the subject of %s exactly as before", async (name, input, before) => {
    const { provider, sent } = capture("LobbyStack <no-reply@example.test>");
    const { subject: _subject, ...withoutSubject } = input;
    const variables = name === "verify_email email change link" ? { ...input.variables, purpose: "email_change" } : input.variables;
    await send(provider, { ...withoutSubject, variables });
    expect(sent()).toEqual(before);
  });

  it.each(fixtures)("keeps LobbyStack in %s on a deployment branded as something else", async (_name, input, before) => {
    const { provider, sent } = capture("LobbyStack <no-reply@example.test>");
    await send(provider, input, host({ BRAND_APP_NAME: "Front Desk" }, { appName: "Saved Desk", logoVersion: "abc" }));
    expect(sent()).toEqual(before);
  });

  it("sends the host's links exactly as queued, whatever the worker's APP_BASE_URL", async () => {
    const { provider, sent } = capture();
    const moved = host({ APP_BASE_URL: "https://desk.example.test/" });
    await send(provider, { template: "invitation", to: "teammate@example.test", variables: { url: "http://localhost/accept-invite?token=a%2Fb" } }, moved);
    await send(provider, { template: "existing_account", to: "owner@example.test", variables: { locale: "en", signInUrl: "https://app.example.test/en/login", resetUrl: "https://app.example.test/en/forgot-password" } }, moved);
    expect(sent(0).text).toContain("Accept the invitation: http://localhost/accept-invite?token=a%2Fb");
    expect(sent(1).text).toContain("Sign in to continue: https://app.example.test/en/login. Forgot your password? https://app.example.test/en/forgot-password.");
  });
});

describe("emails under a partner's brand", () => {
  it("puts each dashboard link on the partner's origin, keeping its path and query", async () => {
    const { provider, sent } = capture();
    await send(provider, { template: "existing_account", to: "owner@example.test", variables: { locale: "en", signInUrl: "https://app.example.test/en/login?next=%2Fcalls", resetUrl: "/en/forgot-password" } }, partner);
    await send(provider, { template: "password_reset", to: "owner@example.test", variables: { url: "mailto:help@example.test" } }, partner);
    expect(sent(0).text).toContain("https://bright.example.test/en/login?next=%2Fcalls");
    expect(sent(0).text).toContain("https://bright.example.test/en/forgot-password");
    expect(sent(1).text).toContain("using this link: mailto:help@example.test");
  });

  it("names the partner, links to its origin, and sends from it with its Reply-To", async () => {
    const { provider, sent } = capture();
    await send(provider, { template: "invitation", to: "teammate@example.test", variables: { url: "https://app.example.test/accept-invite?token=t" } }, partner);
    expect(sent()).toMatchObject({
      from: '"Bright Desk" <no-reply@bright.example.test>',
      replyTo: "help@bright.example.test",
      subject: "Join the Bright Desk team",
      text: "You've been invited to join the Bright Desk team.\n\nThe link works for 7 days.\n\nAccept the invitation: https://bright.example.test/accept-invite?token=t\n\nBright Desk",
    });
    expect(sent().html).toContain('href="https://bright.example.test/accept-invite?token=t"');
  });

  it("names the business in an invitation to it, and tells its owner when the partner releases or deletes it", async () => {
    const { provider, sent } = capture();
    await send(provider, { template: "invitation", to: "owner@example.test", variables: { url: "https://app.example.test/accept-invite?token=t", businessName: "Harbor Dental" } }, partner);
    await send(provider, { template: "business_deleted", to: "owner@example.test", variables: { businessName: "Harbor Dental" } }, partner);
    await send(provider, { template: "business_released", to: "owner@example.test", variables: { url: "https://app.example.test/login", businessName: "Harbor Dental", partnerName: "Bright Desk" } });
    expect(sent(0)).toMatchObject({ subject: "Join Harbor Dental on Bright Desk", text: expect.stringContaining("You've been invited to join Harbor Dental on Bright Desk.") });
    expect(sent(1)).toMatchObject({ subject: "Bright Desk deleted Harbor Dental", text: expect.stringContaining("Bright Desk deleted Harbor Dental") });
    expect(sent(1).text).not.toContain("http");
    // A released business runs under the host now, so the note goes out under the host's brand and links to its sign-in.
    expect(sent(2)).toMatchObject({ subject: "Harbor Dental is yours to run on LobbyStack", text: expect.stringContaining("Bright Desk handed Harbor Dental over to you.") });
    expect(sent(2).text).toContain("Sign in to LobbyStack: https://app.example.test/login");
  });

  it("heads an email with the partner's name when its logo is an SVG, which mail clients don't show", async () => {
    const { provider, sent } = capture();
    await send(provider, { template: "verify_email", to: "owner@example.test", variables: { code: "123456" } }, { ...partner, logoUrl: "/api/branding/logo?partner=p&v=1", emailLogoUrl: null });
    expect(sent().html).not.toContain("<img");
    expect(sent().html).toContain(">Bright Desk</p>");
  });

  it("writes the partner's name into every language's account emails", async () => {
    const { provider, sent } = capture();
    const locales = ["en", "fr", "es", "sr"];
    for (const locale of locales) {
      await send(provider, { template: "existing_account", to: "owner@example.test", variables: { locale, signInUrl: "https://app.example.test/login", resetUrl: "https://app.example.test/reset" } }, partner);
      await send(provider, { template: "account_setup", to: "owner@example.test", variables: { locale, email: "owner@example.test", url: "https://app.example.test/signup" } }, partner);
    }
    const emails = Array.from({ length: locales.length * 2 }, (_, index) => sent(index));
    expect(emails.map((email) => email.subject)).toEqual([
      "You already have a Bright Desk account", "Make your Bright Desk account",
      "Votre compte Bright Desk existe déjà", "Créez votre compte Bright Desk",
      "Ya tiene una cuenta de Bright Desk", "Cree su cuenta de Bright Desk",
      "Već imate Bright Desk nalog", "Napravite svoj Bright Desk nalog",
    ]);
    for (const email of emails) {
      expect(email.text).toContain("Bright Desk");
      expect(email.text).toContain("https://bright.example.test/");
      expect(email.text).not.toContain("LobbyStack");
    }
  });

  it("heads the verification code with the partner's name, or its logo on the partner's origin", async () => {
    const { provider, sent } = capture();
    await send(provider, { template: "verify_email", to: "owner@example.test", variables: { code: "123456" } }, partner);
    expect(sent(0)).toMatchObject({ subject: "Your Bright Desk verification code", text: "Your Bright Desk email verification code is: 123456. It expires in 10 minutes." });
    expect(sent(0).html).toContain("to finish setting up your Bright Desk account.</p>");
    expect(sent(0).html).toContain(">Bright Desk</p>");
    expect(sent(0).html).not.toContain("<svg");
    expect(sent(0).html).not.toContain("LobbyStack");
    await send(provider, { template: "verify_email", to: "owner@example.test", variables: { code: "1" } }, { ...partner, name: "Bright <Desk>", logoUrl: "/api/branding/logo?v=abc" });
    expect(sent(1).html).toContain('<img src="https://bright.example.test/api/branding/logo?v=abc" alt="Bright &lt;Desk&gt;" height="48"');
    expect(sent(1).html).toContain("setting up your Bright &lt;Desk&gt; account");
  });

  it("names the partner in the subjects of verification, email change and reset emails", async () => {
    const { provider, sent } = capture();
    await send(provider, { template: "verify_email", to: "owner@example.test", variables: { url: "https://app.example.test/api/auth/verify-email?token=t" } }, partner);
    await send(provider, { template: "verify_email", to: "owner@example.test", variables: { url: "https://app.example.test/api/auth/verify-email?token=t", purpose: "email_change" } }, partner);
    await send(provider, { template: "password_reset", to: "owner@example.test", variables: { code: "654321" } }, partner);
    expect([sent(0).subject, sent(1).subject, sent(2).subject]).toEqual(["Verify your Bright Desk email", "Confirm your Bright Desk email change", "Reset your Bright Desk password"]);
    expect(sent(1).text).toBe("Verify your Bright Desk email address using this link: https://bright.example.test/api/auth/verify-email?token=t");
  });
});

describe("SMTP delivery", () => {
  it("recognizes a provider's permanent 5xx rejection but not a temporary one", () => {
    expect(isPermanentSmtpRejection(Object.assign(new Error("Message failed: 550 This API key is not authorized to send emails from receptionistportal.com"), { responseCode: 550, code: "EENVELOPE" }))).toBe(true);
    expect(isPermanentSmtpRejection({ response: "554 5.7.1 Sender rejected" })).toBe(true);
    expect(isPermanentSmtpRejection(Object.assign(new Error("Try again later"), { responseCode: 451 }))).toBe(false);
    expect(isPermanentSmtpRejection(new Error("connect ECONNREFUSED 127.0.0.1:587"))).toBe(false);
    expect(isPermanentSmtpRejection(undefined)).toBe(false);
  });
  it("blocks unapproved certification recipients before SMTP delivery", async () => {
    vi.stubEnv("LOBBYSTACK_CERTIFICATION_MODE", "true");
    vi.stubEnv("LOBBYSTACK_CERTIFICATION_EMAILS", "approved@example.invalid");
    const { provider, sendMail } = capture();
    await expect(provider.sendTemplate({ brand, template: "operator_alert", to: "other@example.invalid", subject: "Test", variables: {} })).rejects.toThrow("CERTIFICATION_RECIPIENT_BLOCKED");
    expect(sendMail).not.toHaveBeenCalled();
    await provider.sendTemplate({ brand, template: "operator_alert", to: "approved@example.invalid", subject: "Test", variables: {} });
    expect(sendMail).toHaveBeenCalledOnce();
  });
  describe("welcome", () => {
    const welcome = { template: "welcome" as const, to: "owner@example.test", subject: "Welcome to LobbyStack, Ryan", variables: { locale: "en", firstName: "Ryan", businessName: "Metroprint", goal: "answer_calls", number: "+14388070285", url: "https://app.example.test/?setup=phoneNumber" } };

    it("welcomes an owner who took a number, and its button forwards their missed calls", async () => {
      const { provider, sent } = capture();
      await send(provider, welcome);
      expect(sent().from).toBe("no-reply@example.test");
      expect(sent().replyTo).toBe("support@example.test");
      expect(sent().text).toBe([
        "Welcome to LobbyStack, Ryan",
        "",
        "We're glad you're here. Your agent for Metroprint is set up and ready to pick up the calls you can't.",
        "",
        "Three steps and it's answering your customers:",
        "",
        "1. Hear your agent",
        "Call it from your dashboard and ask what your callers ask most.",
        "",
        "2. Teach it your business",
        "Add your hours, prices and FAQs so it answers the way your team does.",
        "",
        "3. Forward your calls to +14388070285",
        "Your phone rings first. When you miss a call, your agent picks up.",
        "",
        "Forward my missed calls: https://app.example.test/?setup=phoneNumber",
        "",
        "Questions or stuck on a step? Reply to this email and we'll help.",
        "",
        "The LobbyStack team",
      ].join("\n"));
      const html = sent().html as string;
      expect(html).toContain(">Welcome to LobbyStack, Ryan</h1>");
      expect(html).toContain('<td align="left" style="padding-bottom:32px;">');
      const anchors = [...html.matchAll(/<a href="([^"]+)"[^>]*>([^<]+)<\/a>/g)].map(([, href, text]) => ({ href, text }));
      expect(anchors).toEqual([{ href: "https://app.example.test/?setup=phoneNumber", text: "Forward my missed calls" }]);
    });

    it("asks an owner without a number to get one, and fits the steps to booking", async () => {
      const { provider, sent } = capture();
      await send(provider, { ...welcome, variables: { ...welcome.variables, firstName: "", goal: "book_appointments", number: "" } });
      expect(sent().text).toMatch(/^Welcome to LobbyStack\n/);
      expect(sent().text).toContain("Call it from your dashboard and ask it to book an appointment.");
      expect(sent().text).toContain("Add your services, hours and booking rules so it books the way your team does.");
      expect(sent().text).toContain("3. Get a phone number\n");
      expect(sent().text).toContain("Answer my missed calls: https://app.example.test/?setup=phoneNumber");
    });

    it("writes the welcome in French, Spanish and Serbian", async () => {
      const { provider, sendMail } = capture();
      for (const locale of ["fr", "es", "sr"]) await send(provider, { ...welcome, variables: { ...welcome.variables, locale } });
      const [french, spanish, serbian] = sendMail.mock.calls.map((call) => call[0].text as string);
      expect(french).toMatch(/^Bienvenue chez LobbyStack, Ryan\n/);
      expect(french).toContain("Transférer mes appels manqués : https://app.example.test/?setup=phoneNumber");
      expect(spanish).toMatch(/^Le damos la bienvenida a LobbyStack, Ryan\n/);
      expect(spanish).toContain("Desvíe sus llamadas al +14388070285");
      expect(serbian).toMatch(/^Dobro došli u LobbyStack, Ryan\n/);
      expect(serbian).not.toMatch(/[Ѐ-ӿ]/);
    });
  });

  describe("plan reminder", () => {
    const reminder = { template: "plan_reminder" as const, to: "owner@example.test", variables: { locale: "en", firstName: "Ryan", businessName: "Metroprint", number: "+15550100123", url: "https://app.example.test/onboarding/plan" } };

    it("names the live number, formatted, and its button opens the plans", async () => {
      const { provider, sent } = capture();
      await send(provider, reminder);
      expect(sent().from).toBe("no-reply@example.test");
      expect(sent().replyTo).toBe("support@example.test");
      expect(sent().subject).toBe("Your number (555) 010-0123 is live");
      expect(sent().text).toBe([
        "Hi Ryan,",
        "",
        "Your number (555) 010-0123 is live, and your agent answers its calls for Metroprint.",
        "",
        "Start your 14-day free trial to finish setup. It takes one click, and you won't need a card.",
        "",
        "Start your 14-day free trial: https://app.example.test/onboarding/plan",
        "",
        "LobbyStack",
      ].join("\n"));
      const html = sent().html as string;
      expect(html).toContain('<td align="left" style="padding-bottom:32px;">');
      const anchors = [...html.matchAll(/<a href="([^"]+)"[^>]*>([^<]+)<\/a>/g)].map(([, href, text]) => ({ href, text }));
      expect(anchors).toEqual([{ href: "https://app.example.test/onboarding/plan", text: "Start your 14-day free trial" }]);
      // The paid plans stay on the page.
      expect(sent().text).not.toMatch(/Starter|Pro\b|\$/);
    });

    it("greets an owner with no name, and shows a number outside North America in international form", async () => {
      const { provider, sent } = capture();
      await send(provider, { ...reminder, variables: { ...reminder.variables, firstName: "", number: "+33612345678" } });
      expect(sent().subject).toBe("Your number +33 6 12 34 56 78 is live");
      expect(sent().text).toMatch(/^Hi,\n/);
    });

    it("writes the reminder in French, Spanish and Serbian", async () => {
      const { provider, sendMail } = capture();
      for (const locale of ["fr", "es", "sr"]) await send(provider, { ...reminder, variables: { ...reminder.variables, locale } });
      const [french, spanish, serbian] = sendMail.mock.calls.map((call) => call[0] as { subject: string; text: string });
      expect(french!.subject).toBe("Votre numéro (555) 010-0123 est actif");
      expect(french!.text).toMatch(/^Bonjour Ryan,\n/);
      expect(french!.text).toContain("Commencer l'essai gratuit de 14 jours : https://app.example.test/onboarding/plan");
      expect(spanish!.subject).toBe("Su número (555) 010-0123 ya está activo");
      expect(spanish!.text).toContain("Empezar la prueba gratuita de 14 días: https://app.example.test/onboarding/plan");
      expect(serbian!.subject).toBe("Vaš broj (555) 010-0123 je aktivan");
      expect(serbian!.text).toContain("Započnite besplatnu probu od 14 dana: https://app.example.test/onboarding/plan");
      expect(`${serbian!.subject}${serbian!.text}`).not.toMatch(/[Ѐ-ӿ]/);
    });
  });

  it("names no forward when a trial without a mobile runs out of minutes", async () => {
    const { provider, sent } = capture();
    await send(provider, { template: "number_trial", to: "owner@example.test", variables: { locale: "en", kind: "minutes_out", businessName: "Acme Dental", trialNumber: "+14165550123", forwardTo: "", url: "https://app.example.test/settings/plan" } });
    expect(sent(0).subject).toBe("You're out of minutes. Calls are not being answered");
    expect(sent(0).text).toContain("Calls now go unanswered.");
    expect(sent(0).text).not.toContain("Calls now ring .");
  });

  it("invites an owner a platform key named to make their account at the sign-up page", async () => {
    const { provider, sendMail } = capture();
    await send(provider, { template: "account_setup", to: "owner@example.test", variables: { locale: "en", email: "owner@example.test", url: "https://app.example.test/en/signup" } });
    await send(provider, { template: "account_setup", to: "owner@example.test", variables: { locale: "fr", email: "owner@example.test", url: "https://app.example.test/fr/signup" } });
    const [english, french] = sendMail.mock.calls.map((call) => call[0].text as string);
    expect(english).toBe("You were invited to make a LobbyStack account with owner@example.test. Make it here, with this address: https://app.example.test/en/signup. If you weren't expecting this, ignore this email.");
    expect(french).toContain("Créez-le ici, avec cette adresse : https://app.example.test/fr/signup");
  });

  it.each([
    ["en", "New passkey on your LobbyStack account", "reset your password now: https://app.example.test/en/forgot-password"],
    ["fr", "Nouvelle clé d’accès sur votre compte LobbyStack", "réinitialisez votre mot de passe maintenant : https://app.example.test/fr/forgot-password"],
    ["es", "Nueva llave de acceso en su cuenta de LobbyStack", "restablezca su contraseña ahora: https://app.example.test/es/forgot-password"],
    ["sr", "Novi pristupni ključ na vašem LobbyStack nalogu", "odmah resetujte lozinku: https://app.example.test/sr/forgot-password"],
  ])("writes the passkey alert in %s, with where to see passkeys and how to undo it", async (locale, subject, resetLine) => {
    const { provider, sendMail } = capture();
    await send(provider, { template: "passkey_added", to: "owner@example.test", variables: { locale, settingsUrl: "https://app.example.test/settings/account", resetUrl: `https://app.example.test/${locale}/forgot-password` } });
    const sent = sendMail.mock.calls[0]![0];
    expect(sent.subject).toBe(subject);
    expect(sent.text).toContain("https://app.example.test/settings/account");
    expect(sent.text).toContain(resetLine);
    expect(sent.html).toContain('href="https://app.example.test/settings/account"');
    expect(sent.html).toContain(`href="https://app.example.test/${locale}/forgot-password"`);
  });

  it("styles every other email in the shared layout", async () => {
    const { provider, sent } = capture();
    const cases: [Omit<FixtureInput, "to" | "subject">, string][] = [
      [{ template: "password_reset", variables: { url: "https://app.example.test/reset" } }, 'href="https://app.example.test/reset"'],
      [{ template: "password_reset", variables: { code: "654321" } }, ">654321</p>"],
      [{ template: "existing_account", variables: { locale: "fr", signInUrl: "https://app.example.test/fr/login", resetUrl: "https://app.example.test/fr/forgot-password" } }, 'href="https://app.example.test/fr/login"'],
      [{ template: "account_setup", variables: { locale: "es", email: "o@example.test", url: "https://app.example.test/es/signup" } }, 'href="https://app.example.test/es/signup"'],
      [{ template: "operator_alert", variables: { message: "Line <one>\n\nLine two" } }, "Line &lt;one&gt;</p>"],
      [{ template: "number_release", variables: { locale: "en", kind: "canceled", number: "+1555", periodEnd: "May 1", releaseDate: "May 31", url: "https://app.example.test/plan" } }, 'href="https://app.example.test/plan"'],
      [{ template: "number_trial", variables: { locale: "en", kind: "day10", url: "https://app.example.test/trial" } }, 'href="https://app.example.test/trial"'],
      [{ template: "feedback_submission", variables: { body: "Great app" } }, ">Great app</p>"],
    ];
    for (const [input] of cases) {
      await send(provider, { ...input, to: "owner@example.test", subject: "Subject" });
    }
    cases.forEach(([, expected], index) => {
      expect(sent(index).html).toContain("<!doctype html>");
      expect(sent(index).html).toContain(expected);
    });
  });

  it("puts the logo on the left over left-aligned emails, and keeps the account emails centered", async () => {
    const { provider, sent } = capture();
    await send(provider, { template: "number_trial", to: "owner@example.test", variables: { locale: "en", kind: "day10", url: "https://app.example.test/trial" } });
    await send(provider, { template: "operator_alert", to: "owner@example.test", subject: "Alert", variables: { message: "Hi" } });
    await send(provider, { template: "verify_email", to: "owner@example.test", variables: { code: "123456" } });
    await send(provider, { template: "invitation", to: "owner@example.test", variables: { url: "https://app.example.test/accept-invite?token=t" } });
    const header = (index: number) => /<td align="(\w+)" style="padding-bottom:32px;">/.exec(sent(index).html)?.[1];
    expect([header(0), header(1), header(2), header(3)]).toEqual(["left", "left", "center", "center"]);
  });

  it("signs the trial and number release emails as LobbyStack, whatever sender name the job carries", async () => {
    const { provider, sent } = capture();
    await send(provider, { template: "number_trial", to: "owner@example.test", variables: { locale: "fr", kind: "day13", url: "https://app.example.test/settings/plan", senderName: "Raphael" } });
    await send(provider, { template: "number_release", to: "owner@example.test", variables: { locale: "en", kind: "release_soon", number: "+1555", releaseDate: "May 31", url: "https://app.example.test/settings/plan", senderName: "Raphael" } });
    for (const index of [0, 1]) {
      expect(sent(index).text.trimEnd().endsWith("\n\nLobbyStack")).toBe(true);
      expect(sent(index).text).not.toContain("Raphael");
      expect(sent(index).html).not.toContain("Raphael");
    }
  });

  describe("call summary", () => {
    const call = { template: "call_summary" as const, to: "owner@example.test", variables: { locale: "en", businessName: "Metroprint", callerName: "Sarah Chen", callerPhone: "+14165550133", startedAt: "2026-11-09T20:32:00.000Z", timezone: "America/Toronto", durationSeconds: "134", summary: "Sarah asked for a quote on 500 <business> cards.", url: "https://app.example.test/calls/call-1" } };

    it("lays out the caller, time, length and summary, with a link to the call and to the alert settings", async () => {
      const { provider, sent } = capture();
      await send(provider, call);
      const email = sent();
      expect(email.subject).toBe("New call from Sarah Chen");
      expect(email.text).toBe([
        "New call for Metroprint",
        "",
        "Caller: Sarah Chen",
        "Phone: +14165550133",
        "When: Monday, November 9 at 3:32 PM",
        "Duration: 2 min 14 sec",
        "",
        "Summary:",
        "Sarah asked for a quote on 500 <business> cards.",
        "",
        "View call: https://app.example.test/calls/call-1",
        "",
        "You get this email for each call your agent answers.",
        "Change alerts: https://app.example.test/account/notifications",
      ].join("\n"));
      expect(email.html).toContain(">New call for Metroprint</h1>");
      expect(email.html).toContain("500 &lt;business&gt; cards.");
      expect(email.html).toContain('href="https://app.example.test/calls/call-1"');
      expect(email.html).toContain('href="https://app.example.test/account/notifications"');
      expect(email.html).not.toMatch(/text-transform:\s*uppercase/);
    });

    it("writes the email in the reader's language and shows what was booked", async () => {
      const { provider, sent } = capture();
      await send(provider, { ...call, variables: { ...call.variables, locale: "fr", summary: "", outcome: "booked", bookedAt: "2026-11-12T15:00:00.000Z", bookedService: "Consultation" } });
      const email = sent();
      expect(email.subject).toBe("Nouvel appel de Sarah Chen");
      expect(email.text).toContain("Nouvel appel pour Metroprint");
      expect(email.text).toContain("Durée : 2 min 14 s");
      expect(email.text).toContain("Résultat : Rendez-vous réservé : Consultation, 12 novembre à 10:00");
      expect(email.text).not.toContain("Résumé");
      expect(email.html).toContain(">Voir l’appel</a>");
    });

    it("says a call went to the team, and leaves out a length nobody measured", async () => {
      const { provider, sent } = capture();
      await send(provider, { ...call, variables: { ...call.variables, outcome: "transferred", durationSeconds: "" } });
      expect(sent().text).toContain("Outcome: Transferred to your team");
      expect(sent().text).not.toContain("Duration");
      expect(sent().text).not.toContain("0 sec");
    });

    it("names an unknown caller and leaves out the phone a website call doesn't have", async () => {
      const { provider, sent } = capture();
      await send(provider, { ...call, variables: { ...call.variables, callerName: "", callerPhone: "", durationSeconds: "32" } });
      expect(sent().subject).toBe("New call for Metroprint");
      expect(sent().text).toContain("Caller: Unknown caller\nWhen:");
      expect(sent().text).toContain("Duration: 32 sec");
    });
  });

  it("localizes the existing-account email in Spanish and Serbian", async () => {
    const { provider, sendMail } = capture();
    await send(provider, { template: "existing_account", to: "owner@example.test", variables: { locale: "es", signInUrl: "https://app.example.test/es/login", resetUrl: "https://app.example.test/es/forgot-password" } });
    await send(provider, { template: "existing_account", to: "owner@example.test", variables: { locale: "sr", signInUrl: "https://app.example.test/sr/login", resetUrl: "https://app.example.test/sr/forgot-password" } });
    const [spanishAccount, serbianAccount] = sendMail.mock.calls.map((call) => call[0].text as string);
    expect(spanishAccount).toContain("Inicie sesión para continuar: https://app.example.test/es/login");
    expect(serbianAccount).toContain("Prijavite se da biste nastavili: https://app.example.test/sr/login");
  });
  it("sends reset codes as codes while preserving previously issued reset links", async () => {
    const { provider, sent } = capture();
    await send(provider, { template: "password_reset", to: "recipient@example.test", subject: "Reset", variables: { code: "123456" } });
    expect(sent(0).text).toBe("Your LobbyStack password reset code is: 123456. It expires in 10 minutes.");
    await send(provider, { template: "password_reset", to: "recipient@example.test", subject: "Reset", variables: { url: "https://app.example.test/reset" } });
    expect(sent(1).text).toContain("using this link: https://app.example.test/reset");
  });
  it("sends email verification codes while preserving email-change links", async () => {
    const { provider, sent } = capture();
    await send(provider, { template: "verify_email", to: "recipient@example.test", subject: "Verify", variables: { code: "123456" } });
    expect(sent(0).text).toBe("Your LobbyStack email verification code is: 123456. It expires in 10 minutes.");
    expect(sent(0).html).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
    expect(sent(0).html).toContain("Verify your email address");
    expect(sent(0).html).toContain(">123456</p>");
    await send(provider, { template: "verify_email", to: "recipient@example.test", subject: "Verify", variables: { url: "https://app.example.test/verify" } });
    expect(sent(1).text).toContain("using this link: https://app.example.test/verify");
    expect(sent(1).html).toContain('href="https://app.example.test/verify"');
    expect(sent(1).html).toContain("Confirm your email address");
  });
  it("escapes verification email content before rendering branded HTML", async () => {
    const { provider, sent } = capture();
    await send(provider, { template: "verify_email", to: "recipient@example.test", subject: "Verify <email>", variables: { code: "12<345" } });
    const html = sent().html;
    expect(html).toContain("<title>Verify &lt;email&gt;</title>");
    expect(html).toContain(">12&lt;345</p>");
    expect(html).not.toContain(">12<345</p>");
  });
  it("uses a stable privacy-safe Message-ID for retries", async () => {
    const { provider, sent } = capture();
    const input = { brand, template: "verify_email" as const, to: "recipient@example.test", subject: "Verify", variables: { url: "https://app.example.test/verify" }, idempotencyKey: "auth-email:stable" };
    await provider.sendTemplate(input);
    await provider.sendTemplate(input);
    const first = sent(0).messageId;
    expect(first).toBe(sent(1).messageId);
    expect(first).not.toContain("recipient");
  });
});

describe("a business's allowance alert", () => {
  const url = "https://app.example.test/settings/usage";
  const alert = (variables: Record<string, string>) => ({ template: "business_allowance_alert" as const, to: "owner@harbor.example.test", variables: { firstName: "Mia", businessName: "Harbor Dental", month: "October", url, capped: "", ...variables } });

  it("tells a business's owner what happens past its allowance, under its partner's name and on its partner's domain, with no prices", async () => {
    const { provider, sent } = capture();
    await send(provider, alert({ locale: "en", kind: "minutes", threshold: "80", used: "8", included: "10", overage: "off" }), partner);
    await send(provider, alert({ locale: "en", kind: "minutes", threshold: "100", used: "10", included: "10", overage: "off" }), partner);
    await send(provider, alert({ locale: "en", kind: "chats", threshold: "80", used: "40", included: "50", overage: "on", capped: "yes" }), partner);
    await send(provider, alert({ locale: "en", kind: "chats", threshold: "100", used: "50", included: "50", overage: "on" }), partner);
    expect(sent(0)).toMatchObject({ from: "\"Bright Desk\" <no-reply@bright.example.test>", replyTo: "help@bright.example.test", subject: "Harbor Dental used 80% of this month's minutes" });
    expect(sent(0).text).toBe(["Hi Mia,", "", "Harbor Dental used 8 of its 10 minutes for October.", "", "Once they run out, calls forward to your transfer number or the owner's phone until next month.", "", "See your usage: https://bright.example.test/settings/usage", "", "Bright Desk"].join("\n"));
    expect(sent(1).subject).toBe("Harbor Dental used all of this month's minutes");
    expect(sent(1).text).toContain("Harbor Dental used all 10 of its minutes for October.\n\nUntil next month, calls forward to your transfer number or the owner's phone.");
    expect(sent(2).subject).toBe("Harbor Dental used 80% of this month's website chats");
    expect(sent(2).text).toContain("Past them, your website chat keeps replying, up to a monthly limit, and Bright Desk bills you for each extra chat.");
    expect(sent(3).text).toContain("Your website chat keeps replying, and Bright Desk bills you for each extra chat.");
    for (let index = 0; index < 4; index++) {
      expect(sent(index).text).not.toMatch(/LobbyStack|\$|app\.example\.test/);
    }
  });

  it("writes every alert in the reader's language", async () => {
    const { provider, sent } = capture();
    const cases = [["minutes", "80", "off"], ["minutes", "100", "on"], ["chats", "80", "on"], ["chats", "100", "off"]] as const;
    const locales = ["en", "fr", "es", "sr"];
    for (const locale of locales) {
      for (const [kind, threshold, overage] of cases) await send(provider, alert({ locale, kind, threshold, used: "4", included: "5", overage, capped: "yes" }), partner);
    }
    const emails = Array.from({ length: locales.length * cases.length }, (_, index) => sent(index));
    expect(new Set(emails.map((email) => email.subject)).size).toBe(emails.length);
    expect(emails.map((email) => email.subject).slice(cases.length * 3)).toEqual([
      "Firma Harbor Dental je potrošila 80% minuta ovog meseca",
      "Firma Harbor Dental je potrošila sve minute ovog meseca",
      "Firma Harbor Dental je potrošila 80% četova ovog meseca",
      "Firma Harbor Dental je potrošila sve četove ovog meseca",
    ]);
    expect(emails[cases.length]!.text).toContain("Harbor Dental a utilisé 4 des 5 minutes incluses en October.");
    expect(emails[cases.length * 2 + 1]!.text).toContain("Su agente sigue contestando llamadas hasta un tope mensual, y Bright Desk le cobra cada minuto adicional.");
    for (const [index, email] of emails.entries()) {
      const locale = locales[Math.floor(index / cases.length)]!;
      expect(email.text.startsWith({ en: "Hi Mia,", fr: "Bonjour Mia,", es: "Hola, Mia:", sr: "Zdravo, Mia," }[locale]!)).toBe(true);
      expect(email.text).toContain("https://bright.example.test/settings/usage");
      expect(email.text.trimEnd().endsWith("Bright Desk")).toBe(true);
      expect(email.text).not.toMatch(/undefined|—/);
    }
  });
});

describe("a partner's alert about one business's allowance", () => {
  const url = "https://app.example.test/partner/p-1/businesses";
  const alert = (variables: Record<string, string>) => ({ template: "partner_business_allowance_alert" as const, to: "owner@acme.example.test", variables: { firstName: "Ana", businessName: "Harbor Dental", month: "October", url, capped: "", ...variables } });

  it("tells a partner's owner what happens past the business's package, under the host's name, with no prices", async () => {
    const { provider, sent } = capture();
    const under = host({ BRAND_APP_NAME: "Front Desk" });
    await send(provider, alert({ locale: "en", kind: "minutes", threshold: "80", used: "8", included: "10", overage: "off" }), under);
    await send(provider, alert({ locale: "en", kind: "minutes", threshold: "100", used: "10", included: "10", overage: "on", capped: "yes" }), under);
    await send(provider, alert({ locale: "en", kind: "chats", threshold: "80", used: "40", included: "50", overage: "on" }), under);
    await send(provider, alert({ locale: "en", kind: "chats", threshold: "100", used: "50", included: "50", overage: "off" }), under);
    expect(sent(0)).toMatchObject({ subject: "Harbor Dental used 80% of its package's minutes", replyTo: "support@example.test" });
    expect(sent(0).text).toBe(["Hi Ana,", "", "Harbor Dental used 8 of the 10 minutes in its package for October.", "", "Its overage is off, so once they run out, calls forward to its transfer number or the owner's phone until next month.", "", `Turn on its overage on the Businesses page: ${url}`, "", "LobbyStack"].join("\n"));
    expect(sent(1).subject).toBe("Harbor Dental used all of its package's minutes");
    expect(sent(1).text).toContain("Harbor Dental used all 10 minutes in its package for October.\n\nIts agent keeps answering calls until its overage reaches the monthly cap you set, and you bill the business for each extra minute.");
    expect(sent(1).text).toContain(`Change its overage on the Businesses page: ${url}`);
    expect(sent(2).subject).toBe("Harbor Dental used 80% of its package's website chats");
    expect(sent(2).text).toContain("Past them, its website chat keeps replying, and you bill the business for each extra chat.");
    expect(sent(3).text).toContain("Its overage is off, so its website chat stops replying until next month.");
    for (let index = 0; index < 4; index++) expect(sent(index).text).not.toMatch(/Front Desk|\$/);
  });

  it("writes every alert in the reader's language", async () => {
    const { provider, sent } = capture();
    const cases = [["minutes", "80", "off"], ["minutes", "100", "on"], ["chats", "80", "on"], ["chats", "100", "off"]] as const;
    const locales = ["en", "fr", "es", "sr"];
    for (const locale of locales) {
      for (const [kind, threshold, overage] of cases) await send(provider, alert({ locale, kind, threshold, used: "4", included: "5", overage, capped: "yes" }));
    }
    const emails = Array.from({ length: locales.length * cases.length }, (_, index) => sent(index));
    expect(new Set(emails.map((email) => email.subject)).size).toBe(emails.length);
    expect(emails.map((email) => email.subject).slice(cases.length, cases.length * 2)).toEqual([
      "Harbor Dental a utilisé 80 % des minutes de sa formule",
      "Harbor Dental a utilisé toutes les minutes de sa formule",
      "Harbor Dental a utilisé 80 % des clavardages de sa formule",
      "Harbor Dental a utilisé tous les clavardages de sa formule",
    ]);
    expect(emails[cases.length * 2 + 1]!.text).toContain("El negocio sigue contestando llamadas hasta el límite mensual que usted fijó, y usted le cobra cada minuto adicional.");
    expect(emails[cases.length * 3 + 2]!.text).toContain("Kada ih potroši, čet na sajtu firme će nastaviti da odgovara do mesečnog limita koji ste postavili, a Vi ćete joj naplatiti svaki dodatni čet.");
    for (const [index, email] of emails.entries()) {
      const locale = locales[Math.floor(index / cases.length)]!;
      expect(email.text.startsWith({ en: "Hi Ana,", fr: "Bonjour Ana,", es: "Hola, Ana:", sr: "Zdravo, Ana," }[locale]!)).toBe(true);
      expect(email.text).toContain(url);
      expect(email.text).not.toMatch(/undefined|—/);
    }
  });
});

describe("a partner's pool alert", () => {
  const url = "https://app.example.test/partner/p-1/billing";
  const alert = (variables: Record<string, string>) => ({ template: "partner_pool_alert" as const, to: "owner@acme.example.test", variables: { firstName: "Ana", partnerName: "Acme Reception", month: "October", url, ...variables } });

  it("tells an owner what happens past the pool, by whether overage bills, under the host's name whatever the deployment's branding", async () => {
    const { provider, sent } = capture();
    const under = host({ BRAND_APP_NAME: "Front Desk" });
    await send(provider, alert({ locale: "en", kind: "minutes", threshold: "80", used: "200", included: "250", overage: "off", cap: "" }), under);
    await send(provider, alert({ locale: "en", kind: "chats", threshold: "100", used: "1,000", included: "1,000", overage: "on", cap: "" }), under);
    await send(provider, alert({ locale: "en", kind: "minutes", threshold: "100", used: "30", included: "30", overage: "none", cap: "" }), under);
    await send(provider, alert({ locale: "en", kind: "cap", threshold: "100", used: "$50.00", included: "$50.00", overage: "on", cap: "$50.00" }), under);
    expect(sent(0)).toMatchObject({ subject: "Your businesses used 80% of this month's minutes", replyTo: "support@example.test" });
    expect(sent(0).text).toBe(["Hi Ana,", "", "Acme Reception's businesses used 200 of the 250 minutes in your pool for October.", "", "Once the pool runs out, calls will forward to each business's transfer number or its owner's phone until next month.", "", `Turn on overage or pick a bigger tier on the Billing page: ${url}`, "", "LobbyStack"].join("\n"));
    expect(sent(1).subject).toBe("Your businesses used all of this month's chats");
    expect(sent(1).text).toContain("They keep replying on their websites, and you pay your tier's overage rate for each extra chat.");
    expect(sent(1).text).toContain(`Pick a bigger tier on the Billing page: ${url}`);
    expect(sent(2).text).toContain("Until next month, calls forward to each business's transfer number or its owner's phone.");
    expect(sent(2).text).toContain(`Pick a paid tier, with a bigger pool, on the Billing page: ${url}`);
    expect(sent(3)).toMatchObject({ subject: "You reached your overage cap" });
    expect(sent(3).text).toContain("Your pool's overage for October reached your $50.00 cap.");
    expect(sent(3).text).toContain(`Raise your cap or pick a bigger tier on the Billing page: ${url}`);
    for (let index = 0; index < 4; index++) expect(sent(index).text).not.toContain("Front Desk");
  });

  it("asks the owner to contact the host about a pool the host set, with no tier or overage to pick, in their language", async () => {
    const { provider, sent } = capture();
    for (const locale of ["en", "fr", "es", "sr"]) await send(provider, alert({ locale, kind: "minutes", threshold: "80", used: "400", included: "500", pool: "host", overage: "none", cap: "" }));
    expect(sent(0).subject).toBe("Your businesses used 80% of this month's minutes");
    expect(sent(0).text).toBe(["Hi Ana,", "", "Acme Reception's businesses used 400 of the 500 minutes in your pool for October.", "", "Once the pool runs out, calls will forward to each business's transfer number or its owner's phone until next month.", "", "We set your pool. Contact us to change it.", "", `See this month's usage on the Billing page: ${url}`, "", "LobbyStack"].join("\n"));
    expect(sent(1).text).toContain("Nous fixons votre réserve. Contactez-nous pour la modifier.");
    expect(sent(2).text).toContain("Nosotros fijamos su bolsa. Contáctenos para cambiarla.");
    expect(sent(3).text).toContain("Mi određujemo Vaš fond. Javite nam se da biste ga promenili.");
    for (let index = 0; index < 4; index++) expect(sent(index).text).not.toMatch(/tier|palier|nivel|nivo|overage|dépassement|excedente|prekoračenj/i);
  });

  it("writes every alert in the owner's language", async () => {
    const { provider, sent } = capture();
    const kinds = [["minutes", "80"], ["minutes", "100"], ["chats", "80"], ["chats", "100"], ["cap", "80"], ["cap", "100"]] as const;
    const locales = ["en", "fr", "es", "sr"];
    for (const locale of locales) {
      for (const [kind, threshold] of kinds) await send(provider, alert({ locale, kind, threshold, used: "4", included: "5", overage: "on", cap: "5" }));
    }
    const emails = Array.from({ length: locales.length * kinds.length }, (_, index) => sent(index));
    // Each language and alert gets its own subject.
    expect(new Set(emails.map((email) => email.subject)).size).toBe(emails.length);
    expect(emails.map((email) => email.subject).slice(kinds.length, kinds.length * 2)).toEqual([
      "Vos entreprises ont utilisé 80 % des minutes du mois",
      "Vos entreprises ont utilisé toutes les minutes du mois",
      "Vos entreprises ont utilisé 80 % des clavardages du mois",
      "Vos entreprises ont utilisé tous les clavardages du mois",
      "Vous avez utilisé 80 % de votre plafond de dépassement",
      "Vous avez atteint votre plafond de dépassement",
    ]);
    for (const [index, email] of emails.entries()) {
      const locale = locales[Math.floor(index / kinds.length)]!;
      expect(email.text.startsWith({ en: "Hi Ana,", fr: "Bonjour Ana,", es: "Hola, Ana:", sr: "Zdravo, Ana," }[locale]!)).toBe(true);
      expect(email.text).toContain(url);
      expect(email.text).not.toMatch(/undefined|—/);
    }
  });
});
