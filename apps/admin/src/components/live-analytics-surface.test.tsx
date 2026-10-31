// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AnalyticsViewModel } from "@/lib/page-view-models";
import { LiveAnalyticsSurface } from "./live-analytics-surface";

vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: "en" }, t: (key: string) => key }) }));

const clients: QueryClient[] = [];
beforeEach(() => { vi.stubGlobal("EventSource", class { addEventListener() {} close() {} }); });
afterEach(() => { cleanup(); clients.forEach((client) => client.clear()); clients.length = 0; vi.unstubAllGlobals(); });

function renderAnalytics(channels: AnalyticsViewModel["channels"], overrides: Partial<AnalyticsViewModel> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  clients.push(client);
  client.setQueryData(["businesses"], { businesses: [{ businessId: "business", name: "Test", active: true, role: "business_owner" }] });
  const metric = { current: 0, previous: 0 };
  const analytics: AnalyticsViewModel = {
    periodDays: 30, from: "2026-09-01T00:00:00Z", to: "2026-10-01T00:00:00Z", granularity: "week", calls: metric, appointments: metric, messages: metric, averageCallDurationSeconds: 0, agentResponseSeconds: metric, series: [], channels, outcomes: [],
    bookedValue: { currency: "USD", ...metric }, timeSavedSeconds: metric, callsWithoutTransferPercent: { current: null, previous: null }, ...overrides,
  };
  vi.stubGlobal("fetch", vi.fn(async () => Response.json(analytics)));
  render(<QueryClientProvider client={client}><LiveAnalyticsSurface /></QueryClientProvider>);
}

async function channelRows() {
  const card = (await screen.findByText("home.analytics.channels.title")).closest("[data-slot='card']")!;
  return [...card.querySelectorAll("li")].map((row) => row.textContent);
}

describe("analytics results row", () => {
  async function results() {
    const row = (await screen.findByText("home.analytics.results.bookedValue")).closest("section")!.parentElement!;
    return [...row.querySelectorAll("section")].map((section) => [...section.querySelectorAll("h2, p")].map((element) => element.textContent));
  }

  it("shows booked value in the business currency, time saved in hours and minutes, and the share without a transfer", async () => {
    renderAnalytics({ phone_call: 0, web_call: 0, sms: 0, web_chat: 0, other: 0 }, {
      bookedValue: { currency: "USD", current: 125_000, previous: 100_000 },
      timeSavedSeconds: { current: 12 * 3_600 + 5 * 60, previous: 0 },
      callsWithoutTransferPercent: { current: 82.5, previous: 80 },
    });
    expect(await results()).toEqual([
      ["home.analytics.results.bookedValue", "$1,250", "home.analytics.metrics.percentUp"],
      ["home.analytics.results.timeSaved", "12 hr 5 min", "home.analytics.metrics.percentUp"],
      ["home.analytics.results.withoutTransfer", "82.5%", "home.analytics.metrics.pointsUp"],
    ]);
  });

  it("says the previous period had no calls instead of leaving the comparison out", async () => {
    renderAnalytics({ phone_call: 0, web_call: 0, sms: 0, web_chat: 0, other: 0 }, { callsWithoutTransferPercent: { current: 100, previous: null } });
    expect((await results())[2]).toEqual(["home.analytics.results.withoutTransfer", "100%", "home.analytics.metrics.noPreviousCalls"]);
  });

  it("shows a dash and no comparison while no calls count", async () => {
    renderAnalytics({ phone_call: 0, web_call: 0, sms: 0, web_chat: 0, other: 0 });
    expect((await results())[2]).toEqual(["home.analytics.results.withoutTransfer", "—"]);
  });
});

describe("analytics channels card", () => {
  it("shows website chat and web calls with the shared channel labels and icons", async () => {
    renderAnalytics({ phone_call: 1, web_call: 1, sms: 1, web_chat: 0, other: 0 });
    expect(await channelRows()).toEqual(["common:channels.phoneCall34%", "common:channels.webCall33%", "common:channels.sms33%", "common:channels.webChat0%"]);
    const card = screen.getByText("home.analytics.channels.title").closest("[data-slot='card']")!;
    expect(card.querySelectorAll("li svg")).toHaveLength(4);
  });

  it("lists Other only when it has activity", async () => {
    renderAnalytics({ phone_call: 0, web_call: 0, sms: 0, web_chat: 3, other: 1 });
    expect(await channelRows()).toEqual(["common:channels.phoneCall0%", "common:channels.webCall0%", "common:channels.sms0%", "common:channels.webChat75%", "home.analytics.channels.labels.other25%"]);
  });
});

describe("analytics loading states", () => {
  const skeletons = () => document.querySelectorAll('[data-slot="skeleton"]').length;

  it("keeps the title, shows placeholders for the controls and shapes the rest like the page while the data loads", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    clients.push(client);
    client.setQueryData(["businesses"], { businesses: [{ businessId: "business", name: "Test", active: true, role: "business_owner" }] });
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    render(<QueryClientProvider client={client}><LiveAnalyticsSurface /></QueryClientProvider>);
    expect(screen.getByRole("heading", { name: "analyticsPage.title" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "home.analytics.controls.granularity" })).toBeNull();
    expect(screen.queryByRole("button", { name: "home.analytics.controls.presetRange" })).toBeNull();
    // The placeholders are as wide as the real buttons because they hold the real labels, hidden.
    expect(screen.getByText("home.analytics.controls.granularities.weekly").className).toContain("invisible");
    expect(screen.getByText("home.analytics.controls.presets.last30").className).toContain("invisible");
    // Three results, the overview chart, four metrics with a chart each, and two bar lists.
    expect(document.querySelectorAll("section").length).toBe(7);
    expect(document.querySelectorAll('[data-slot="card"]').length).toBe(3);
    expect(skeletons()).toBeGreaterThan(40);
    expect(screen.queryByText("home.analytics.results.bookedValue")).toBeNull();
  });

  it("shows the real controls once the data has loaded", async () => {
    renderAnalytics({ phone_call: 0, web_call: 0, sms: 0, web_chat: 0, other: 0 });
    await screen.findByText("home.analytics.results.bookedValue");
    expect(screen.getByRole("button", { name: "home.analytics.controls.granularity" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "home.analytics.controls.dateRange" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "home.analytics.controls.presetRange" })).toBeTruthy();
  });

  it("dims the previous range instead of swapping in placeholders while a new granularity loads", async () => {
    renderAnalytics({ phone_call: 0, web_call: 0, sms: 0, web_chat: 0, other: 0 });
    await screen.findByText("home.analytics.results.bookedValue");
    expect(document.querySelector("[aria-busy]")).toBeNull();
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    await userEvent.click(screen.getByRole("button", { name: "home.analytics.controls.granularity" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "home.analytics.controls.granularities.daily" }));
    expect(document.querySelector('[aria-busy="true"]')?.className).toContain("opacity-60");
    expect(screen.getByText("home.analytics.results.bookedValue")).toBeTruthy();
    expect(skeletons()).toBe(0);
  });
});
