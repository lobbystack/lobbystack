// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LiveIntegrationsSurface } from "./live-integrations-surface";
const route = vi.hoisted(() => ({ router: { replace: vi.fn() }, search: new URLSearchParams() }));
vi.mock("next/navigation", () => ({ useRouter: () => route.router, useSearchParams: () => route.search, usePathname: () => "/integrations" }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: "en" }, t: (key: string) => key }) }));
const clients: QueryClient[] = [];
beforeEach(() => { route.search = new URLSearchParams(); });
afterEach(() => { cleanup(); clients.forEach(client => client.clear()); clients.length = 0; vi.unstubAllGlobals(); vi.clearAllMocks(); });
function setup(role: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } }); clients.push(client);
  client.setQueryData(["businesses"], { businesses: [{ businessId: "business", active: true, role }] });
  const fetchMock = vi.fn(async () => Response.json({ calendarConnections: [], calendarOptions: [] })); vi.stubGlobal("fetch", fetchMock);
  render(<QueryClientProvider client={client}><LiveIntegrationsSurface /></QueryClientProvider>);
  return fetchMock;
}
describe("original integration permissions and setup navigation", () => {
  it("does not request administrator calendar connections for viewers", () => {
    const fetchMock = setup("viewer");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "integrations.actions.connect" }).hasAttribute("disabled")).toBe(true);
  });
  it("opens the calendar dialog and consumes only the setup parameter", async () => {
    route.search = new URLSearchParams("setup=calendar&keep=value");
    setup("business_admin");
    expect(await screen.findByRole("dialog")).toBeTruthy();
    await waitFor(() => expect(route.router.replace).toHaveBeenCalledWith("/integrations?keep=value", { scroll: false }));
  });
});
