// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import i18next from "i18next";
import { I18nextProvider, initReactI18next, useTranslation } from "react-i18next";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/settings/appearance", useRouter: () => ({ replace: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
vi.mock("@/lib/public-auth-session", () => ({ readPublicAuthSession: async () => ({ user: { id: "user-1" } }) }));

import { LocaleProvider, useLocalePreference } from "./replacement-locale-provider";

// Uses the real react-i18next: it returns a new i18n wrapper after each
// language change, which the mocked provider tests can't reproduce.
function Controls() {
  const { t } = useTranslation();
  const { locale, setLocale, isSaving } = useLocalePreference();
  return (
    <>
      <h1>{t("title")}</h1>
      <span data-testid="locale">{locale}</span>
      <button disabled={isSaving} onClick={() => void setLocale("fr")} type="button">French</button>
    </>
  );
}

beforeEach(() => {
  const storage = new Map<string, string>([["lobbystack.locale", "en"]]);
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value); },
  });
  document.cookie = "lobbystack.locale=en; path=/";
});

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("keeps the language the operator picks instead of restoring the one stored at load", async () => {
  const i18n = i18next.createInstance();
  await i18n.use(initReactI18next).init({
    lng: "en",
    fallbackLng: "en",
    resources: { en: { translation: { title: "Settings" } }, fr: { translation: { title: "Réglages" } } },
  });
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => Response.json(init?.method === "PATCH" ? { locale: "fr" } : { locale: "en" }));
  vi.stubGlobal("fetch", fetchMock);
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <I18nextProvider i18n={i18n}>
        <LocaleProvider initialLocale="en" initialLocaleSource="cookie"><Controls /></LocaleProvider>
      </I18nextProvider>
    </QueryClientProvider>,
  );
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/preferences/locale", expect.anything()));

  fireEvent.click(screen.getByRole("button", { name: "French" }));

  await waitFor(() => expect(screen.getByRole("button", { name: "French" })).toHaveProperty("disabled", false));
  expect(screen.getByRole("heading").textContent).toBe("Réglages");
  expect(screen.getByTestId("locale").textContent).toBe("fr");
  expect(i18n.language).toBe("fr");
  expect(window.localStorage.getItem("lobbystack.locale")).toBe("fr");
  expect(document.cookie).toContain("lobbystack.locale=fr");
  expect(fetchMock).toHaveBeenCalledWith("/api/preferences/locale", expect.objectContaining({ method: "PATCH", body: JSON.stringify({ locale: "fr" }) }));
});
