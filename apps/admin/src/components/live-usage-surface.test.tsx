// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LiveUsageSurface } from "./live-usage-surface";

const language = vi.hoisted(() => ({ value: "en" }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: language.value }, t: (key: string) => key }) }));
const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.forEach(client => client.clear()); clients.length = 0; });
function setup(locale: string, blocked = false) {
  language.value = locale;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  clients.push(client);
  client.setQueryData(["businesses"], { businesses: [{ businessId: "business", active: true }] });
  client.setQueryData(["billing", "business"], {
    account: { plan: "pro", currentPeriodEnd: "2026-10-01T12:00:00Z" },
    usageStatus: { voiceSecondsUsed: 750, outboundCallAttemptsUsed: 4, alertSmsSegmentsUsed: 2, voiceBlocked: blocked },
    knowledgeStorageBytesUsed: 1024 * 1024,
  });
  render(<QueryClientProvider client={client}><LiveUsageSurface /></QueryClientProvider>);
}
describe("original dedicated billing usage page", () => {
  it.each([["en", "12.5"], ["fr", "12,5"]])("formats voice minutes in %s and preserves the four non-AI usage meters", (locale, minutes) => {
    setup(locale!);
    for (const name of ["voiceTitle", "outboundAttemptsTitle", "alertSmsTitle", "knowledgeTitle"]) expect(screen.getByText(`billing.usage.${name}`)).toBeTruthy();
    expect(screen.getByText(text => text.startsWith(`${minutes} /`))).toBeTruthy();
    expect(screen.queryByText("billing.usage.paygTitle")).toBeNull();
    expect(screen.queryByText("billing.currentPlan.title")).toBeNull();
  });
  it("explains a blocked voice allowance alongside its meter", () => {
    setup("en", true);
    expect(screen.getByText("billing.usage.blockedDescription")).toBeTruthy();
  });
});
