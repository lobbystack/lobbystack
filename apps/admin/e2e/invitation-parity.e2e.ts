import { expect, test } from "@playwright/test";
import en from "../public/locales/en/auth.json" with { type: "json" };
import fr from "../public/locales/fr/auth.json" with { type: "json" };

const states = ["loading", "expired", "valid", "authenticated", "authenticated-loading", "submitting", "rejected"] as const;
for (const state of states) for (const locale of ["en", "fr"] as const) for (const theme of ["light", "dark"] as const) for (const viewport of [{ name: "desktop", width: 1440, height: 1000 }, { name: "mobile", width: 390, height: 844 }]) {
  test(`invitation ${state} ${locale} ${theme} ${viewport.name}`, async ({ browser }) => {
    test.setTimeout(90_000);
    const side = process.env.INVITATION_PARITY_SIDE;
    const authenticated = ["authenticated", "authenticated-loading", "submitting", "rejected"].includes(state);
    const pending = state === "loading" || state === "authenticated-loading";
    const storageState = process.env[`PARITY_${side === "reference" ? "REFERENCE" : "PORT"}_OPERATOR_STORAGE_STATE_${locale.toUpperCase()}`];
    test.skip(!process.env.INVITATION_PARITY_BASE_URL || (authenticated && !storageState), "Requires explicit reference/port targets and disposable operator sessions.");
    const context = await browser.newContext({ ...(authenticated ? { storageState: storageState! } : {}), viewport, locale, colorScheme: theme });
    const invitation = { businessName: "Parity Dental", email: "invitee@example.invalid", expired: state === "expired", status: "pending" };
    const copy = (locale === "fr" ? fr : en).acceptInvite;
    try {
      await context.addInitScript(({ locale, theme }) => { localStorage.setItem("lobbystack.locale", locale); localStorage.setItem("theme", theme); }, { locale, theme });
      if (side === "reference") {
        await context.routeWebSocket("**/sync", socket => {
          const server = socket.connectToServer(); const queries = new Set<number>();
          socket.onMessage(message => {
            const body = JSON.parse(message.toString());
            if (body.type === "Mutation" && body.udfPath === "businesses/members:acceptInvitation") {
              if (state === "rejected") socket.send(JSON.stringify({ type: "MutationResponse", requestId: body.requestId, success: false, result: "Invitation rejected", logLines: [] }));
              return;
            }
            for (const modification of body.modifications ?? []) {
              if (modification.type === "Add" && modification.udfPath === "businesses/members:previewInvitation") queries.add(modification.queryId);
              if (modification.type === "Remove") queries.delete(modification.queryId);
            }
            server.send(message);
          });
          server.onMessage(message => {
            const body = JSON.parse(message.toString());
            if (body.modifications) body.modifications = body.modifications.filter((modification: { queryId?: number }) => !(pending && queries.has(modification.queryId ?? -1)));
            for (const modification of body.modifications ?? []) if (modification.type === "QueryUpdated" && queries.has(modification.queryId)) modification.value = invitation;
            socket.send(JSON.stringify(body));
          });
        });
      } else {
        await context.route("**/api/team/accept**", async route => {
          if (route.request().method() === "POST") {
            if (state === "rejected") await route.fulfill({ status: 400, json: { error: "Invitation rejected" } });
            return;
          }
          if (!pending) await route.fulfill({ json: { invitation } });
        });
      }
      const page = await context.newPage();
      await page.goto(`${process.env.INVITATION_PARITY_BASE_URL}/accept-invite?token=parity-invitation`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1500);
      await page.addStyleTag({ content: "*,*::before,*::after{animation-duration:0s!important;transition-duration:0s!important;caret-color:transparent!important}" });
      await expect(page.getByRole("heading", { name: copy.title })).toBeVisible();
      if (pending) await expect(page.getByText(copy.loading, { exact: true })).toBeVisible();
      if (state === "expired") await expect(page.getByText(copy.expired, { exact: true })).toBeVisible();
      if (!pending && state !== "expired") await expect(page.getByText(/Parity Dental/)).toBeVisible();
      if (authenticated) {
        const submit = page.getByRole("button", { name: copy.submit, exact: true });
        if (pending) await expect(submit).toBeDisabled({ timeout: 75_000 });
        else await expect(submit).toBeEnabled({ timeout: 75_000 });
        if (state === "submitting" || state === "rejected") await submit.click();
        if (state === "submitting") await expect(page.getByRole("button", { name: copy.submitting })).toBeDisabled();
        if (state === "rejected") await expect(page.getByText(copy.failed, { exact: true })).toBeVisible();
      } else await expect(page.getByRole("link", { name: copy.signIn, exact: true })).toBeVisible();
      await expect.poll(() => page.locator("html").evaluate(element => element.classList.contains("dark"))).toBe(theme === "dark");
      await page.evaluate(() => document.fonts.ready);
      const name = `invitation-${state}-${locale}-${theme}-${viewport.name}`;
      await page.screenshot({ path: test.info().outputPath(`${name}-rendered.png`), animations: "disabled", fullPage: true });
      await expect(page).toHaveScreenshot(`${name}.png`, { animations: "disabled", fullPage: true, threshold: 0, maxDiffPixelRatio: 0.001 });
      let tree = await page.locator("body").ariaSnapshot();
      const announcer = page.locator("next-route-announcer").getByRole("alert");
      if (await announcer.count() === 1) { const announcement = await announcer.ariaSnapshot(); if (tree.startsWith(`${announcement}\n`)) tree = tree.slice(announcement.length + 1); }
      expect(tree).toMatchSnapshot(`${name}-aria.yml`);
    } finally { await context.close(); }
  });
}
