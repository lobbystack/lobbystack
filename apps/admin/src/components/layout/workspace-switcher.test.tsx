// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceSwitcher } from "./workspace-switcher";
import { SidebarProvider } from "@/components/ui/sidebar";
const router = vi.hoisted(() => ({ refresh: vi.fn() }));
const pendingAnalytics = vi.hoisted(() => ({ record: vi.fn() }));
const branding = vi.hoisted(() => ({ partner: null as null | object }));
vi.mock("@/components/branding-provider", () => ({ useBranding: () => ({ partner: branding.partner }) }));
vi.mock("@/lib/workspace-analytics", () => ({ recordPendingWorkspaceSwitch: pendingAnalytics.record }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: "en-US" }, t: (key: string) => key }) }));
const clients: QueryClient[] = [];
beforeEach(() => {
  vi.stubGlobal("matchMedia", vi.fn(query => ({ matches: false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
});
afterEach(() => { cleanup(); clients.forEach(client => client.clear()); clients.length = 0; branding.partner = null; vi.unstubAllGlobals(); vi.clearAllMocks(); });
function setup(name = "Tim Hortons", loading = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } }); clients.push(client);
  const businesses = [{ businessId: "business-1", name, active: true }, { businessId: "business-2", name: "Acme Clinic", active: false }];
  if (!loading) client.setQueryData(["businesses"], { businesses });
  client.setQueryData(["phone-numbers", "business-1"], { phoneNumbers: [{ e164: "+14155550100", status: "active" }] });
  const fetchMock = vi.fn(async (url: string) => {
    if (loading) return new Promise<Response>(() => {});
    if (url === "/api/businesses/switch") { businesses[0]!.active = false; businesses[1]!.active = true; return Response.json({ ok: true }); }
    if (url === "/api/businesses") return Response.json({ businesses });
    return Response.json({ phoneNumbers: [] });
  });
  vi.stubGlobal("fetch", fetchMock);
  const view = render(<QueryClientProvider client={client}><SidebarProvider><WorkspaceSwitcher /></SidebarProvider></QueryClientProvider>);
  return { ...view, client, fetchMock };
}
describe("on a partner's domain", () => {
  it("offers a new workspace on the host's domain", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: /Tim Hortons/ }));
    expect(await screen.findByRole("menuitem", { name: /sidebar\.createBusiness/ })).toBeTruthy();
  });

  it("offers no new workspace, since the partner creates its businesses from its console", async () => {
    branding.partner = { faviconUrl: null, color: null, links: { terms: null, privacy: null, support: null } };
    setup();
    await userEvent.click(screen.getByRole("button", { name: /Tim Hortons/ }));
    expect(await screen.findByRole("menuitem", { name: /Acme Clinic/ })).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: /sidebar\.createBusiness/ })).toBeNull();
  });
});

describe("original workspace switcher behavior", () => {
  it("masks business names in analytics replay", async () => {
    setup();
    expect(screen.getByText("Tim Hortons").className).toContain("ph-mask");
    await userEvent.click(screen.getByRole("button", { name: /Tim Hortons/ }));
    expect((await screen.findByRole("menuitem", { name: /Acme Clinic/ })).querySelector("span.truncate")?.className).toContain("ph-mask");
  });
  it("keeps the workspace phone number out of the switcher", () => {
    const { fetchMock } = setup();
    expect(screen.queryByText("(415) 555-0100")).toBeNull();
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/api/phone-numbers"))).toBe(false);
  });
  it("shows the workspace initial beside its name", () => {
    setup("Plomberie Urgence Montréal (PUM)");
    expect(screen.getByText("P")).toBeTruthy();
  });
  it("keeps a long workspace name on one line, left aligned", () => {
    setup("Plomberie Urgence Montréal (PUM)");
    const name = screen.getByText("Plomberie Urgence Montréal (PUM)");
    for (const token of ["w-full", "text-left", "truncate"]) expect(name.className).toContain(token);
  });
  it("shows the original skeleton while workspaces load", () => {
    const { container } = setup("Tim Hortons", true);
    expect(container.querySelector('[data-slot="skeleton"]')).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });
  it("shows a row shaped like the real switcher, with the 24px initial, a one-line name and the chevron, and no border", () => {
    const { container } = setup("Tim Hortons", true);
    const placeholders = container.querySelectorAll('[data-slot="skeleton"]');
    expect([...placeholders].map((placeholder) => placeholder.className.match(/size-\d+|h-4 w-32/)?.[0])).toEqual(["size-6", "h-4 w-32", "size-4"]);
    const row = container.querySelector('[data-slot="item"]')!;
    for (const token of ["w-full", "gap-2", "rounded-lg", "px-2", "py-2"]) expect(row.className).toContain(token);
    // The real switcher is a borderless row too, so the outline variant's border would change its size on load.
    expect(row.getAttribute("data-variant")).not.toBe("outline");
  });
  it("replaces the row with the real switcher once the workspaces have loaded", () => {
    const { container } = setup("Tim Hortons");
    expect(container.querySelector('[data-slot="skeleton"]')).toBeNull();
    expect(screen.getByRole("button", { name: /Tim Hortons/ })).toBeTruthy();
  });
  it("switches the workspace and discards the previous tenant's cached data", async () => {
    const { client, fetchMock } = setup();
    client.setQueryData(["contacts", "business-1"], { private: true });
    await userEvent.click(screen.getByRole("button", { name: /Tim Hortons/ }));
    await userEvent.click(await screen.findByRole("menuitem", { name: /Acme Clinic/ }));
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith("/api/businesses/switch", expect.objectContaining({ method: "POST", body: JSON.stringify({ businessId: "business-2" }) }));
    expect(client.getQueryData(["contacts", "business-1"])).toBeUndefined();
    expect(pendingAnalytics.record).toHaveBeenCalledWith("business-2", "business-1");
  });
});
