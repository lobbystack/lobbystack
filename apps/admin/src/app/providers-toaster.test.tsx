// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useEffect, type ReactNode } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

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
vi.mock("@/components/theme-provider", () => ({ ThemeProvider: ({ children }: { children: ReactNode }) => children, useTheme: () => ({ theme: "light" }) }));
vi.mock("@/components/appearance-provider", () => ({ AppearanceProvider: ({ children }: { children: ReactNode }) => children }));
vi.mock("@/components/replacement-locale-provider", () => ({ LocaleProvider: ({ children }: { children: ReactNode }) => children }));
vi.mock("@/components/product-analytics", () => ({ ProductAnalytics: ({ children }: { children?: ReactNode }) => children }));

import { Providers } from "./providers";

afterEach(() => { cleanup(); });

function ToastOnMount() {
  useEffect(() => { toast.error("Unable to complete the Google Calendar connection."); }, []);
  return null;
}

it("shows a toast fired from a page's mount effect", async () => {
  render(
    <Providers initialLocale="en" initialLocaleSource="default" initialResources={{ common: {} }}>
      <ToastOnMount />
    </Providers>,
  );
  expect(await screen.findByText("Unable to complete the Google Calendar connection.")).toBeTruthy();
});

function FailingMutation({ label, inline = false }: { label: string; inline?: boolean }) {
  const mutation = useMutation({ mutationFn: () => Promise.reject(new Error("Request failed.")), ...(inline ? { meta: { inlineError: true } } : {}) });
  return <button onClick={() => mutation.mutate()} type="button">{label}</button>;
}

it("toasts a failed mutation unless it reports the failure itself", async () => {
  render(
    <Providers initialLocale="en" initialLocaleSource="default" initialResources={{ common: {} }}>
      <FailingMutation inline label="inline" />
      <FailingMutation label="silent" />
    </Providers>,
  );
  screen.getByRole("button", { name: "inline" }).click();
  await new Promise(resolve => setTimeout(resolve, 50));
  expect(screen.queryByText("common:errors.unexpected")).toBeNull();
  screen.getByRole("button", { name: "silent" }).click();
  expect(await screen.findByText("common:errors.unexpected")).toBeTruthy();
});
