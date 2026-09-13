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

test("verification callbacks remain local even with malformed return URLs", async ({ page }) => {
  const appOrigin = new URL(test.info().project.use.baseURL as string).origin;
  const navigationOrigins: string[] = [];
  page.on("request", request => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
      navigationOrigins.push(new URL(request.url()).origin);
    }
  });

  for (const callback of ["https://example.invalid/elsewhere", "//example.invalid/elsewhere", "/\\example.invalid/elsewhere"]) {
    const verification = page.waitForRequest(request => new URL(request.url()).pathname === "/api/auth/verify-email");
    await page.goto(`/verify-email?token=fixture-token&callbackURL=${encodeURIComponent(callback)}`, { waitUntil: "commit" });
    const destination = new URL((await verification).url());
    expect(destination.origin).toBe(appOrigin);
    expect(destination.pathname).toBe("/api/auth/verify-email");
    expect(destination.searchParams.get("token")).toBe("fixture-token");
    expect(destination.searchParams.get("callbackURL")).toBe("/login?verified=true");
    await page.waitForURL(url => url.origin === appOrigin && url.pathname === "/login");
    expect(new URL(page.url()).origin).toBe(appOrigin);
    expect(navigationOrigins.every(origin => origin === appOrigin)).toBe(true);
  }
});
