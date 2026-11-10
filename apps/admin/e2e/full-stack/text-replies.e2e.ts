import { expect, test, type APIRequestContext } from "@playwright/test";
import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { and, eq } from "drizzle-orm";

import { businesses, outboxMessages } from "@lobbystack/db";

import inboxCopy from "../../public/locales/en/inbox.json" with { type: "json" };
import messagesCopy from "../../public/locales/en/messages.json" with { type: "json" };

import { holdNumber, migrator, randomE164, removeFixtures, setPlan, signUpOwner, twilioPhoneSid, twilioSignature, type Migrator } from "../fixtures/full-stack";
import { startThirdParties, type ThirdParties } from "../fixtures/third-parties";
import { startWidgetProvider } from "../fixtures/widget-provider";

// AI text replies end to end: a signed Twilio webhook brings the text in, the
// worker answers with the fake model, and the fake Twilio takes the send. The
// flag has no dashboard switch: the host's command is the only way to turn it on.

const prefix = "text-replies";
const repoRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../../..");
const run = promisify(execFile);
let thirdParties: ThirdParties;
let provider: Awaited<ReturnType<typeof startWidgetProvider>>;
let database: Migrator;

test.beforeAll(async () => { thirdParties = await startThirdParties(); provider = await startWidgetProvider(); database = migrator(); });
test.afterAll(async () => {
  await thirdParties.close();
  await new Promise<void>((resolve, reject) => provider.server.close((error) => error ? reject(error) : resolve()));
  await database.pool.end();
});

async function inboundText(request: APIRequestContext, baseURL: string, input: { from: string; to: string; body: string }): Promise<void> {
  const params = { MessageSid: `SM${randomBytes(16).toString("hex")}`, From: input.from, To: input.to, Body: input.body };
  const response = await request.post("/api/webhooks/twilio/sms", { headers: { "x-twilio-signature": twilioSignature(`${baseURL}/api/webhooks/twilio/sms`, params) }, form: params });
  expect(response.ok()).toBe(true);
}

test("text replies stay off by default, and an enabled business's inbound text gets a reply in the inbox", async ({ page, request, baseURL }, testInfo) => {
  test.setTimeout(180_000);
  const emails: string[] = [];
  const businessIds: string[] = [];
  try {
    const owner = await signUpOwner(database, page, testInfo, prefix);
    emails.push(owner.email);
    businessIds.push(owner.businessId);
    await setPlan(database, owner.businessId, "starter");
    const number = await holdNumber(database, owner.businessId, { carrier: "twilio", providerPhoneId: twilioPhoneSid() });
    const customer = randomE164();
    // The list previews a conversation's newest message.
    const openThread = async (preview: string) => {
      await page.goto("/inbox");
      await page.getByRole("button", { name: inboxCopy.filters.channels.sms, exact: true }).click();
      await page.getByText(preview).first().click();
    };

    // Off by default: the text reaches the team, and no reply is queued or sent.
    const flag = async () => (await database.db.select({ on: businesses.textRepliesEnabled }).from(businesses).where(eq(businesses.id, owner.businessId)))[0]?.on;
    expect(await flag()).toBe(false);
    await inboundText(request, baseURL!, { from: customer, to: number.e164, body: "What are your opening hours?" });
    await openThread("What are your opening hours?");
    await expect(page.getByText("What are your opening hours?").last()).toBeVisible();
    await expect(page.getByRole("button", { name: messagesCopy.page.takeOver, exact: true })).toHaveCount(0);
    expect(await database.db.select({ id: outboxMessages.id }).from(outboxMessages).where(and(eq(outboxMessages.businessId, owner.businessId), eq(outboxMessages.topic, "sms.aiReply")))).toEqual([]);
    expect(thirdParties.carrier.messagesTo(customer)).toEqual([]);

    // The host turns it on with the same command a deployment uses.
    await run("pnpm", ["text-replies:set", "--business", owner.businessId, "--on"], { cwd: repoRoot, env: { ...process.env, LOBBYSTACK_SKIP_ENV_FILES: "true", DATABASE_URL: process.env.REPLACEMENT_E2E_DATABASE_URL!, LOBBYSTACK_MIGRATOR_DATABASE_URL: process.env.REPLACEMENT_E2E_DATABASE_URL! } });
    expect(await flag()).toBe(true);

    await inboundText(request, baseURL!, { from: customer, to: number.e164, body: "Are you open on weekends?" });
    const reply = `Automated assistant for ${owner.businessName}. Reply STOP to opt out. We are open weekdays.`;
    await expect.poll(() => thirdParties.carrier.messagesTo(customer).map((call) => call.form.Body), { timeout: 45_000 }).toEqual([reply]);
    expect(provider.requests.length).toBeGreaterThan(0);

    await openThread(reply);
    await expect(page.getByText(reply, { exact: true }).last()).toBeVisible();
    await expect(page.getByText("Are you open on weekends?", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: messagesCopy.page.takeOver, exact: true })).toBeVisible();
  } finally {
    await removeFixtures(database, { emails, businessIds });
  }
});
