import type { BrowserContext } from "@playwright/test";

import { PAGE_INTROS_E2E_COOKIE } from "@lobbystack/shared";

// The e2e server sets PAGE_INTROS_E2E_OPT_IN, so the dashboard's first-visit
// intro cards stay away from every spec by default and none waits behind one.
// A spec that tests the cards opts its browser in here.

export async function showPageIntros(context: BrowserContext, baseURL: string): Promise<void> {
  await context.addCookies([{ name: PAGE_INTROS_E2E_COOKIE, value: "on", url: baseURL }]);
}
