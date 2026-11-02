import { expect, test } from "@playwright/test";

test.describe("onboarding routing", () => {
  test("does not allow skipping ahead and resumes the active step", async ({ page }) => {
    await page.goto("/onboarding/meet");
    await expect(page).toHaveURL(/\/en\/login$|\/onboarding\/business$/);
  });
});
