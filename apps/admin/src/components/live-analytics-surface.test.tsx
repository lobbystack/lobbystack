// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AnalyticsViewModel } from "@/lib/page-view-models";
import { LiveAnalyticsSurface } from "./live-analytics-surface";

vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: "en" }, t: (key: string) => key }) }));

const clients: QueryClient[] = [];
beforeEach(() => { vi.stubGlobal("EventSource", class { addEventListener() {} close() {} }); });
afterEach(() => { cleanup(); clients.forEach((client) => client.clear()); clients.length = 0; vi.unstubAllGlobals(); });

function renderAnalytics(channels: AnalyticsViewModel["channels"]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  clients.push(client);
  client.setQueryData(["businesses"], { businesses: [{ businessId: "business", name: "Test", active: true, role: "business_owner" }] });
  const metric = { current: 0, previous: 0 };
  const analytics: AnalyticsViewModel = { periodDays: 30, from: "2026-09-01T00:00:00Z", to: "2026-10-01T00:00:00Z", granularity: "week", calls: metric, appointments: metric, messages: metric, averageCallDurationSeconds: 0, agentResponseSeconds: metric, series: [], channels, outcomes: [] };
  vi.stubGlobal("fetch", vi.fn(async () => Response.json(analytics)));
  render(<QueryClientProvider client={client}><LiveAnalyticsSurface /></QueryClientProvider>);
}

async function channelRows() {
  const card = (await screen.findByText("home.analytics.channels.title")).closest("[data-slot='card']")!;
  return [...card.querySelectorAll("li")].map((row) => row.textContent);
}

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
