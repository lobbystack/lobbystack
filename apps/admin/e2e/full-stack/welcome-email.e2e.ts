import { expect, test } from "@playwright/test";
import { eq } from "drizzle-orm";

import { businesses } from "@lobbystack/db";

import dashboard from "../../public/locales/en/dashboard.json" with { type: "json" };
import onboarding from "../../public/locales/en/onboarding.json" with { type: "json" };

import { migrator, removeFixtures, setPlan, signUpOwner, type Migrator } from "../fixtures/full-stack";

// The welcome email, from the last onboarding screen to the owner's inbox
// through a real worker and Mailpit, and its button back to Home with the
// phone step open.

const prefix = "welcome";
const mailpit = process.env.MAILPIT_API_URL;
let database: Migrator;

test.beforeAll(() => { database = migrator(); });
test.afterAll(async () => { await database.pool.end(); });

type MailpitMessage = { ID: string; Subject: string };

async function emailsTo(address: string): Promise<MailpitMessage[]> {
  const response = await fetch(`${mailpit}/api/v1/search?query=${encodeURIComponent(`to:"${address}"`)}`);
  return ((await response.json()) as { messages: MailpitMessage[] }).messages;
}

test("an owner who finishes onboarding gets a welcome email whose button opens the phone step", async ({ page }, testInfo) => {
  test.setTimeout(240_000);
  expect(mailpit, "scripts/e2e-local.sh sets MAILPIT_API_URL").toBeTruthy();
  const emails: string[] = [];
  const businessIds: string[] = [];
  try {
    const owner = await signUpOwner(database, page, testInfo, prefix);
    emails.push(owner.email);
    businessIds.push(owner.businessId);
    await setPlan(database, owner.businessId, "starter");

    // Leaving Meet your agent, the last onboarding screen, finishes onboarding.
    await database.db.update(businesses).set({ onboardingStage: "meet" }).where(eq(businesses.id, owner.businessId));
    await page.goto("/onboarding/meet");
    const finished = page.waitForResponse((response) => response.url().includes("/api/onboarding/stage") && response.request().method() === "POST");
    await page.getByRole("button", { name: onboarding.meet.finish, exact: true }).click();
    expect((await finished).ok()).toBe(true);

    // The worker sends the welcome as soon as onboarding finishes.
    await expect.poll(async () => (await emailsTo(owner.email)).map((email) => email.Subject), { timeout: 60_000 }).toContain("Welcome to LobbyStack");
    const [email] = await emailsTo(owner.email);
    const message = await (await fetch(`${mailpit}/api/v1/message/${email!.ID}`)).json() as { HTML: string; Text: string };
    expect(message.Text).toContain("1. Hear your agent");
    expect(message.Text).toContain("3. Get a phone number");
    const link = /<a href="([^"]+)"[^>]*>Answer my missed calls<\/a>/.exec(message.HTML)?.[1];
    expect(link).toMatch(/\/\?setup=phoneNumber$/);

    // The button lands on Home with the phone step open, ahead of the steps before it.
    await page.goto(`${new URL(link!).pathname}${new URL(link!).search}`);
    await expect(page.getByRole("button", { name: dashboard.setupGuide.stepActions.phoneNumber, exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: dashboard.setupGuide.stepActions.sources, exact: true })).toHaveCount(0);
    await expect(page).toHaveURL(/\/$/);
  } finally {
    await removeFixtures(database, { emails, businessIds });
  }
});
