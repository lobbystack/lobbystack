// @vitest-environment jsdom
import type { ReactNode } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";

import { SidebarProvider } from "@/components/ui/sidebar";
import { NumberTrialBanner } from "./number-trial-banner";
import { NumberTrialCard } from "./number-trial-card";

const upgrade = vi.hoisted(() => ({ open: vi.fn(), billing: true, language: "en" }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: upgrade.language },
    t: (key: string, options?: Record<string, unknown>) => options === undefined ? key : `${key}:${JSON.stringify(options)}`,
  }),
}));
vi.mock("@/components/upgrade-plan-dialog-context", () => ({ useOpenUpgradePlanDialog: () => upgrade.open }));
vi.mock("@/components/business-capabilities-provider", () => ({ useBusinessCan: () => (capability: string) => capability !== "billing" || upgrade.billing }));
vi.mock("@/hooks/use-active-business", () => ({ useActiveBusiness: () => ({ business: { businessId: "business" } }) }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); upgrade.open.mockReset(); upgrade.billing = true; upgrade.language = "en"; });

function renderWith(trial: Record<string, unknown>, card: ReactNode = <NumberTrialCard />) {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ trial })));
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><NumberTrialBanner />{card}</QueryClientProvider>);
}

const active = { status: "active", e164: "+15818927672", minutesExhausted: false, forwardTo: null };
const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

it("counts the trial's days down in a card whose button opens the plans", async () => {
  renderWith({ ...active, daysLeft: 12 });
  const card = await screen.findByRole("status");
  expect(within(card).getByText("numberTrial.title")).toBeTruthy();
  expect(within(card).getByText(`numberTrial.daysLeft:${JSON.stringify({ count: 12, days: "12" })}`)).toBeTruthy();
  expect(within(card).getByText(/^numberTrial\.keepNumber/)).toBeTruthy();
  await userEvent.click(within(card).getByRole("button", { name: "numberTrial.viewPlans" }));
  expect(upgrade.open).toHaveBeenCalledTimes(1);
});

it("formats the days in the interface language", async () => {
  upgrade.language = "ar-EG";
  renderWith({ ...active, daysLeft: 12 });
  const days = new Intl.NumberFormat("ar-EG").format(12);
  expect(days).not.toBe("12");
  expect(await screen.findByText(`numberTrial.daysLeft:${JSON.stringify({ count: 12, days })}`)).toBeTruthy();
});

it("leaves the trial's last week to the card, with no banner across the top", async () => {
  renderWith({ ...active, daysLeft: 3 });
  expect(await screen.findByText(/^numberTrial\.daysLeft:\{"count":3,/)).toBeTruthy();
  expect(screen.getAllByRole("status")).toHaveLength(1);
});

it("says at once when the minutes run out and where calls go, in the banner and the card", async () => {
  renderWith({ ...active, daysLeft: 12, minutesExhausted: true, forwardTo: "+15145550100" });
  expect(await screen.findByText(/^numberTrial\.outOfMinutes/)).toBeTruthy();
  expect(screen.getByText("numberTrial.noMinutesLeft")).toBeTruthy();
  expect(screen.getByText(/^numberTrial\.callsGoTo/)).toBeTruthy();
  expect(screen.queryByText(/numberTrial\.daysLeft/)).toBeNull();
});

it("asks for a subscription to get the agent answering when the minutes ran out with nowhere to send calls", async () => {
  renderWith({ ...active, daysLeft: 12, minutesExhausted: true, forwardTo: null });
  expect(await screen.findByText("numberTrial.noMinutesLeft")).toBeTruthy();
  expect(screen.getByText("numberTrial.answerAgain")).toBeTruthy();
});

it("offers the plans from an icon button too, for when the sidebar folds to icons", async () => {
  renderWith({ ...active, daysLeft: 12 }, <SidebarProvider defaultOpen={false}><NumberTrialCard collapsible /></SidebarProvider>);
  await screen.findByRole("status");
  const buttons = screen.getAllByRole("button", { name: "numberTrial.viewPlans" });
  expect(buttons).toHaveLength(2);
  await userEvent.click(buttons[1]!);
  expect(upgrade.open).toHaveBeenCalledTimes(1);
});

it("shows no card once the trial ended, and the banner offers the number back", async () => {
  renderWith({ status: "ended", e164: "+15818927672" });
  expect(await screen.findByText(/^numberTrial\.stillAvailable/)).toBeTruthy();
  expect(screen.queryByText("numberTrial.title")).toBeNull();
});

it("shows nothing to someone who can't see billing", async () => {
  upgrade.billing = false;
  renderWith({ ...active, daysLeft: 12 });
  await settle();
  expect(screen.queryByRole("status")).toBeNull();
});
