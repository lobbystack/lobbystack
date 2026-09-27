import { expect, test } from "@playwright/test";

import { navigationScreenshot as shot, removeNavigationOperator, seedNavigationOperator, signInNavigationOperator as signIn, type NavigationOperator } from "./fixtures/navigation-operator";

// The business sidebar, the receptionist drill-down, the command search and
// the old-URL redirects behind the new_navigation flag. Set
// NAV_SCREENSHOT_DIR to keep light and dark screenshots of each view.

const databaseUrl = process.env.REPLACEMENT_E2E_DATABASE_URL;
const operators: NavigationOperator[] = [];

test.describe.configure({ mode: "serial", timeout: 120_000 });
test.afterAll(async () => { for (const operator of operators) await removeNavigationOperator(databaseUrl, operator); });

async function seed(input: Parameters<typeof seedNavigationOperator>[0]) {
  const operator = await seedNavigationOperator(input);
  operators.push(operator);
  return operator;
}

test("a single-receptionist owner gets one Receptionist link and a drill-down", async ({ browser, baseURL }) => {
  const operator = await seed({ databaseUrl, businessName: "Maple Dental" });
  const [agentId] = operator.receptionistIds;
  const page = await signIn(browser, baseURL, operator);
  await page.goto(`${baseURL}/`);

  const sidebar = page.locator('[data-slot="sidebar"]').first();
  await expect(sidebar.getByRole("link", { name: "Inbox" })).toBeVisible();
  await expect(sidebar.getByRole("link", { name: "Calendar" })).toBeVisible();
  await expect(sidebar.getByText("Receptionists", { exact: true })).toHaveCount(0);
  await expect(sidebar.getByRole("link", { name: "Staff" })).toHaveCount(0);
  await shot(page, "business-sidebar-light");

  // Daily pages are one click away.
  await sidebar.getByRole("link", { name: "Calendar" }).click();
  await expect(page).toHaveURL(/\/calendar$/);

  await sidebar.getByRole("link", { name: "Receptionist", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/receptionists/${agentId}$`));
  await expect(page.getByTestId("drill-down-back")).toHaveText("Maple Dental");
  await expect(page.getByTestId("receptionist-scope")).toContainText("Receptionist");
  await expect(page.getByRole("combobox", { name: "Switch receptionist" })).toHaveCount(0);

  await page.getByRole("link", { name: "Behavior" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Receptionist · Behavior");
  await page.getByLabel("Greeting").fill("Hi, you reached Maple Dental.");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Changes saved")).toBeVisible();
  await shot(page, "drill-down-light");

  // Back returns to the business page the owner came from.
  await page.getByRole("link", { name: "Back to Maple Dental" }).click();
  await expect(page).toHaveURL(/\/calendar$/);
  await expect(page.locator('[data-slot="sidebar"]').first().getByRole("link", { name: "Inbox" })).toBeVisible();
  await page.context().close();
});

test("old URLs land on their new pages", async ({ browser, baseURL }) => {
  const operator = await seed({ databaseUrl, businessName: "Redirect Dental" });
  const [agentId] = operator.receptionistIds;
  const page = await signIn(browser, baseURL, operator);
  const cases: Array<[string, RegExp]> = [
    ["/agent", new RegExp(`/receptionists/${agentId}/behavior$`)],
    ["/agent/rules", new RegExp(`/receptionists/${agentId}/transfers$`)],
    ["/agent/knowledge", /\/knowledge$/],
    ["/agent/services", /\/services$/],
    ["/calls", /\/inbox\?channel=calls$/],
    ["/messages", /\/inbox\?channel=chats$/],
    ["/appointments", /\/calendar$/],
    ["/settings/phone-number", /\/numbers$/],
  ];
  for (const [from, to] of cases) {
    await page.goto(`${baseURL}${from}`);
    await expect(page).toHaveURL(to);
  }
  await page.context().close();
});

test("with the flag off the old navigation stays and new URLs go back to it", async ({ browser, baseURL }) => {
  const operator = await seed({ databaseUrl, businessName: "Legacy Dental", newNavigation: false });
  const page = await signIn(browser, baseURL, operator);
  await page.goto(`${baseURL}/agent/rules`);
  await expect(page).toHaveURL(/\/agent\/rules$/);
  await page.goto(`${baseURL}/inbox`);
  await expect(page).toHaveURL(/\/calls$/);
  await expect(page.locator('[data-slot="sidebar"]').first().getByRole("link", { name: "Calendar" })).toHaveCount(0);
  await page.context().close();
});

test("several receptionists get a list, a switcher that keeps the page, and command search", async ({ browser, baseURL }) => {
  const operator = await seed({ databaseUrl, businessName: "Northside Clinic", receptionists: ["After hours"] });
  const [frontId, nightId] = operator.receptionistIds;
  const page = await signIn(browser, baseURL, operator, { colorScheme: "dark" });
  await page.goto(`${baseURL}/`);
  const sidebar = page.locator('[data-slot="sidebar"]').first();
  await expect(sidebar.getByText("Receptionists", { exact: true })).toBeVisible();
  await expect(sidebar.getByRole("link", { name: "After hours" })).toBeVisible();
  await shot(page, "business-sidebar-dark");

  await page.goto(`${baseURL}/receptionists/${frontId}/booking`);
  await page.getByRole("combobox", { name: "Switch receptionist" }).click();
  await page.getByRole("option", { name: /After hours/ }).click();
  await expect(page).toHaveURL(new RegExp(`/receptionists/${nightId}/booking$`));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("After hours · Booking");
  await shot(page, "drill-down-dark");

  // Shared items say who uses them before an edit.
  await page.getByRole("switch", { name: "Whitening" }).click();
  await expect(page.getByText("Whitening is off for this receptionist")).toBeVisible();
  await page.goto(`${baseURL}/services`);
  await expect(page.getByTestId("shared-usage-notice")).toContainText("After hours doesn't use Whitening.");

  await page.keyboard.press("ControlOrMeta+k");
  await page.getByPlaceholder("Search pages and receptionists").fill("after hours transfers");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/receptionists/${nightId}/transfers$`));
  await page.context().close();
});

test("the navigation speaks French", async ({ browser, baseURL }) => {
  const operator = await seed({ databaseUrl, businessName: "Clinique Laval", locale: "fr" });
  const page = await signIn(browser, baseURL, operator, { locale: "fr-CA" });
  await page.goto(`${baseURL}/`);
  const sidebar = page.locator('[data-slot="sidebar"]').first();
  await expect(sidebar.getByRole("link", { name: "Boîte de réception" })).toBeVisible();
  await expect(sidebar.getByRole("link", { name: "Calendrier" })).toBeVisible();
  await expect(sidebar.getByRole("link", { name: "Numéros et widget" })).toBeVisible();
  await sidebar.getByRole("link", { name: "Réceptionniste", exact: true }).click();
  await expect(page.getByRole("link", { name: "Transferts et règles" })).toBeVisible();
  await page.context().close();
});
