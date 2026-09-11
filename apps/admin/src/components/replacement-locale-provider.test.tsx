// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

const mocks = vi.hoisted(() => {
  const changeLanguage = vi.fn((_locale: string) => Promise.resolve());
  return {
    pathname: "/",
    changeLanguage,
    error: vi.fn(),
    readSession: vi.fn(async () => ({ user: { id: "user-1" } }) as { user?: { id: string } } | null),
    i18n: {
      resolvedLanguage: "en",
      language: "en",
      t: (key: string) => key,
      on: vi.fn(),
      off: vi.fn(),
      changeLanguage,
    },
  };
});

vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: mocks.i18n, t: mocks.i18n.t }) }));
vi.mock("next/navigation", () => ({ usePathname: () => mocks.pathname }));
vi.mock("@/lib/public-auth-session", () => ({ readPublicAuthSession: (..._args: unknown[]) => mocks.readSession() }));
vi.mock("sonner", () => ({ toast: { error: mocks.error } }));

import { LocaleProvider, useLocalePreference } from "./replacement-locale-provider";

function Controls() {
  const { locale, setLocale, isSaving } = useLocalePreference();
  return <><span>{locale}</span><button disabled={isSaving} onClick={() => void setLocale("fr")}>French</button></>;
}

function renderProvider(children: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <LocaleProvider initialLocale="en" initialLocaleSource="default">{children}</LocaleProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mocks.pathname = "/";
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value); },
  });
  document.cookie = "lobbystack.locale=; path=/; max-age=0";
  mocks.readSession.mockReset();
  mocks.readSession.mockResolvedValue({ user: { id: "user-1" } });
  mocks.changeLanguage.mockClear();
  mocks.error.mockClear();
});

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("does not read sessions or preferences on public login pages", () => {
  mocks.pathname = "/login";
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  renderProvider(<Controls />);
  expect(mocks.readSession).not.toHaveBeenCalled();
  expect(fetchMock).not.toHaveBeenCalled();
});

it("persists an explicit query locale instead of an older stored choice", () => {
  mocks.pathname = "/login";
  window.localStorage.setItem("lobbystack.locale", "en");
  render(<QueryClientProvider client={new QueryClient()}><LocaleProvider initialLocale="fr" initialLocaleSource="query"><Controls /></LocaleProvider></QueryClientProvider>);
  expect(window.localStorage.getItem("lobbystack.locale")).toBe("fr");
  expect(document.cookie).toContain("lobbystack.locale=fr");
});

it("does not request the account locale preference for signed-out visitors", async () => {
  mocks.readSession.mockResolvedValue(null);
  const fetchMock = vi.fn(() => Promise.resolve(Response.json({ locale: "fr" })));
  vi.stubGlobal("fetch", fetchMock);
  renderProvider(<Controls />);
  await waitFor(() => expect(mocks.readSession).toHaveBeenCalled());
  expect(fetchMock).not.toHaveBeenCalled();
  expect(screen.getByText("en")).toBeTruthy();
});

it("reads the account locale preference for a signed-in operator", async () => {
  const fetchMock = vi.fn(() => Promise.resolve(Response.json({ locale: "fr" })));
  vi.stubGlobal("fetch", fetchMock);
  renderProvider(<Controls />);
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/preferences/locale", expect.objectContaining({ credentials: "include" })));
  await waitFor(() => expect(mocks.changeLanguage).toHaveBeenCalledWith("fr"));
});

it("does not let an older preference read overwrite a newly selected language", async () => {
  let resolveRead!: (value: Response) => void;
  vi.stubGlobal("fetch", vi.fn((_url: string, options?: RequestInit) => options?.method === "PATCH"
    ? Promise.resolve(Response.json({ locale: "fr" }))
    : new Promise<Response>((resolve) => { resolveRead = resolve; })));
  renderProvider(<Controls />);
  fireEvent.click(screen.getByRole("button", { name: "French" }));
  await waitFor(() => expect(mocks.changeLanguage).toHaveBeenLastCalledWith("fr"));
  await act(async () => { resolveRead(Response.json({ locale: "en" })); });
  expect(mocks.changeLanguage).toHaveBeenLastCalledWith("fr");
  expect(window.localStorage.getItem("lobbystack.locale")).toBe("fr");
});

it("restores the previous locale and reports a failed save", async () => {
  const fetchMock = vi.fn((_url: string, options?: RequestInit) => Promise.resolve(options?.method === "PATCH"
    ? new Response(null, { status: 500 })
    : Response.json({ locale: "en" })));
  vi.stubGlobal("fetch", fetchMock);
  renderProvider(<Controls />);
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/preferences/locale", expect.objectContaining({ credentials: "include" })));
  fireEvent.click(screen.getByRole("button", { name: "French" }));
  await waitFor(() => expect(mocks.error).toHaveBeenCalled());
  expect(mocks.changeLanguage).toHaveBeenLastCalledWith("en");
  expect(window.localStorage.getItem("lobbystack.locale")).toBe("en");
});
