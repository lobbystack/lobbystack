// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ changeLanguage: vi.fn(async () => undefined), error: vi.fn() }));
vi.mock("@/i18n", () => ({ default: { language: "en", on: vi.fn(), off: vi.fn(), changeLanguage: mocks.changeLanguage, t: (key: string) => key } }));
vi.mock("sonner", () => ({ toast: { error: mocks.error } }));
import { LocaleProvider, useLocalePreference } from "./replacement-locale-provider";
function Controls() { const { locale, setLocale, isSaving } = useLocalePreference(); return <><span>{locale}</span><button disabled={isSaving} onClick={() => void setLocale("fr")}>French</button></>; }
beforeEach(() => {
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) });
  vi.clearAllMocks();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("does not let an older preference read overwrite a newly selected language", async () => {
  let resolveRead!: (value: Response) => void;
  vi.stubGlobal("fetch", vi.fn((_url, options) => options?.method === "PATCH" ? Promise.resolve(Response.json({ locale: "fr" })) : new Promise<Response>((resolve) => { resolveRead = resolve; })));
  render(<LocaleProvider><Controls /></LocaleProvider>);
  fireEvent.click(screen.getByRole("button", { name: "French" }));
  await waitFor(() => expect(mocks.changeLanguage).toHaveBeenLastCalledWith("fr"));
  await act(async () => { resolveRead(Response.json({ locale: "en" })); });
  expect(mocks.changeLanguage).toHaveBeenLastCalledWith("fr");
  expect(window.localStorage.getItem("lobbystack.locale")).toBe("fr");
});
it("restores the previous locale and reports a failed save", async () => {
  vi.stubGlobal("fetch", vi.fn((_url, options) => Promise.resolve(options?.method === "PATCH" ? new Response(null, { status: 500 }) : Response.json({ locale: "en" }))));
  render(<LocaleProvider><Controls /></LocaleProvider>);
  await waitFor(() => expect(mocks.changeLanguage).toHaveBeenCalledWith("en"));
  fireEvent.click(screen.getByRole("button", { name: "French" }));
  await waitFor(() => expect(mocks.error).toHaveBeenCalled());
  expect(mocks.changeLanguage).toHaveBeenLastCalledWith("en");
  expect(window.localStorage.getItem("lobbystack.locale")).toBe("en");
});
