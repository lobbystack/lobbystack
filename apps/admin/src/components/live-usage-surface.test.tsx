// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BusinessCapabilitiesProvider } from "./business-capabilities-provider";
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
    effectivePlan: "pro",
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

describe("a partner's business, which has no billing", () => {
  function setupPartner(usage: unknown) {
    language.value = "en";
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    clients.push(client);
    client.setQueryData(["businesses"], { businesses: [{ businessId: "business", active: true, capabilities: ["activity"] }] });
    client.setQueryData(["usage", "business"], usage);
    render(<QueryClientProvider client={client}><BusinessCapabilitiesProvider initial={["activity"]}><LiveUsageSurface /></BusinessCapabilitiesProvider></QueryClientProvider>);
    // The plan's billing data is never asked for.
    expect(client.getQueryData(["billing", "business"])).toBeUndefined();
  }

  it("shows its minutes and chats this month with no limit while it's billed outside LobbyStack, without the host's plans", () => {
    setupPartner({ periodKey: "2026-10", resetsAt: "2026-11-01T00:00:00.000Z", voiceSeconds: { used: 750, included: null, blocked: false }, chats: { used: 34, included: null, blocked: false } });
    expect(screen.getByText("billing.usage.allowanceTitle")).toBeTruthy();
    expect(screen.getByText("billing.usage.voiceTitle")).toBeTruthy();
    expect(screen.getByText("billing.usage.chatsTitle")).toBeTruthy();
    expect(screen.getAllByText("billing.usage.noLimit")).toHaveLength(2);
    for (const name of ["outboundAttemptsTitle", "alertSmsTitle", "knowledgeTitle"]) expect(screen.queryByText(`billing.usage.${name}`)).toBeNull();
  });

  it("shows what a business on a package used past its allowance, without prices, while its overage is on", () => {
    setupPartner({ periodKey: "2026-10", resetsAt: "2026-11-01T00:00:00.000Z", voiceSeconds: { used: 630, included: 600, blocked: false }, chats: { used: 5, included: 3, blocked: false }, overage: { enabled: true, voiceSeconds: 30, chats: 2 } });
    expect(screen.getByText("billing.usage.extraTitle")).toBeTruthy();
    expect(screen.getByText("billing.usage.extraOnDescription")).toBeTruthy();
    expect(screen.getByText("0.5 billing.usage.units.voice")).toBeTruthy();
    expect(screen.getByText("2 billing.usage.units.chats")).toBeTruthy();
    expect(screen.queryByText(/\$|CAD/)).toBeNull();
  });

  it("shows no extra usage while overage is off and there was none, and what there was after it went off", () => {
    const usage = { periodKey: "2026-10", resetsAt: "2026-11-01T00:00:00.000Z", voiceSeconds: { used: 600, included: 600, blocked: true }, chats: { used: 3, included: 3, blocked: true } };
    setupPartner({ ...usage, overage: { enabled: false, voiceSeconds: 0, chats: 0 } });
    expect(screen.queryByText("billing.usage.extraTitle")).toBeNull();
    cleanup();
    setupPartner({ ...usage, overage: { enabled: false, voiceSeconds: 90, chats: 0 } });
    expect(screen.getByText("billing.usage.extraOffDescription")).toBeTruthy();
    expect(screen.getByText("1.5 billing.usage.units.voice")).toBeTruthy();
  });

  it("shows each against its allowance once it has one, and says when one ran out", () => {
    setupPartner({ periodKey: "2026-10", resetsAt: "2026-11-01T00:00:00.000Z", voiceSeconds: { used: 750, included: 6000, blocked: false }, chats: { used: 100, included: 100, blocked: true } });
    expect(screen.getByText(text => text.startsWith("12.5 /"))).toBeTruthy();
    expect(screen.getByText(text => text.startsWith("100 /"))).toBeTruthy();
    expect(screen.queryByText("billing.usage.noLimit")).toBeNull();
    expect(screen.getByText("billing.usage.blockedDescription")).toBeTruthy();
  });
});
