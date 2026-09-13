// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LiveIntegrationsSurface } from "./live-integrations-surface";
import type { IntegrationsViewModel } from "@/lib/page-view-models";
const notify = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: notify }));
const route = vi.hoisted(() => ({ router: { replace: vi.fn() }, search: new URLSearchParams() }));
vi.mock("next/navigation", () => ({ useRouter: () => route.router, useSearchParams: () => route.search, usePathname: () => "/integrations" }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: "en" }, t: (key: string) => key }) }));
const clients: QueryClient[] = [];
beforeEach(() => { route.search = new URLSearchParams(); });
afterEach(() => { cleanup(); clients.forEach(client => client.clear()); clients.length = 0; vi.unstubAllGlobals(); vi.clearAllMocks(); });
function setup(role: string, data: Partial<IntegrationsViewModel> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } }); clients.push(client);
  client.setQueryData(["businesses"], { businesses: [{ businessId: "business", active: true, role }] });
  const fetchMock = vi.fn(async () => Response.json({ calendarConnections: [], calendarOptions: [], staff: [], discoveryError: null, ...data })); vi.stubGlobal("fetch", fetchMock);
  render(<QueryClientProvider client={client}><LiveIntegrationsSurface /></QueryClientProvider>);
  return fetchMock;
}
describe("original integration permissions and setup navigation", () => {
  it("shows errored connections and discovery failures instead of hiding them", async () => {
    setup("business_admin", { calendarConnections: [{ id: "connection", provider: "google", externalAccountId: "account", status: "error", staffId: null, selectedCalendarId: "calendar", lastSyncError: "provider failure" }], discoveryError: "discovery unavailable" });
    expect((await screen.findByRole("alert")).textContent).toContain("integrations.google.discoveryFailed");
    fireEvent.click(screen.getByRole("button", { name: "integrations.google.reconnect" }));
    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(screen.getByText("integrations.status.reconnectRequired")).toBeTruthy();
  });
  it("uses localized callback feedback, never arbitrary URL message text", async () => {
    route.search = new URLSearchParams("calendar=google&status=success&message=untrusted-text");
    setup("business_admin");
    await waitFor(() => expect(notify.success).toHaveBeenCalledWith("integrations.google.connectedSuccess"));
    expect(notify.success).not.toHaveBeenCalledWith("untrusted-text");
  });
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
