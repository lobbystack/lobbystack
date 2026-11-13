// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

import common from "../../public/locales/en/common.json";
import { LiveServicesSurface } from "./live-services-surface";

vi.mock("next/navigation", () => ({ usePathname: () => "/agent/services", useSearchParams: () => new URLSearchParams(), useRouter: () => ({ replace: vi.fn() }) }));
vi.mock("react-i18next", () => ({
  useTranslation: (ns?: string) => ({
    i18n: { language: "en", resolvedLanguage: "en" },
    t: (key: string, options?: { query?: string }) => ns === "common" ? String((common.tableSearch as Record<string, string>)[key.replace("tableSearch.", "")] ?? key).replace("{{query}}", options?.query ?? "") : key,
  }),
}));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const base = { description: null, durationMinutes: 30, priceType: "fixed", priceMinor: 5000, priceMaxMinor: null, discountPercent: 0, active: true, createdAt: "2026-09-01T12:00:00Z" };
const services = [
  { ...base, id: "cut", name: "Haircut", description: "Clean Café style" },
  { ...base, id: "dye", name: "Colour" },
];

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(["businesses"], { businesses: [{ businessId: "business", active: true, role: "business_owner" }] });
  client.setQueryData(["catalog", "business"], { services, currency: "USD" });
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ services, currency: "USD" })));
  render(<QueryClientProvider client={client}><LiveServicesSurface /></QueryClientProvider>);
}

describe("services search", () => {
  it("keeps only matching services, ignoring case and accents", async () => {
    setup();
    expect(screen.getByText("Haircut")).toBeTruthy();
    expect(screen.getByText("Colour")).toBeTruthy();
    await userEvent.type(screen.getByRole("textbox", { name: "Search services" }), "CAFE");
    expect(screen.getByText("Haircut")).toBeTruthy();
    expect(screen.queryByText("Colour")).toBeNull();
  });

  it("says nothing matched for a query with no results", async () => {
    setup();
    await userEvent.type(screen.getByRole("textbox", { name: "Search services" }), "zzz");
    expect(screen.queryByText("Haircut")).toBeNull();
    expect(screen.getByText("No results for “zzz”")).toBeTruthy();
    expect(screen.queryByText("sections.services.emptyState")).toBeNull();
  });
});
