// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";

import { NumberTrialBanner } from "./number-trial-banner";
import { NumberTrialChip } from "./number-trial-chip";

const upgrade = vi.hoisted(() => ({ open: vi.fn(), billing: true }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string, options?: { count?: number }) => options?.count === undefined ? key : `${key}:${options.count}` }) }));
vi.mock("@/components/upgrade-plan-dialog-context", () => ({ useOpenUpgradePlanDialog: () => upgrade.open }));
vi.mock("@/components/business-capabilities-provider", () => ({ useBusinessCan: () => (capability: string) => capability !== "billing" || upgrade.billing }));
vi.mock("@/hooks/use-active-business", () => ({ useActiveBusiness: () => ({ business: { businessId: "business" } }) }));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); upgrade.open.mockReset(); upgrade.billing = true; });

function renderWith(trial: Record<string, unknown>) {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ trial })));
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><NumberTrialBanner /><NumberTrialChip /></QueryClientProvider>);
}

const active = { status: "active", e164: "+15818927672", minutesExhausted: false, forwardTo: null };
const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

it("counts the trial down in the sidebar chip, which opens the plans", async () => {
  renderWith({ ...active, daysLeft: 12 });
  expect(await screen.findByText("numberTrial.chip:12")).toBeTruthy();
  await userEvent.click(screen.getByRole("button", { name: "numberTrial.viewPlans" }));
  expect(upgrade.open).toHaveBeenCalledTimes(1);
});

it("leaves the trial's last week to the chip, with no banner across the top", async () => {
  renderWith({ ...active, daysLeft: 3 });
  expect(await screen.findByText("numberTrial.chip:3")).toBeTruthy();
  expect(screen.getAllByRole("status")).toHaveLength(1);
});

it("says at once when the minutes run out and calls go to the owner", async () => {
  renderWith({ ...active, daysLeft: 12, minutesExhausted: true, forwardTo: "+15145550100" });
  expect(await screen.findByText("numberTrial.outOfMinutes")).toBeTruthy();
});

it("shows no chip once the trial ended, and the banner offers the number back", async () => {
  renderWith({ status: "ended", e164: "+15818927672" });
  expect(await screen.findByText("numberTrial.stillAvailable")).toBeTruthy();
  expect(screen.queryByText(/numberTrial\.chip/)).toBeNull();
});

it("shows nothing to someone who can't see billing", async () => {
  upgrade.billing = false;
  renderWith({ ...active, daysLeft: 12 });
  await settle();
  expect(screen.queryByRole("status")).toBeNull();
});
