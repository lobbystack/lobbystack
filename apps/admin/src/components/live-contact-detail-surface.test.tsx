// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LiveContactDetailSurface } from "./live-contact-detail-surface";

const language = vi.hoisted(() => ({ current: "sr" }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: language.current }, t: (key: string) => key }) }));

const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.forEach((client) => client.clear()); clients.length = 0; vi.unstubAllGlobals(); });

function renderDetail(preferredLocale: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  clients.push(client);
  client.setQueryData(["businesses"], { businesses: [{ businessId: "business", name: "Business", active: true, role: "business_owner" }] });
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({
    contact: { id: "contact", legacyConvexId: null, name: "Ana", phone: "+14155550100", email: null, timezone: null, preferredLocale, smsConsentStatus: null, smsConsentUpdatedAt: null, smsConsentSource: null, operatorBlockedAt: null, createdAt: "2026-09-01T12:00:00Z" },
    calls: [],
    messages: [],
    appointments: [],
    activityCounts: { calls: 0, messages: 0, appointments: 0, conversations: 0 },
  })));
  render(<QueryClientProvider client={client}><LiveContactDetailSurface contactId="contact" /></QueryClientProvider>);
}

describe("contact detail preferred language", () => {
  it("names the language in Latin script in the Serbian interface", async () => {
    language.current = "sr";
    renderDetail("en");
    await userEvent.click(await screen.findByRole("tab", { name: "detail.tabs.details" }));
    expect(await screen.findByText("engleski")).toBeTruthy();
    expect(screen.queryByText("енглески")).toBeNull();
  });

  it("names the language in the interface language for other locales", async () => {
    language.current = "fr";
    renderDetail("en");
    await userEvent.click(await screen.findByRole("tab", { name: "detail.tabs.details" }));
    expect(await screen.findByText("anglais")).toBeTruthy();
  });
});
