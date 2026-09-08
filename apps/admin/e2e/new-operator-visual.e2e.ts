import { expect, test } from "@playwright/test";
import enCommon from "../public/locales/en/common.json" with { type: "json" };
import frCommon from "../public/locales/fr/common.json" with { type: "json" };
import enDemos from "../public/locales/en/demos.json" with { type: "json" };
import frDemos from "../public/locales/fr/demos.json" with { type: "json" };

const viewports = [{ name: "desktop", width: 1440, height: 1000 }, { name: "mobile", width: 390, height: 844 }];
for (const route of ["appointments", "demos"] as const) for (const state of ["empty", "populated", "loading", "error"] as const) for (const locale of ["en", "fr"] as const) for (const theme of ["light", "dark"] as const) for (const viewport of viewports) {
  test(`${route} ${state} ${locale} ${theme} ${viewport.name}`, async ({ browser }) => {
    const storageState = process.env[`PARITY_PORT_OPERATOR_STORAGE_STATE_${locale.toUpperCase()}`];
    test.skip(!storageState || !process.env.OPERATOR_BASELINE_BASE_URL, "Requires disposable operator fixtures and an explicit local baseline target.");
    const context = await browser.newContext({ storageState: storageState!, viewport, locale, colorScheme: theme, timezoneId: "America/Toronto" });
    try {
      await context.addInitScript(({ locale, theme }) => { localStorage.setItem("lobbystack.locale", locale); localStorage.setItem("theme", theme); }, { locale, theme });
      await context.route(route === "demos" ? "**/api/demos" : "**/api/appointments?*", async request => {
        if (state === "loading") return;
        if (state === "error") { await request.fulfill({ status: 503, json: { error: "Fixture unavailable" } }); return; }
        const appointment = { id: "fixture-appointment", startsAt: "2026-09-06T12:00:00Z", endsAt: "2026-09-06T12:30:00Z", timezone: "UTC", status: "confirmed", sourceChannel: "voice", calendarSyncState: "synced", contactName: "Alex Martin", serviceName: "Consultation", staffName: "Sam Lee" };
        const demo = { demoId: "fixture-demo", businessName: "Acme Dental", businessSlug: "acme-dental", websiteUrl: "https://example.invalid", status: "preparing", suggestedPrompts: ["Hours?", "Services?"], expiresAt: "2026-09-30T12:00:00Z", websiteIngestionStatus: "completed", greetingReady: true, snapshotReady: true, promptsReady: true };
        await request.fulfill({ json: route === "demos" ? { demos: state === "populated" ? [demo] : [] } : { appointments: state === "populated" ? [appointment] : [] } });
      });
      const page = await context.newPage();
      await page.goto(`${process.env.OPERATOR_BASELINE_BASE_URL}/${route}`, { waitUntil: "domcontentloaded" });
      const common = locale === "fr" ? frCommon : enCommon;
      const demos = locale === "fr" ? frDemos : enDemos;
      await expect(page.getByRole("heading", { name: route === "demos" ? demos.operator.title : common.appointments.title })).toBeVisible();
      const expected = route === "demos"
        ? state === "error" ? demos.operator.errors.load : state === "loading" ? demos.operator.loading : state === "empty" ? demos.operator.empty : "Acme Dental"
        : state === "error" ? common.appointments.unavailable : state === "loading" ? common.appointments.loading : state === "empty" ? common.appointments.empty : "Alex Martin";
      await expect(page.getByText(expected, { exact: true })).toBeVisible({ timeout: 15_000 });
      await expect.poll(() => page.evaluate(() => localStorage.getItem("lobbystack.locale"))).toBe(locale);
      await expect.poll(() => page.locator("html").evaluate(element => element.classList.contains("dark"))).toBe(theme === "dark");
      await page.evaluate(() => document.fonts.ready);
      const name = `${route}-${state}-${locale}-${theme}-${viewport.name}`;
      await page.screenshot({ path: test.info().outputPath(`${name}-rendered.png`), animations: "disabled", caret: "hide", fullPage: true });
      await expect(page).toHaveScreenshot(`${name}.png`, { animations: "disabled", caret: "hide", fullPage: true, maxDiffPixelRatio: 0.001, threshold: 0 });
      expect(await page.locator("body").ariaSnapshot()).toMatchSnapshot(`${name}-aria.yml`);
    } finally { await context.close(); }
  });
}
