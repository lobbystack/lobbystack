// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterEach, expect, it, vi } from "vitest";

import { createI18nInstance } from "@/i18n";
import { resourcesForRoute } from "@/lib/i18n-resources";
import { routeNamespaces } from "@/lib/route-namespaces";

import { ImportWaitSlides } from "./onboarding-import-wait";

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); cleanup(); });

function renderSlides(locale: "en" | "fr" | "es" | "sr" = "en") {
  const instance = createI18nInstance({ locale, resources: resourcesForRoute(locale, routeNamespaces("/onboarding/reading")) });
  render(<I18nextProvider i18n={instance}><ImportWaitSlides /></I18nextProvider>);
}

const shownTitle = () => screen.getByText((_, element) => element?.tagName === "P" && element.className.includes("font-medium")).textContent ?? "";

/** Built the way the server builds it, so a key the route doesn't ship would show as a raw key. */
it.each(["en", "fr", "es", "sr"] as const)("shows every slide in %s", async (locale) => {
  vi.useFakeTimers();
  renderSlides(locale);
  const seen = new Set<string>();
  for (let slide = 0; slide < 6; slide += 1) {
    expect(document.body.textContent).not.toContain("reading.");
    seen.add(shownTitle());
    await act(() => vi.advanceTimersByTimeAsync(7_000));
  }
  expect(seen.size).toBe(6);
});

it("moves with the arrows and stays where the operator put it", async () => {
  vi.useFakeTimers();
  renderSlides();
  const first = shownTitle();
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  const second = shownTitle();
  expect(second).not.toBe(first);
  await act(() => vi.advanceTimersByTimeAsync(21_000));
  expect(shownTitle()).toBe(second);
  fireEvent.click(screen.getByRole("button", { name: "Previous" }));
  expect(shownTitle()).toBe(first);
});

it("holds still for someone who asked for less motion", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduce") }));
  renderSlides();
  const first = shownTitle();
  await act(() => vi.advanceTimersByTimeAsync(21_000));
  expect(shownTitle()).toBe(first);
});
