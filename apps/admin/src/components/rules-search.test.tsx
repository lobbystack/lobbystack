// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

import common from "../../public/locales/en/common.json";
import { RulesSurface } from "./rules-surface";

vi.mock("react-i18next", () => ({
  useTranslation: (ns?: string) => ({
    i18n: { language: "en", resolvedLanguage: "en" },
    t: (key: string, options?: { query?: string }) => ns === "common" ? String((common.tableSearch as Record<string, string>)[key.replace("tableSearch.", "")] ?? key).replace("{{query}}", options?.query ?? "") : key,
  }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }), usePathname: () => "/agent/rules", useSearchParams: () => new URLSearchParams() }));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const rules = [
  { id: "a", title: "Greeting", content: "Say hello first", active: true, sortOrder: 0, createdAt: "2026-09-01T12:00:00Z", channel: null },
  { id: "b", title: "Refunds", content: "Never promise a refund", active: true, sortOrder: 1, createdAt: "2026-09-01T12:00:00Z", channel: null },
];

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(["businesses"], { businesses: [{ businessId: "business", active: true, role: "business_owner" }] });
  client.setQueryData(["rules", "business"], rules);
  vi.stubGlobal("fetch", vi.fn(async () => Response.json(rules)));
  render(<QueryClientProvider client={client}><RulesSurface /></QueryClientProvider>);
}

describe("rules search", () => {
  it("keeps only matching rules and stops reordering while searching", async () => {
    setup();
    await userEvent.type(screen.getByRole("textbox", { name: "Search rules" }), "refund");
    expect(screen.getByText("Refunds")).toBeTruthy();
    expect(screen.queryByText("Greeting")).toBeNull();
    const row = screen.getByText("Refunds").closest("tr")!;
    expect(row.querySelector("[title='actions.dragToReorder']")?.className).toContain("cursor-not-allowed");
  });

  it("says nothing matched for a query with no results", async () => {
    setup();
    await userEvent.type(screen.getByRole("textbox", { name: "Search rules" }), "zzz");
    expect(screen.queryByText("Greeting")).toBeNull();
    expect(screen.getByText("No results for “zzz”")).toBeTruthy();
    expect(screen.queryByText("sections.rules.emptyState")).toBeNull();
  });
});
