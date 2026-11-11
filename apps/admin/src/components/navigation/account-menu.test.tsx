// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SidebarProvider } from "@/components/ui/sidebar";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@/components/theme-provider", () => ({ useTheme: () => ({ resolvedTheme: "light", setTheme: vi.fn() }) }));
vi.mock("@/components/branding-provider", () => ({ useBranding: () => ({ partner: null }) }));
vi.mock("@/components/business-capabilities-provider", () => ({ useBusinessCan: () => () => false }));
vi.mock("@/components/upgrade-plan-dialog-context", () => ({ useOpenUpgradePlanDialog: () => vi.fn() }));
vi.mock("@/hooks/use-sign-out", () => ({ useSignOut: () => vi.fn() }));
vi.mock("@/hooks/use-active-business", () => ({ useActiveBusiness: () => ({ business: { businessId: "business-1", via: "member" } }) }));
vi.mock("@/components/dashboard-feedback-widget", () => ({ DashboardFeedbackDialog: ({ businessId, open }: { businessId?: string; open: boolean }) => open ? <p>{`feedback for ${businessId}`}</p> : null }));

import { AccountMenu } from "./account-menu";

beforeEach(() => { vi.stubGlobal("matchMedia", vi.fn(query => ({ matches: false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() }))); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("the account menu", () => {
  it("opens feedback for the active business", async () => {
    render(<QueryClientProvider client={new QueryClient()}><SidebarProvider><AccountMenu user={{ email: "operator@example.invalid", name: "Operator" }} /></SidebarProvider></QueryClientProvider>);
    await userEvent.click(screen.getByRole("button", { name: /operator@example.invalid/ }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "common:feedback.trigger" }));
    expect(await screen.findByText("feedback for business-1")).toBeTruthy();
  });
});
