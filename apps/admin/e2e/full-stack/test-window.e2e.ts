import { expect, test } from "@playwright/test";
import { eq } from "drizzle-orm";

import { conversations, firstRealConversations, messages } from "@lobbystack/db";

import common from "../../public/locales/en/common.json" with { type: "json" };

import { holdNumber, migrator, removeFixtures, signUpOwner, type Migrator } from "../fixtures/full-stack";
import { startWidgetProvider } from "../fixtures/widget-provider";

// A test chat end to end: the dashboard's window, the route and the fake model.
// The reply reaches the operator and nothing reaches the inbox.

const prefix = "test-window";
let provider: Awaited<ReturnType<typeof startWidgetProvider>>;
let database: Migrator;

test.beforeAll(async () => { provider = await startWidgetProvider(); database = migrator(); });
test.afterAll(async () => {
  await new Promise<void>((resolve, reject) => provider.server.close((error) => error ? reject(error) : resolve()));
  await database.pool.end();
});

test("a test chat gets the agent's reply and leaves no conversation", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const emails: string[] = [];
  const businessIds: string[] = [];
  try {
    const owner = await signUpOwner(database, page, testInfo, prefix);
    emails.push(owner.email);
    businessIds.push(owner.businessId);
    // Home's Test call sits on its phone card, which needs a number.
    await holdNumber(database, owner.businessId, { carrier: "twilio" });
    await page.goto("/");
    await page.getByRole("button", { name: common.testCall.trigger, exact: true }).first().click();
    const window = page.getByRole("dialog");
    const box = window.getByRole("textbox", { name: common.testWindow.message });
    await box.fill("When are you open?");
    await box.press("Enter");
    await expect(window.getByText("We are open weekdays.")).toBeVisible();

    const rows = async (table: typeof conversations | typeof messages | typeof firstRealConversations) => await database.db.select().from(table).where(eq(table.businessId, owner.businessId));
    expect(await rows(conversations)).toHaveLength(0);
    expect(await rows(messages)).toHaveLength(0);
    expect(await rows(firstRealConversations)).toHaveLength(0);
  } finally {
    await removeFixtures(database, { emails, businessIds });
  }
});
