// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

const state = vi.hoisted(() => ({
  pathname: "/login",
  missing: vi.fn((..._args: unknown[]) => [] as string[]),
  load: vi.fn((..._args: unknown[]) => Promise.resolve()),
  instance: {
    resolvedLanguage: "en",
    language: "en",
    t: (key: string) => key,
    on: vi.fn(),
    off: vi.fn(),
    changeLanguage: vi.fn(() => Promise.resolve()),
    hasResourceBundle: vi.fn(() => true),
    addResourceBundle: vi.fn(),
  },
}));

vi.mock("next/navigation", () => ({ usePathname: () => state.pathname }));
vi.mock("@/i18n", () => ({
  createI18nInstance: () => state.instance,
  missingNamespaces: (...args: unknown[]) => state.missing(...args),
  loadRouteNamespaces: (...args: unknown[]) => state.load(...args),
}));
vi.mock("@/components/theme-provider", () => ({ ThemeProvider: ({ children }: { children: ReactNode }) => children }));
vi.mock("@/components/appearance-provider", () => ({ AppearanceProvider: ({ children }: { children: ReactNode }) => children }));
vi.mock("@/components/replacement-locale-provider", () => ({ LocaleProvider: ({ children }: { children: ReactNode }) => children }));
vi.mock("@/components/product-analytics", () => ({ ProductAnalytics: () => null }));
vi.mock("@/components/ui/sonner", () => ({ Toaster: () => null }));

import { Providers } from "./providers";

function wrap(children: ReactNode) {
  return (
    <Providers initialLocale="en" initialLocaleSource="default" initialResources={{ common: {} }}>
      {children}
    </Providers>
  );
}

beforeEach(() => {
  state.pathname = "/login";
  state.missing.mockReset();
  state.missing.mockImplementation((..._args: unknown[]) => [] as string[]);
  state.load.mockReset();
  state.load.mockImplementation((..._args: unknown[]) => Promise.resolve());
});

afterEach(() => { cleanup(); vi.clearAllMocks(); });

it("renders route content immediately when the server supplied its namespaces", () => {
  render(wrap(<div>Login form</div>));
  expect(screen.getByText("Login form")).toBeTruthy();
  expect(screen.queryByRole("status")).toBeNull();
});

it("shows a scoped progress bar without blocking content while namespaces load", async () => {
  let finish!: () => void;
  const pending = new Promise<void>((resolve) => { finish = resolve; });
  state.missing.mockReturnValue(["auth"]);
  state.load.mockReturnValue(pending);
  render(wrap(<div>Login form</div>));
  expect(screen.getByRole("status")).toBeTruthy();
  expect(screen.getByText("Login form")).toBeTruthy();
  await act(async () => { finish(); await pending; });
  await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
});

it("keeps the page usable and offers a retry when a namespace request fails", async () => {
  state.missing.mockReturnValue(["auth"]);
  state.load.mockRejectedValueOnce(new Error("offline"));
  render(wrap(<div>Page content</div>));
  const retry = await screen.findByRole("button", { name: "common:loading.retry" });
  expect(screen.getByText("Page content")).toBeTruthy();
  expect(screen.getByRole("alert").textContent).toContain("common:loading.failed");
  state.missing.mockReturnValue([]);
  fireEvent.click(retry);
  await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
});

it("loads the namespaces a newly visited route needs", async () => {
  const view = render(wrap(<div>Login</div>));
  expect(state.load).not.toHaveBeenCalled();
  state.missing.mockReturnValue(["calls"]);
  state.pathname = "/calls/call-1";
  view.rerender(wrap(<div>Call detail</div>));
  await waitFor(() => expect(state.load).toHaveBeenCalledWith(state.instance, "en", expect.arrayContaining(["calls"])));
  expect(screen.getByText("Call detail")).toBeTruthy();
});
