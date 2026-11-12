import { expect, test, type Page } from "@playwright/test";

import { COOKIE_CONSENT_STORAGE_KEY, COOKIE_CONSENT_VERSION } from "../src/marketing/lib/cookie-consent";
import { migrator, removeFixtures, signUp } from "./fixtures/full-stack";

// The marketing site's navbar asks the dashboard whether the visitor is signed
// in, and offers the dashboard instead of Log in and Try for free when they are.

const app = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:13000";
const site = `http://lobbystack.localhost:${new URL(app).port || "13000"}`;

async function openSite(page: Page, path: string) {
  // Decided already, so the cookie banner stays out of the way.
  await page.addInitScript(([key, value]) => localStorage.setItem(key as string, value as string), [
    COOKIE_CONSENT_STORAGE_KEY,
    JSON.stringify({ analytics: false, decidedAt: "2026-11-01T00:00:00.000Z", version: COOKIE_CONSENT_VERSION }),
  ]);
  const checked = page.waitForResponse((response) => response.url() === `${app}/api/marketing/session`);
  await page.goto(`${site}${path}`);
  return checked;
}

test("a signed-out visitor keeps Log in and Try for free", async ({ page }) => {
  const checked = await openSite(page, "/");
  expect(await checked.json()).toEqual({ signedIn: false });
  const header = page.locator("header.site-header");
  await expect(header.getByRole("link", { name: "Log in" })).toBeVisible();
  await expect(header.getByRole("link", { name: "Try for free" })).toBeVisible();
  await expect(header.getByRole("link", { name: "Dashboard" })).toHaveCount(0);
});

test("a signed-in visitor gets one Dashboard link in their language", async ({ page: signUpPage, context }, testInfo) => {
  test.setTimeout(120_000);
  const database = migrator();
  const { email } = await signUp(signUpPage, testInfo, "marketing-navbar");
  // The signup page sends a test header with every request, which would turn
  // the navbar's plain request into a CORS preflight, so the site gets its own tab.
  const page = await context.newPage();
  try {
    // Production serves the site and the dashboard on sibling hosts of one
    // site (lobbystack.com, app.lobbystack.com), so the browser sends the
    // dashboard's Lax session cookie with the navbar's request. Here they are
    // localhost and lobbystack.localhost, two sites, so the test lets the
    // cookie cross between them as it would in production.
    const cookies = await context.cookies(app);
    const session = cookies.find((cookie) => cookie.name.endsWith("session_token"));
    expect(session).toBeTruthy();
    await context.addCookies([{ ...session!, sameSite: "None", secure: true }]);

    // Where the desktop nav sits, which must not depend on the auth links.
    const navBox = async () => page.locator("header.site-header nav").first().boundingBox();
    const checked = await openSite(page, "/fr/");
    expect(await checked.json()).toEqual({ signedIn: true });

    const header = page.locator("header.site-header");
    const dashboard = header.getByRole("link", { name: "Tableau de bord" }).first();
    await expect(dashboard).toBeVisible();
    await expect(dashboard).toHaveAttribute("href", `${app}/?lng=fr`);
    await expect(header.getByRole("link", { name: "Connexion" })).toHaveCount(0);
    await expect(header.getByRole("link", { name: "Essayer gratuitement" })).toHaveCount(0);
    // The GitHub link sits right beside the Dashboard button, with no room
    // left over for the signed-out links.
    const github = await header.getByRole("link", { name: "LobbyStack sur GitHub" }).first().boundingBox();
    const dashboardBox = await dashboard.boundingBox();
    const gap = dashboardBox!.x - (github!.x + github!.width);
    expect(gap).toBeGreaterThanOrEqual(0);
    expect(gap).toBeLessThan(12);
    const signedInNav = await navBox();

    // The phone menu offers the same single link.
    await page.setViewportSize({ width: 375, height: 812 });
    await header.locator('summary[aria-controls="site-mobile-menu"]').click();
    const menu = page.locator("#site-mobile-menu");
    await expect(menu.getByRole("link", { name: "Tableau de bord" })).toBeVisible();
    await expect(menu.getByRole("link", { name: "Connexion" })).toHaveCount(0);

    await menu.getByRole("link", { name: "Tableau de bord" }).click();
    await expect(page).toHaveURL(new RegExp(`^${app.replaceAll(".", "\\.")}/`));

    // Signed out, the nav stays where it was, so nothing shifts.
    await page.setViewportSize({ width: 1280, height: 800 });
    await context.clearCookies();
    const signedOut = await openSite(page, "/fr/");
    expect(await signedOut.json()).toEqual({ signedIn: false });
    await expect(header.getByRole("link", { name: "Connexion" })).toBeVisible();
    expect(await navBox()).toEqual(signedInNav);
  } finally {
    await removeFixtures(database, { emails: [email], businessIds: [] });
    await database.pool.end();
  }
});
