import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const manifest = JSON.parse(readFileSync(fileURLToPath(new URL("../../../docs/validation/admin-ui-parity.json", import.meta.url)), "utf8")) as { visualRoutes: Array<{ path: string; harness?: string; queries: string[]; requests: string[] }> };
const loadingRoutes = manifest.visualRoutes.filter(route => route.harness === "apps/admin/e2e/loading-parity.e2e.ts");
for (const route of loadingRoutes) for (const locale of ["en", "fr"] as const) for (const theme of ["light", "dark"] as const) for (const viewport of [{ name: "desktop", width: 1440, height: 1000 }, { name: "mobile", width: 390, height: 844 }]) {
  test(`${route.path} loading ${locale} ${theme} ${viewport.name}`, async ({ browser }) => {
    const side = process.env.LOADING_PARITY_SIDE;
    const storageState = process.env[`PARITY_${side === "reference" ? "REFERENCE" : "PORT"}_OPERATOR_STORAGE_STATE_${locale.toUpperCase()}`];
    test.skip(!storageState || !process.env.LOADING_PARITY_BASE_URL, "Requires paired disposable operator fixtures and an explicit parity target.");
    const context = await browser.newContext({ storageState: storageState!, viewport, locale, colorScheme: theme, timezoneId: "America/Toronto" });
    let heldRequests = 0;
    try {
      await context.addInitScript(({ locale, theme }) => { localStorage.setItem("lobbystack.locale", locale); localStorage.setItem("theme", theme); }, { locale, theme });
      if (side === "reference") {
        await context.routeWebSocket("**/sync", socket => {
          const server = socket.connectToServer();
          const pending = new Set<number>();
          socket.onMessage(message => {
            const body = JSON.parse(message.toString());
            for (const modification of body.modifications ?? []) {
              if (modification.type === "Add" && route.queries.includes(modification.udfPath)) { pending.add(modification.queryId); heldRequests += 1; }
              if (modification.type === "Remove") pending.delete(modification.queryId);
            }
            server.send(message);
          });
          server.onMessage(message => {
            const body = JSON.parse(message.toString());
            if (body.modifications) body.modifications = body.modifications.filter((modification: { queryId?: number }) => !pending.has(modification.queryId ?? -1));
            socket.send(JSON.stringify(body));
          });
        });
      } else {
        for (const pattern of route.requests) await context.route(pattern, () => { heldRequests += 1; });
      }
      const page = await context.newPage();
      await page.goto(`${process.env.LOADING_PARITY_BASE_URL}${route.path}`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1500);
      await expect.poll(() => heldRequests, { message: "The page-specific service request must remain pending." }).toBeGreaterThan(0);
      await expect.poll(() => new URL(page.url()).pathname).toBe(route.path);
      await expect.poll(() => page.evaluate(() => localStorage.getItem("lobbystack.locale"))).toBe(locale);
      await expect.poll(() => page.locator("html").evaluate(element => element.classList.contains("dark"))).toBe(theme === "dark");
      await page.evaluate(() => document.fonts.ready);
      const name = `${(route.path === "/" ? "home" : route.path.slice(1).replaceAll("/", "-"))}-loading-${locale}-${theme}-${viewport.name}`;
      await page.screenshot({ path: test.info().outputPath(`${name}-rendered.png`), animations: "disabled", caret: "hide", fullPage: true });
      await expect(page).toHaveScreenshot(`${name}.png`, { animations: "disabled", caret: "hide", fullPage: true, maxDiffPixelRatio: 0.001, threshold: 0 });
      let tree = await page.locator("body").ariaSnapshot();
      const announcer = page.locator("next-route-announcer").getByRole("alert");
      if (await announcer.count() === 1) {
        const announcement = await announcer.ariaSnapshot();
        if (tree.startsWith(`${announcement}\n`)) tree = tree.slice(announcement.length + 1);
      }
      expect(tree).toMatchSnapshot(`${name}-aria.yml`);
    } finally { await context.close(); }
  });
}
