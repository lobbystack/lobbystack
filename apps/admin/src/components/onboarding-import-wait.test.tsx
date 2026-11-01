// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterEach, expect, it, vi } from "vitest";

import { createI18nInstance } from "@/i18n";
import { resourcesForRoute } from "@/lib/i18n-resources";
import { routeNamespaces } from "@/lib/route-namespaces";

import { ImportWaitSlides } from "./onboarding-import-wait";

afterEach(() => { vi.useRealTimers(); cleanup(); });

/** Built the way the server builds it, so a key the test call route doesn't ship would show as a raw key. */
it.each(["en", "fr", "es", "sr"] as const)("shows every slide in %s", async (locale) => {
  vi.useFakeTimers();
  const instance = createI18nInstance({ locale, resources: resourcesForRoute(locale, routeNamespaces("/onboarding/test-call")) });
  render(<I18nextProvider i18n={instance}><ImportWaitSlides /></I18nextProvider>);
  const seen = new Set<string>();
  for (let slide = 0; slide < 6; slide += 1) {
    const text = screen.getByText((_, element) => element?.tagName === "P" && element.className.includes("font-medium")).textContent ?? "";
    expect(text).not.toContain("testCall.wait");
    seen.add(text);
    await act(() => vi.advanceTimersByTimeAsync(7_000));
  }
  expect(seen.size).toBe(6);
});
