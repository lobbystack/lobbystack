// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";

import { NumberTrialBanner } from "./number-trial-banner";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@/components/upgrade-plan-dialog-context", () => ({ useOpenUpgradePlanDialog: () => vi.fn() }));
vi.mock("@/hooks/use-active-business", () => ({ useActiveBusiness: () => ({ business: { businessId: "business" } }) }));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function renderWith(trial: Record<string, unknown>) {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ trial })));
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><NumberTrialBanner /></QueryClientProvider>);
}

const active = { status: "active", e164: "+15818927672", minutesExhausted: false, forwardTo: null };

it("waits until the trial's last week to count down", async () => {
  renderWith({ ...active, daysLeft: 8 });
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(screen.queryByRole("status")).toBeNull();
});

it("counts down from 7 days left", async () => {
  renderWith({ ...active, daysLeft: 7 });
  expect(await screen.findByText("numberTrial.daysLeft")).toBeTruthy();
});

it("says at once when the minutes run out and calls go to the owner", async () => {
  renderWith({ ...active, daysLeft: 12, minutesExhausted: true, forwardTo: "+15145550100" });
  expect(await screen.findByText("numberTrial.outOfMinutes")).toBeTruthy();
});
