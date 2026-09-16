// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LiveServicesSurface } from "./live-services-surface";
import { RulesSurface } from "./rules-surface";
import { LiveIntegrationsSurface } from "./live-integrations-surface";
import { LiveKnowledgeSurface } from "./live-knowledge-surface";

const navigation = vi.hoisted(() => ({ pathname: "/agent/services", search: "setup=service", replace: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname, useSearchParams: () => new URLSearchParams(navigation.search), useRouter: () => ({ replace: navigation.replace }) }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: "en", resolvedLanguage: "en" }, t: (key: string) => key }) }));
const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.forEach(client => client.clear()); clients.length = 0; });
beforeEach(() => { navigation.replace.mockReset(); });
function setup(kind: "service" | "rule" | "upload" | "website" | "calendar", loaded = true, role = "business_owner") {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
  clients.push(client);
  client.setQueryData(["businesses"], { businesses: loaded ? [{ businessId: "business-1", active: true, role }] : [] });
  client.setQueryData(["catalog", "business-1"], { services: [] });
  client.setQueryData(["rules", "business-1"], []);
  client.setQueryData(["knowledge", "business-1"], { documents: [] });
  client.setQueryData(["knowledge-snippets", "business-1"], { snippets: [] });
  client.setQueryData(["integrations", "business-1"], { calendarConnections: [], calendarOptions: [] });
  navigation.pathname = kind === "calendar" ? "/settings/integrations" : kind === "service" ? "/agent/services" : kind === "rule" ? "/agent/rules" : "/agent/knowledge";
  navigation.search = `setup=${kind}&keep=1`;
  render(<QueryClientProvider client={client}>{kind === "calendar" ? <LiveIntegrationsSurface /> : kind === "service" ? <LiveServicesSurface /> : kind === "rule" ? <RulesSurface /> : <LiveKnowledgeSurface />}</QueryClientProvider>);
  return client;
}
describe("original setup guide deep links", () => {
  it.each(["service", "rule", "upload", "website", "calendar"] as const)("opens the %s editor and consumes only the setup parameter", async kind => {
    setup(kind);
    expect(await screen.findByRole("dialog")).toBeTruthy();
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith(`${navigation.pathname}?keep=1`, { scroll: false }));
    expect(navigation.replace).toHaveBeenCalledTimes(1);
  });
  it("keeps hook order stable and defers the rule editor until the workspace loads", async () => {
    const client = setup("rule", false);
    expect(screen.queryByRole("dialog")).toBeNull();
    await act(async () => { client.setQueryData(["businesses"], { businesses: [{ businessId: "business-1", active: true, role: "business_owner" }] }); });
    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(navigation.replace).toHaveBeenCalledWith("/agent/rules?keep=1", { scroll: false });
  });
  it("does not expose an editor through setup links to a read-only member", () => {
    setup("service", true, "viewer");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(navigation.replace).not.toHaveBeenCalled();
  });
});
