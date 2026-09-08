// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

const state = vi.hoisted(() => ({ pathname: "/login", load: vi.fn(), hasBundle: vi.fn(() => true) }));
vi.mock("next/navigation", () => ({ usePathname: () => state.pathname }));
vi.mock("@/i18n", () => ({ i18nReady: Promise.resolve(), default: { languages: ["en"], hasResourceBundle: state.hasBundle, loadNamespaces: state.load, t: (key: string) => key } }));
vi.mock("@/components/theme-provider", () => ({ ThemeProvider: ({ children }: { children: ReactNode }) => children }));
vi.mock("@/components/appearance-provider", () => ({ AppearanceProvider: ({ children }: { children: ReactNode }) => children }));
vi.mock("@/components/replacement-locale-provider", () => ({ LocaleProvider: ({ children }: { children: ReactNode }) => children }));
vi.mock("@/components/product-analytics", () => ({ ProductAnalytics: () => null }));
vi.mock("@/components/ui/sonner", () => ({ Toaster: () => null }));
import { Providers } from "./providers";

afterEach(() => { cleanup(); vi.clearAllMocks(); state.hasBundle.mockReturnValue(true); state.pathname = "/login"; });
it("renders a loading shell before translations arrive and loads only the route namespaces", async () => {
  let complete!: (error?: unknown) => void;
  state.load.mockImplementation((_namespaces, callback) => { complete = callback; });
  render(<Providers><div>Login form</div></Providers>);
  expect(screen.getByRole("status")).toBeTruthy();
  expect(screen.queryByText("Login form")).toBeNull();
  await waitFor(() => expect(state.load).toHaveBeenCalledWith(["common", "auth"], expect.any(Function)));
  await act(async () => complete());
  expect(screen.getByText("Login form")).toBeTruthy();
});
it("offers a page reload after a namespace failure without exposing untranslated content", async () => {
  state.hasBundle.mockReturnValue(false);
  state.load.mockImplementationOnce((_namespaces, callback) => callback(new Error("offline"))).mockImplementation((_namespaces, callback) => callback());
  render(<Providers><div>Page content</div></Providers>);
  expect(await screen.findByRole("button", { name: "common:loading.retry" })).toBeTruthy();
  expect(screen.queryByText("Page content")).toBeNull();
});
it("does not treat an i18next cached failure as loaded translations", async () => {
  state.hasBundle.mockReturnValue(false);
  state.load.mockImplementation((_namespaces, callback) => callback());
  render(<Providers><div>Page content</div></Providers>);
  expect(await screen.findByRole("button", { name: "common:loading.retry" })).toBeTruthy();
  expect(screen.queryByText("Page content")).toBeNull();
});
it("waits for a new route's namespaces before displaying that route", async () => {
  state.load.mockImplementation((_namespaces, callback) => callback());
  const view = render(<Providers><div>Login</div></Providers>);
  await screen.findByText("Login");
  let complete!: () => void;
  state.load.mockImplementation((_namespaces, callback) => { complete = callback; });
  state.pathname = "/calls/call-id";
  view.rerender(<Providers><div>Call detail</div></Providers>);
  expect(screen.queryByText("Call detail")).toBeNull();
  await waitFor(() => expect(complete).toBeTypeOf("function"));
  await act(async () => complete());
  expect(screen.getByText("Call detail")).toBeTruthy();
});
