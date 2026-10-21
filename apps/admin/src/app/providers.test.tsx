// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

const state = vi.hoisted(() => ({
  pathname: "/login",
  missing: vi.fn((..._args: unknown[]) => [] as string[]),
  load: vi.fn((..._args: unknown[]) => Promise.resolve()),
  capture: vi.fn(),
  themeProps: undefined as Record<string, unknown> | undefined,
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
  setI18nAppName: () => undefined,
}));
vi.mock("@/components/theme-provider", () => ({ ThemeProvider: ({ children, ...props }: { children: ReactNode }) => { state.themeProps = props; return children; } }));
vi.mock("@/components/appearance-provider", () => ({ AppearanceProvider: ({ children }: { children: ReactNode }) => children }));
vi.mock("@/components/replacement-locale-provider", () => ({ LocaleProvider: ({ children }: { children: ReactNode }) => children }));
vi.mock("@/components/product-analytics", () => ({ ProductAnalytics: ({ children }: { children?: ReactNode }) => children }));
vi.mock("@/components/ui/sonner", () => ({ Toaster: () => null }));
vi.mock("@/lib/branding", () => ({ loadBranding: async () => ({ appName: "LobbyStack", logoUrl: null }), brandingSnapshot: (branding: object) => ({ ...branding, final: true }) }));
vi.mock("@/lib/i18n-resources", () => ({ resourcesForRoute: () => ({ common: {} }) }));
vi.mock("@/lib/browser-error-reporting", () => ({ captureBrowserError: (...args: unknown[]) => state.capture(...args) }));

import { TranslationNetworkError } from "@/lib/translation-network-error";
import { BaseProviders } from "./base-providers";
import { Providers } from "./providers";
import { WidgetDocument } from "./widget-document";

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
  await waitFor(() => expect(state.load).toHaveBeenCalledWith(state.instance, "en", expect.arrayContaining(["calls"]), { revalidate: false }));
  expect(screen.getByText("Call detail")).toBeTruthy();
});

it("revalidates cached translation files when the operator retries", async () => {
  state.missing.mockReturnValue(["affiliate"]);
  state.load.mockRejectedValueOnce(new Error("offline"));
  state.pathname = "/affiliate";
  render(wrap(<div>Affiliate</div>));
  const retry = await screen.findByRole("button", { name: "common:loading.retry" });
  expect(state.load).toHaveBeenLastCalledWith(state.instance, "en", expect.arrayContaining(["affiliate"]), { revalidate: false });
  fireEvent.click(retry);
  await waitFor(() => expect(state.load).toHaveBeenLastCalledWith(state.instance, "en", expect.arrayContaining(["affiliate"]), { revalidate: true }));
});

it("reports a failed namespace request that got an HTTP error", async () => {
  state.missing.mockReturnValue(["affiliate"]);
  const failure = new Error("Unable to load the en/affiliate translations (HTTP 503).");
  state.load.mockRejectedValueOnce(failure);
  render(wrap(<div>Affiliate</div>));
  await screen.findByRole("button", { name: "common:loading.retry" });
  expect(state.capture).toHaveBeenCalledWith(failure);
});

it("offers a retry without reporting when the connection dropped", async () => {
  state.missing.mockReturnValue(["affiliate"]);
  state.load.mockRejectedValueOnce(new TranslationNetworkError("/locales/en/affiliate.json", { cause: new TypeError("Load failed") }));
  render(wrap(<div>Affiliate</div>));
  await screen.findByRole("button", { name: "common:loading.retry" });
  expect(state.capture).not.toHaveBeenCalled();
});

it("keeps the page's language attribute in step with the copy, on the website widget too", () => {
  render(<BaseProviders initialLocale="en" initialResources={{ common: {} }}><div>Chat</div></BaseProviders>);
  expect(document.documentElement.lang).toBe("en");
  const [, onLanguageChanged] = state.instance.on.mock.calls.find(([event]) => event === "languageChanged") as [string, (language: string) => void];
  act(() => { onLanguageChanged("sr"); });
  expect(document.documentElement.lang).toBe("sr-Latn");
});

it("follows the system theme on the dashboard", () => {
  render(wrap(<div>Dashboard</div>));
  expect(state.themeProps).toMatchObject({ defaultTheme: "system", enableSystem: true, forcedTheme: undefined });
});

it("draws the website widget in light colors even when the visitor's system is dark", async () => {
  const page = await WidgetDocument({ children: <div>Chat</div>, locale: "en", namespaces: ["common"] });
  // <html><body><BaseProviders>: render the providers, since <html> can't mount inside a test container.
  render(page.props.children.props.children);
  expect(state.themeProps).toMatchObject({ forcedTheme: "light" });
});
