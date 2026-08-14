import { expect, test } from "@playwright/test";

test("login and signup pages expose accessible auth forms", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await expect(page.getByLabel("LobbyStack")).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
  await expect(page.getByRole("link", { name: "Create one" })).toHaveAttribute("href", "/signup");
  await expect(page.getByRole("button", { name: "Sign in" })).toHaveCSS("border-radius", "26px");

  await page.goto("/signup");
  await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
});

test("auth layout preserves the original mobile composition", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/login");

  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  const submitBox = await page.getByRole("button", { name: "Sign in" }).boundingBox();
  expect(submitBox?.width ?? 0).toBeGreaterThan(300);
  await expect(page.getByRole("contentinfo")).toContainText("Terms");
  await expect(page.getByRole("contentinfo")).toContainText("Privacy");
});
