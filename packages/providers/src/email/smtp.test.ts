import { afterEach, describe, expect, it, vi } from "vitest";
import { emailSender, hostBrand, resolveBrandLinks, type Brand } from "@lobbystack/shared";

import hostEmails from "./__fixtures__/host-emails.json";
import { SmtpEmailProvider } from "./smtp";

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
    expect(sent(0).text).toBe("You have been invited to join LobbyStack. Accept the invitation here: http://localhost/accept-invite?token=a%2Fb");
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
      subject: "Bright Desk notification",
      text: "You have been invited to join Bright Desk. Accept the invitation here: https://bright.example.test/accept-invite?token=t",
    });
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
  it("blocks unapproved certification recipients before SMTP delivery", async () => {
    vi.stubEnv("LOBBYSTACK_CERTIFICATION_MODE", "true");
    vi.stubEnv("LOBBYSTACK_CERTIFICATION_EMAILS", "approved@example.invalid");
    const { provider, sendMail } = capture();
    await expect(provider.sendTemplate({ brand, template: "operator_alert", to: "other@example.invalid", subject: "Test", variables: {} })).rejects.toThrow("CERTIFICATION_RECIPIENT_BLOCKED");
    expect(sendMail).not.toHaveBeenCalled();
    await provider.sendTemplate({ brand, template: "operator_alert", to: "approved@example.invalid", subject: "Test", variables: {} });
    expect(sendMail).toHaveBeenCalledOnce();
  });
  it("sends the onboarding follow-up as plain text from the founder, with replies going to the founder", async () => {
    const { provider, sent } = capture();
    await send(provider, { template: "onboarding_followup", to: "owner@example.test", from: "Raphael <raphael@example.test>", subject: "How'd you like LobbyStack?", variables: { locale: "en", firstName: "Sam", businessName: "Acme Dental", senderName: "Raphael" } });
    expect(sent(0).from).toBe("Raphael <raphael@example.test>");
    expect(sent(0).replyTo).toBeUndefined();
    expect(sent(0).html).toBeUndefined();
    expect(sent(0).text).toMatch(/^Hi Sam,\n/);
    expect(sent(0).text).toContain("I'm Raphael, the founder of LobbyStack. You set up a receptionist for Acme Dental yesterday.");
    expect(sent(0).text).toContain("3. Do you plan to use it for real, with your own phone number?");
    expect(sent(0).text).toContain("You can reply to this email, and two lines would be plenty!\n\nThanks again,\nRaphael\nFounder, LobbyStack");
    await send(provider, { template: "onboarding_followup", to: "owner@example.test", subject: "Qu'avez-vous pensé de LobbyStack ?", variables: { locale: "fr", firstName: "", businessName: "Clinique", senderName: "Raphael" } });
    expect(sent(1).from).toBe("no-reply@example.test");
    expect(sent(1).replyTo).toBe("support@example.test");
    expect(sent(1).text).toMatch(/^Bonjour,\n/);
    expect(sent(1).text).toContain("une réceptionniste pour Clinique hier");
  });
  it("invites an owner a platform key named to make their account at the sign-up page", async () => {
    const { provider, sendMail } = capture();
    await send(provider, { template: "account_setup", to: "owner@example.test", variables: { locale: "en", email: "owner@example.test", url: "https://app.example.test/en/signup" } });
    await send(provider, { template: "account_setup", to: "owner@example.test", variables: { locale: "fr", email: "owner@example.test", url: "https://app.example.test/fr/signup" } });
    const [english, french] = sendMail.mock.calls.map((call) => call[0].text as string);
    expect(english).toBe("You were invited to make a LobbyStack account with owner@example.test. Make it here, with this address: https://app.example.test/en/signup. If you weren't expecting this, ignore this email.");
    expect(french).toContain("Créez-le ici, avec cette adresse : https://app.example.test/fr/signup");
  });

  it("localizes the onboarding follow-up and existing-account emails in Spanish and Serbian", async () => {
    const { provider, sendMail } = capture();
    await send(provider, { template: "onboarding_followup", to: "owner@example.test", subject: "¿Qué le pareció LobbyStack?", variables: { locale: "es", firstName: "Ana", businessName: "Clínica Sol", senderName: "Raphael" } });
    await send(provider, { template: "onboarding_followup", to: "owner@example.test", subject: "Kako Vam se dopao LobbyStack?", variables: { locale: "sr", firstName: "", businessName: "Ordinacija Javor", senderName: "Raphael" } });
    await send(provider, { template: "existing_account", to: "owner@example.test", variables: { locale: "es", signInUrl: "https://app.example.test/es/login", resetUrl: "https://app.example.test/es/forgot-password" } });
    await send(provider, { template: "existing_account", to: "owner@example.test", variables: { locale: "sr", signInUrl: "https://app.example.test/sr/login", resetUrl: "https://app.example.test/sr/forgot-password" } });
    const [spanish, serbian, spanishAccount, serbianAccount] = sendMail.mock.calls.map((call) => call[0].text as string);
    expect(spanish).toMatch(/^Hola, Ana:\n/);
    expect(spanish).toContain("una recepcionista para Clínica Sol");
    expect(serbian).toMatch(/^Zdravo,\n/);
    expect(serbian).toContain("recepcionera za Ordinacija Javor");
    expect(serbian).not.toMatch(/[Ѐ-ӿ]/);
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
    expect(sent(1).html).toBeUndefined();
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
