// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceSwitcher } from "./workspace-switcher";
import { SidebarProvider } from "@/components/ui/sidebar";
const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: "en-US" }, t: (key: string) => key }) }));
const clients: QueryClient[] = [];
beforeEach(() => {
  vi.stubGlobal("matchMedia", vi.fn(query => ({ matches: false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
});
afterEach(() => { cleanup(); clients.forEach(client => client.clear()); clients.length = 0; vi.unstubAllGlobals(); vi.clearAllMocks(); });
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
describe("original workspace switcher behavior", () => {
  it("masks business names and phone numbers in analytics replay", async () => {
    setup();
    expect(screen.getByText("Tim Hortons").className).toContain("ph-mask");
    expect(screen.getByText("(415) 555-0100").className).toContain("ph-mask");
    await userEvent.click(screen.getByRole("button", { name: /Tim Hortons/ }));
    expect((await screen.findByRole("menuitem", { name: /Acme Clinic/ })).querySelector("span.truncate")?.className).toContain("ph-mask");
  });
  it("left-aligns long workspace names across two lines", () => {
    setup("Plomberie Urgence Montréal (PUM)");
    const name = screen.getByText("Plomberie Urgence Montréal (PUM)");
    for (const token of ["w-full", "text-left", "line-clamp-2"]) expect(name.className).toContain(token);
  });
  it("shows the original skeleton while workspaces load", () => {
    const { container } = setup("Tim Hortons", true);
    expect(container.querySelector('[data-slot="skeleton"]')).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });
  it("switches the workspace and discards the previous tenant's cached data", async () => {
    const { client, fetchMock } = setup();
    client.setQueryData(["contacts", "business-1"], { private: true });
    await userEvent.click(screen.getByRole("button", { name: /Tim Hortons/ }));
    await userEvent.click(await screen.findByRole("menuitem", { name: /Acme Clinic/ }));
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith("/api/businesses/switch", expect.objectContaining({ method: "POST", body: JSON.stringify({ businessId: "business-2" }) }));
    expect(client.getQueryData(["contacts", "business-1"])).toBeUndefined();
  });
});
