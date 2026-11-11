// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createI18nInstance } from "@/i18n";
import { resourcesForRoute } from "@/lib/i18n-resources";
import { routeNamespaces } from "@/lib/route-namespaces";
import { createRecordedBrowserTelemetry } from "@/lib/telemetry-testing";

import { BillingSuccessSurface } from "./billing-success-surface";

const route = vi.hoisted(() => ({ router: { push: vi.fn(), replace: vi.fn() }, search: new URLSearchParams() }));
const telemetryRef = vi.hoisted(() => ({ current: null as ReturnType<typeof createRecordedBrowserTelemetry> | null }));
vi.mock("@/components/product-analytics", () => ({ useTelemetry: () => telemetryRef.current!.telemetry }));
vi.mock("next/navigation", () => ({ useRouter: () => route.router, useSearchParams: () => route.search, usePathname: () => "/billing/success" }));

const clients: QueryClient[] = [];
beforeEach(() => { telemetryRef.current = createRecordedBrowserTelemetry(); });
afterEach(() => { cleanup(); clients.forEach((client) => client.clear()); clients.length = 0; localStorage.clear(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

/** A key the route doesn't ship renders as itself, such as forwarding.title. */
const RAW_KEY = /^[a-z][a-zA-Z]*(\.[a-zA-Z_]+)+$/;
function rawKeys(): string[] {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const found: string[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent?.trim() ?? "";
    if (RAW_KEY.test(text)) found.push(text);
  }
  for (const element of document.body.querySelectorAll("[aria-label]")) {
    const label = element.getAttribute("aria-label") ?? "";
    if (RAW_KEY.test(label)) found.push(label);
  }
  return found;
}

type State = { requestId: string | null; synced: boolean; stage: string; number: string | null };
const states: Array<[string, State]> = [
  ["a visit without a checkout", { requestId: null, synced: false, stage: "plan", number: null }],
  ["a payment that hasn't synced", { requestId: "checkout-1", synced: false, stage: "plan", number: null }],
  ["an onboarding checkout without a number", { requestId: "checkout-1", synced: true, stage: "plan", number: null }],
  ["an onboarding checkout with a number", { requestId: "checkout-1", synced: true, stage: "choose_plan", number: "+14165550123" }],
  ["a settings checkout with a number", { requestId: "checkout-1", synced: true, stage: "complete", number: "+14165550123" }],
  ["a settings checkout without a number", { requestId: "checkout-1", synced: true, stage: "complete", number: null }],
];

/** Built the way the server builds the page, with only the namespaces its route ships. */
async function renderAs(locale: "en" | "fr" | "es" | "sr", state: State) {
  route.search = new URLSearchParams(state.requestId ? `requestId=${state.requestId}` : "");
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url.startsWith("/api/billing/checkout?")) return Response.json({ synced: state.synced, target: "starter" });
    if (url.startsWith("/api/phone-numbers?")) return Response.json({ phoneNumbers: state.number ? [{ e164: state.number, reclaimScheduledAt: null }] : [] });
    if (url.startsWith("/api/onboarding/stage?")) return Response.json({ ok: true });
    throw new Error(`Unexpected request ${url}`);
  }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  clients.push(client);
  client.setQueryData(["businesses"], { businesses: [{ businessId: "business", active: true, onboardingStage: state.stage }] });
  const i18n = createI18nInstance({ locale, resources: resourcesForRoute(locale, routeNamespaces("/billing/success")) });
  render(<I18nextProvider i18n={i18n}><QueryClientProvider client={client}><BillingSuccessSurface /></QueryClientProvider></I18nextProvider>);
  await screen.findAllByRole("heading");
  if (state.synced) await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
  if (state.number) await screen.findByText(/416/);
  return i18n;
}

/** Clicks every button that isn't a link, so a dialog it opens renders its copy too. */
async function openEverything() {
  for (const button of [...document.body.querySelectorAll("button")]) {
    if (button.disabled || !button.isConnected) continue;
    await act(async () => { button.click(); });
  }
}

/** react-i18next notes each namespace a mounted component asks for. */
function usedNamespaces(i18n: Awaited<ReturnType<typeof renderAs>>): string[] {
  return (i18n as unknown as { reportNamespaces?: { getUsedNamespaces(): string[] } }).reportNamespaces?.getUsedNamespaces() ?? [];
}

describe("billing success page translations", () => {
  for (const locale of ["en", "fr", "es", "sr"] as const) {
    it.each(states)(`shows no raw keys in ${locale} for %s`, async (_name, state) => {
      const i18n = await renderAs(locale, state);
      await openEverything();
      expect(rawKeys()).toEqual([]);
      for (const namespace of usedNamespaces(i18n)) expect(routeNamespaces("/billing/success"), namespace).toContain(namespace);
    });
  }
});
