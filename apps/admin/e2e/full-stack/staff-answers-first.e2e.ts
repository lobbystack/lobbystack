import { expect, test, type APIRequestContext } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";

import { agents, calls } from "@lobbystack/db";

import agent from "../../public/locales/en/agent.json" with { type: "json" };
import callsCopy from "../../public/locales/en/calls.json" with { type: "json" };

import { holdNumber, migrator, randomE164, removeFixtures, setPlan, signUpOwner, twilioPhoneSid, twilioSignature, type Migrator } from "../fixtures/full-stack";
import { startThirdParties, type ThirdParties } from "../fixtures/third-parties";

// The dashboard side of staff answers first, against a real worker and a fake
// Twilio. The call itself has no browser surface, so these signed webhooks stand
// in for Twilio at the point it reports a staff member took the call.

const prefix = "staff-first";
const staffPhone = "+14165550177";
let thirdParties: ThirdParties;
let database: Migrator;

test.beforeAll(async () => { thirdParties = await startThirdParties(); database = migrator(); });
test.afterAll(async () => { await thirdParties.close(); await database.pool.end(); });

async function signedPost(request: APIRequestContext, baseURL: string, path: string, params: Record<string, string>) {
  return await request.post(path, { headers: { "x-twilio-signature": twilioSignature(`${baseURL}${path}`, params) }, form: params });
}

test("an owner on a paid plan sets up staff answers first, it persists, and a call a staff member took reads as theirs", async ({ page, request, baseURL }, testInfo) => {
  test.setTimeout(180_000);
  const emails: string[] = [];
  const businessIds: string[] = [];
  try {
    const owner = await signUpOwner(database, page, testInfo, prefix);
    emails.push(owner.email);
    businessIds.push(owner.businessId);
    await setPlan(database, owner.businessId, "starter");
    const providerPhoneId = twilioPhoneSid();
    const number = await holdNumber(database, owner.businessId, { carrier: "twilio", providerPhoneId });
    thirdParties.carrier.addNumber({ sid: providerPhoneId, e164: number.e164 });

    await page.goto("/agents/primary");
    const section = page.locator(`#staff-first`);
    await expect(section).toContainText(agent.staffFirst.mode.options.never);
    const setUp = section.getByRole("button", { name: agent.staffFirst.setUp, exact: true });
    await expect(setUp).toBeEnabled();
    await setUp.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText(agent.staffFirst.mode.hint, { exact: true })).toBeVisible();
    await dialog.getByRole("combobox", { name: agent.staffFirst.mode.when, exact: true }).click();
    await page.getByRole("option", { name: agent.staffFirst.mode.options.always, exact: true }).click();

    // The phone is required once the mode is on.
    const save = dialog.getByRole("button", { name: agent.staffFirst.save, exact: true });
    await save.click();
    await expect(dialog.getByText(agent.staffFirst.errors.numberRequired, { exact: true })).toBeVisible();

    await dialog.getByLabel(agent.staffFirst.number.label, { exact: true }).pressSequentially(staffPhone);
    await dialog.getByLabel(agent.staffFirst.message.label, { exact: true }).fill("Thanks for calling. One moment.");
    const saved = page.waitForResponse((response) => /\/api\/agents\/[0-9a-f-]{36}\?/.test(response.url()) && response.request().method() === "PATCH");
    await save.click();
    expect((await saved).ok()).toBe(true);
    await expect(dialog).toHaveCount(0);
    const state = agent.staffFirst.state.replace("{{mode}}", agent.staffFirst.mode.options.always).replace("{{number}}", "(416) 555-0177");
    await expect(section).toContainText(state);

    await page.reload();
    await expect(section).toContainText(state);
    await section.getByRole("button", { name: agent.actions.edit, exact: true }).click();
    await expect(dialog.getByRole("combobox", { name: agent.staffFirst.mode.when, exact: true })).toContainText(agent.staffFirst.mode.options.always);
    await expect(dialog.getByLabel(agent.staffFirst.number.label, { exact: true })).toHaveValue(/416.*555.*0177/);
    await expect(dialog.getByLabel(agent.staffFirst.message.label, { exact: true })).toHaveValue("Thanks for calling. One moment.");
    await dialog.getByRole("button", { name: agent.actions.cancel, exact: true }).click();
    await expect(dialog).toHaveCount(0);
    const [profile] = await database.db.select({ mode: agents.staffFirstMode, number: agents.staffFirstNumber }).from(agents).where(eq(agents.businessId, owner.businessId));
    expect(profile).toEqual({ mode: "always", number: staffPhone });

    // Saving moves the number off the trunk and onto the staff-first webhook.
    await expect.poll(() => thirdParties.carrier.calls.find((call) => call.path.includes(`/IncomingPhoneNumbers/${providerPhoneId}.json`) && call.method === "POST")?.form.VoiceUrl, { timeout: 30_000 }).toContain("/api/webhooks/twilio/staff-first/incoming");

    // Twilio reports a staff member took the call, then sends the number's status callback.
    const callSid = `CA${randomBytes(16).toString("hex")}`;
    const caller = randomE164();
    const staffResult = `/api/webhooks/twilio/staff-first/staff-result?business=${owner.businessId}&called=${encodeURIComponent(number.e164)}`;
    const accepted = { CallSid: callSid, From: caller, To: number.e164, CallStatus: "in-progress", DialBridged: "true", DialCallStatus: "completed", DialCallDuration: "42" };
    expect((await signedPost(request, baseURL!, staffResult, accepted)).ok()).toBe(true);
    const status = await signedPost(request, baseURL!, "/api/webhooks/twilio/status", { CallSid: callSid, CallStatus: "completed", To: number.e164, Called: number.e164, From: caller, CallDuration: "55" });
    expect(status.status()).toBe(200);
    const row = async () => (await database.db.select({ status: calls.status, disposition: calls.disposition, seconds: calls.providerDurationSeconds, reportedAt: calls.providerUpdatedAt }).from(calls).where(and(eq(calls.businessId, owner.businessId), eq(calls.providerCallId, callSid))))[0];
    expect(await row()).toMatchObject({ status: "completed", disposition: "answered_by_team", seconds: 42, reportedAt: expect.any(Date) });

    await page.goto("/inbox?channel=phone_call");
    await expect(page.getByText(callsCopy.outcome.answeredByTeam, { exact: true }).first()).toBeVisible();
  } finally {
    await removeFixtures(database, { emails, businessIds });
  }
});

test("a Free business and a Telnyx number see staff answers first as unavailable", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const emails: string[] = [];
  const businessIds: string[] = [];
  try {
    const owner = await signUpOwner(database, page, testInfo, `${prefix}-blocked`);
    emails.push(owner.email);
    businessIds.push(owner.businessId);
    const setUp = page.locator("#staff-first").getByRole("button", { name: agent.staffFirst.setUp, exact: true });

    await setPlan(database, owner.businessId, "free_cloud");
    await page.goto("/agents/primary");
    await expect(page.getByText(agent.staffFirst.unavailable.plan, { exact: true })).toBeVisible();
    await expect(setUp).toBeDisabled();

    await setPlan(database, owner.businessId, "starter");
    await holdNumber(database, owner.businessId, { carrier: "telnyx", providerPhoneId: `telnyx-${randomBytes(8).toString("hex")}` });
    await page.reload();
    await expect(page.getByText(agent.staffFirst.unavailable.carrier, { exact: true })).toBeVisible();
    await expect(setUp).toBeDisabled();
  } finally {
    await removeFixtures(database, { emails, businessIds });
  }
});
