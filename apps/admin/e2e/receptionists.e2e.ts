import { expect, test } from "@playwright/test";

import { navigationScreenshot, removeNavigationOperator, seedNavigationActivity, seedNavigationOperator, signInNavigationOperator, type NavigationOperator } from "./fixtures/navigation-operator";

// Several receptionists end to end: turning staff on, the Calendar, creating
// a receptionist, routing a number to it, filtering the Inbox, and deleting
// a receptionist with its number moving back. Set NAV_SCREENSHOT_DIR to keep
// light and dark screenshots of the Inbox and the Calendar.

const databaseUrl = process.env.REPLACEMENT_E2E_DATABASE_URL;
const operators: NavigationOperator[] = [];

test.describe.configure({ mode: "serial", timeout: 120_000 });
test.afterAll(async () => { for (const operator of operators) await removeNavigationOperator(databaseUrl, operator); });

test("turning staff on shows Staff and one Calendar column per person", async ({ browser, baseURL }) => {
  const operator = await seedNavigationOperator({ databaseUrl, businessName: "Staff Dental" });
  operators.push(operator);
  await seedNavigationActivity(databaseUrl, operator, { callAgentId: operator.receptionistIds[0]!, chatAgentId: operator.receptionistIds[0]!, textAgentId: operator.receptionistIds[0]! });
  const page = await signInNavigationOperator(browser, baseURL, operator);
  const sidebar = page.locator('[data-slot="sidebar"]').first();

  await page.goto(`${baseURL}/calendar`);
  await expect(page.getByTestId("calendar-grid")).toHaveAttribute("data-columns", "days");
  await expect(page.getByTestId("calendar-appointment")).toHaveCount(1);
  await expect(sidebar.getByRole("link", { name: "Staff" })).toHaveCount(0);

  await sidebar.getByRole("link", { name: "Settings" }).click();
  await page.getByRole("link", { name: "Team" }).click();
  await page.getByTestId("staff-settings").getByRole("switch").click();
  await expect(page.getByText("Staff turned on.")).toBeVisible();
  await expect(sidebar.getByRole("link", { name: "Staff" })).toBeVisible();

  await sidebar.getByRole("link", { name: "Staff" }).click();
  await page.getByPlaceholder("Add a team member, for example Dr. Lee").fill("Dr. Lee");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByTestId("staff-list")).toContainText("Dr. Lee");

  await sidebar.getByRole("link", { name: "Calendar" }).click();
  await expect(page.getByTestId("calendar-grid")).toHaveAttribute("data-columns", "staff");
  await expect(page.getByTestId("calendar-column")).toHaveCount(2);
  await expect(page.getByTestId("calendar-appointment")).toContainText("Cleaning");
  await navigationScreenshot(page, "calendar-light");
  await page.getByRole("button", { name: "Week" }).click();
  await expect(page).toHaveURL(/view=week/);
  await expect(page.getByTestId("calendar-column")).toHaveCount(7);
  await page.context().close();
});

test("a second receptionist gets a number, its own Inbox filter, and can be deleted", async ({ browser, baseURL }) => {
  const operator = await seedNavigationOperator({ databaseUrl, businessName: "Two Desk Clinic" });
  operators.push(operator);
  const page = await signInNavigationOperator(browser, baseURL, operator);
  const sidebar = page.locator('[data-slot="sidebar"]').first();
  await page.goto(`${baseURL}/`);

  // One receptionist: no Inbox receptionist filter, no list.
  await sidebar.getByRole("link", { name: "Inbox" }).click();
  await expect(page.getByRole("combobox", { name: "Receptionist", exact: true })).toHaveCount(0);

  await sidebar.getByRole("link", { name: "New receptionist" }).click();
  await page.getByLabel("Name").fill("After hours");
  await page.getByRole("button", { name: "Create receptionist" }).click();
  await expect(page.getByText("After hours created")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("After hours");
  await expect(page.getByRole("combobox", { name: "Switch receptionist" })).toBeVisible();
  const nightId = new URL(page.url()).pathname.split("/")[2]!;
  const frontId = operator.receptionistIds[0]!;

  // Route the phone number to the new receptionist, confirming the change.
  await page.getByRole("link", { name: "Back to Two Desk Clinic" }).click();
  await expect(page.getByTestId("drill-down-back")).toHaveCount(0);
  await sidebar.getByRole("link", { name: "Numbers and widget" }).click();
  const routing = page.getByTestId("routing-section");
  await routing.getByRole("combobox").first().selectOption({ label: "After hours" });
  await expect(page.getByRole("alertdialog")).toContainText("will go to After hours instead of Receptionist");
  await page.getByRole("button", { name: "Change", exact: true }).click();
  await expect(page.getByText(/After hours now answers/)).toBeVisible();

  await page.goto(`${baseURL}/receptionists/${nightId}/numbers`);
  await expect(page.getByText("Calls and texts to this number")).toBeVisible();

  // The Inbox filters by channel and by receptionist.
  await seedNavigationActivity(databaseUrl, operator, { callAgentId: nightId, chatAgentId: frontId, textAgentId: nightId });
  await page.goto(`${baseURL}/inbox`);
  const list = page.getByTestId("inbox-list");
  await expect(list.locator("button")).toHaveCount(3);
  await navigationScreenshot(page, "inbox-light");
  await page.getByRole("combobox", { name: "Receptionist", exact: true }).selectOption({ label: "After hours" });
  await expect(list.locator("button")).toHaveCount(2);
  await page.getByRole("button", { name: "Texts" }).click();
  await expect(list.locator("button")).toHaveCount(1);
  await list.locator("button").first().click();
  await expect(page.getByTestId("inbox-thread")).toContainText("Running ten minutes late");
  await page.getByRole("button", { name: "All", exact: true }).click();
  await page.getByRole("combobox", { name: "Receptionist", exact: true }).selectOption({ label: "All receptionists" });
  await expect(list.locator("button")).toHaveCount(3);

  // Deleting names what moves and where, and the number moves back.
  await page.goto(`${baseURL}/receptionists/${nightId}`);
  await page.getByRole("button", { name: "Delete After hours" }).click();
  await expect(page.getByTestId("delete-moves")).toBeVisible();
  await expect(page.getByRole("alertdialog")).toContainText("moves to Receptionist");
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete After hours" }).click();
  await expect(page.getByText("After hours deleted")).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/receptionists/${frontId}$`));
  await expect(page.getByRole("combobox", { name: "Switch receptionist" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Delete/ })).toHaveCount(0);
  await page.goto(`${baseURL}/receptionists/${frontId}/numbers`);
  await expect(page.getByText("Calls and texts to this number")).toBeVisible();
  await page.context().close();
});

test("the Inbox and Calendar in dark mode and in French", async ({ browser, baseURL }) => {
  const operator = await seedNavigationOperator({ databaseUrl, businessName: "Clinique Soir", locale: "fr", receptionists: ["Soirs"] });
  operators.push(operator);
  await seedNavigationActivity(databaseUrl, operator, { callAgentId: operator.receptionistIds[1]!, chatAgentId: operator.receptionistIds[0]!, textAgentId: operator.receptionistIds[1]! });
  const dark = await signInNavigationOperator(browser, baseURL, operator, { colorScheme: "dark" });
  await dark.goto(`${baseURL}/inbox`);
  await expect(dark.getByTestId("inbox-list").locator("button")).toHaveCount(3);
  await navigationScreenshot(dark, "inbox-dark");
  await dark.goto(`${baseURL}/calendar`);
  await expect(dark.getByTestId("calendar-appointment")).toHaveCount(1);
  await navigationScreenshot(dark, "calendar-dark");
  await dark.context().close();

  const french = await signInNavigationOperator(browser, baseURL, operator, { locale: "fr-CA" });
  await french.goto(`${baseURL}/inbox`);
  await expect(french.getByRole("button", { name: "Textos" })).toBeVisible();
  await expect(french.getByRole("combobox", { name: "Réceptionniste", exact: true })).toBeVisible();
  await french.goto(`${baseURL}/calendar?view=week`);
  await expect(french.getByRole("button", { name: "Semaine" })).toHaveAttribute("aria-pressed", "true");
  await french.context().close();
});
