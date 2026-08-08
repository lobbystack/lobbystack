import { test, expect } from "@playwright/test";

test.describe("auth pages", () => {
  test("login page renders", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading")).toBeVisible();
  });

  test("signup page renders", async ({ page }) => {
    await page.goto("/signup");
    await expect(page.getByRole("heading")).toBeVisible();
  });
});
