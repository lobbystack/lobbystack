// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createRecordedBrowserTelemetry } from "@/lib/telemetry-testing";

const fixture = vi.hoisted(() => ({
  partner: { partnerId: "partner", name: "Bright Desk", role: "admin" as "owner" | "admin" | "member" },
  telemetry: null as ReturnType<typeof createRecordedBrowserTelemetry> | null,
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: "en" }, t: (key: string) => key }) }));
vi.mock("next/navigation", () => ({ usePathname: () => "/partner/partner/businesses" }));
vi.mock("@/components/partner-shell", () => ({ useConsolePartner: () => fixture.partner }));
vi.mock("@/components/product-analytics", () => ({ useTelemetry: () => fixture.telemetry!.telemetry }));
vi.mock("sonner", () => ({ toast: fixture.toast }));

import { PartnerBusinessesSurface } from "./partner-businesses-surface";

const harbor = { businessId: "harbor", name: "Harbor Dental", accessLevel: "full", onboardingStage: "website", createdAt: "2026-10-20T12:00:00.000Z", owner: { email: "owner@harbor.test", status: "joined" }, usage: { periodKey: "2026-10", voiceSeconds: 750, chats: 1234 } };
const pier = { businessId: "pier", name: "Pier Clinic", accessLevel: "activity", onboardingStage: "verify_phone", createdAt: "2026-10-21T12:00:00.000Z", owner: { email: "owner@pier.test", status: "invited", expiresAt: "2099-01-01T00:00:00.000Z" }, usage: { periodKey: "2026-10", voiceSeconds: 0, chats: 0 } };

beforeEach(() => { fixture.telemetry = createRecordedBrowserTelemetry(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

function renderAs(role: "owner" | "admin" | "member", respond: (url: string, init?: RequestInit) => Response) {
  fixture.partner = { ...fixture.partner, role };
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => respond(url, init));
  vi.stubGlobal("fetch", fetchMock);
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><PartnerBusinessesSurface /></QueryClientProvider>);
  return fetchMock;
}

describe("the partner console's Businesses page", () => {
  it("lists each business with its owner and access level for anyone on the team, and lets only owners and admins create one", async () => {
    const fetchMock = renderAs("member", () => Response.json({ businesses: [harbor, pier] }));
    const rows = await screen.findAllByRole("row");
    expect(fetchMock).toHaveBeenCalledWith("/api/partner/businesses?partnerId=partner", expect.anything());
    expect(within(rows[1]!).getByText("Harbor Dental")).toBeTruthy();
    expect(within(rows[1]!).getByText("owner@harbor.test")).toBeTruthy();
    expect(within(rows[1]!).getByText("businesses.access.full")).toBeTruthy();
    expect(within(rows[2]!).getByText("businesses.owner.invited")).toBeTruthy();
    expect(within(rows[2]!).getByText("businesses.access.activity")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "businesses.create.action" })).toBeNull();
  });

  it("shows each business's minutes and chats this month", async () => {
    renderAs("member", () => Response.json({ businesses: [harbor, pier] }));
    const rows = await screen.findAllByRole("row");
    expect(within(rows[0]!).getByText("businesses.table.minutes")).toBeTruthy();
    expect(within(rows[0]!).getByText("businesses.table.chats")).toBeTruthy();
    expect(within(rows[1]!).getByText("12.5")).toBeTruthy();
    expect(within(rows[1]!).getByText("1,234")).toBeTruthy();
    expect(within(rows[2]!).getAllByText("0")).toHaveLength(2);
  });

  it("lets only owners and admins release or delete a business", async () => {
    renderAs("member", () => Response.json({ businesses: [harbor, pier] }));
    await screen.findAllByRole("button", { name: "businesses.open.label" });
    expect(screen.queryAllByRole("button", { name: "businesses.actions.more" })).toEqual([]);
  });

  it("releases a business to the owner who joined once the admin confirms, and records web.partner.business_released", async () => {
    let businesses = [harbor, pier];
    const fetchMock = renderAs("admin", (url, init) => {
      if (init?.method === "POST" && url === "/api/partner/businesses/release") {
        businesses = [pier];
        return Response.json({ ok: true });
      }
      return Response.json({ businesses });
    });
    const [harborActions, pierActions] = await screen.findAllByRole("button", { name: "businesses.actions.more" });
    // An owner who hasn't accepted the invitation can't take the business over yet.
    await userEvent.click(pierActions!);
    expect((await screen.findByRole("menuitem", { name: "businesses.release.action" })).getAttribute("aria-disabled")).toBe("true");
    await userEvent.keyboard("{Escape}");

    await userEvent.click(harborActions!);
    await userEvent.click(await screen.findByRole("menuitem", { name: "businesses.release.action" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("businesses.release.description")).toBeTruthy();
    expect(fetchMock.mock.calls.some(([url]) => url === "/api/partner/businesses/release")).toBe(false);
    await userEvent.click(within(dialog).getByRole("button", { name: "businesses.release.confirm" }));

    await waitFor(() => fixture.telemetry!.expectEvent("web.partner.business_released", { partnerId: "partner", businessId: "harbor", pathname: "/partner/partner/businesses" }));
    const post = fetchMock.mock.calls.find(([url]) => url === "/api/partner/businesses/release");
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({ partnerId: "partner", businessId: "harbor" });
    expect(fixture.toast.success).toHaveBeenCalledWith("businesses.release.released");
    await waitFor(() => expect(screen.queryByText("Harbor Dental")).toBeNull());
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("deletes a business once the owner confirms, and records web.partner.business_deleted", async () => {
    let businesses = [harbor, pier];
    const fetchMock = renderAs("owner", (url, init) => {
      if (init?.method === "DELETE" && url === "/api/partner/businesses") {
        businesses = [harbor];
        return Response.json({ ok: true });
      }
      return Response.json({ businesses });
    });
    const [, pierActions] = await screen.findAllByRole("button", { name: "businesses.actions.more" });
    await userEvent.click(pierActions!);
    await userEvent.click(await screen.findByRole("menuitem", { name: "businesses.delete.action" }));
    await userEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "businesses.delete.confirm" }));

    await waitFor(() => fixture.telemetry!.expectEvent("web.partner.business_deleted", { partnerId: "partner", businessId: "pier", pathname: "/partner/partner/businesses" }));
    const deleted = fetchMock.mock.calls.find(([, init]) => init?.method === "DELETE");
    expect(JSON.parse(String(deleted?.[1]?.body))).toEqual({ partnerId: "partner", businessId: "pier" });
    expect(fixture.toast.success).toHaveBeenCalledWith("businesses.delete.deleted");
    await waitFor(() => expect(screen.queryByText("Pier Clinic")).toBeNull());
  });

  it("says why a business wasn't deleted, keeps it, and records nothing", async () => {
    renderAs("admin", (url, init) => init?.method === "DELETE"
      ? Response.json({ error: "The business's phone number is still being set up. Try again in a few minutes.", code: "business_number_in_progress" }, { status: 409 })
      : Response.json({ businesses: [harbor] }));
    await userEvent.click(await screen.findByRole("button", { name: "businesses.actions.more" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "businesses.delete.action" }));
    await userEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "businesses.delete.confirm" }));
    await waitFor(() => expect(fixture.toast.error).toHaveBeenCalledWith("businesses.delete.errors.numberInProgress"));
    expect(screen.getByText("Harbor Dental")).toBeTruthy();
    expect(fixture.telemetry!.events).toEqual([]);
  });

  it("tells a member who sees no businesses that owners and admins create them", async () => {
    renderAs("member", () => Response.json({ businesses: [] }));
    expect(await screen.findByText("businesses.empty.memberDescription")).toBeTruthy();
  });

  it("creates a business at the access level picked, invites its owner, and records web.partner.business_created", async () => {
    const businesses: unknown[] = [];
    const fetchMock = renderAs("admin", (_url, init) => {
      if (init?.method === "POST") {
        businesses.push(pier);
        return Response.json({ businessId: "pier", invitationId: "invitation", expiresAt: "2026-11-02T00:00:00.000Z" }, { status: 201 });
      }
      return Response.json({ businesses });
    });
    await screen.findByText("businesses.empty.title");
    await userEvent.click(screen.getByRole("button", { name: "businesses.create.action" }));
    await userEvent.type(await screen.findByLabelText("businesses.create.nameLabel"), "Pier Clinic");
    await userEvent.type(screen.getByLabelText("businesses.create.ownerLabel"), "owner@pier.test");
    await userEvent.click(screen.getByRole("radio", { name: /businesses\.access\.activity/ }));
    await userEvent.click(screen.getByRole("button", { name: "businesses.create.submit" }));

    await waitFor(() => fixture.telemetry!.expectEvent("web.partner.business_created", { partnerId: "partner", businessId: "pier", accessLevel: "activity", pathname: "/partner/partner/businesses" }));
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(post?.[0]).toBe("/api/partner/businesses");
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({ partnerId: "partner", name: "Pier Clinic", timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", accessLevel: "activity", ownerEmail: "owner@pier.test" });
    expect(fixture.toast.success).toHaveBeenCalledWith("businesses.create.created");
    expect(await screen.findByText("Pier Clinic")).toBeTruthy();
  });

  it("opens a business for anyone on the team, records web.partner.business_opened, and goes to its dashboard on the partner's domain", async () => {
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });
    const fetchMock = renderAs("member", (url, init) => init?.method === "POST" && url === "/api/partner/businesses/open"
      ? Response.json({ expiresAt: "2026-10-26T20:00:00.000Z", url: "https://bright.portal.example.test/" })
      : Response.json({ businesses: [harbor, pier] }));
    const [openHarbor] = await screen.findAllByRole("button", { name: "businesses.open.label" });
    await userEvent.click(openHarbor!);
    await waitFor(() => expect(assign).toHaveBeenCalledWith("https://bright.portal.example.test/"));
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({ partnerId: "partner", businessId: "harbor" });
    fixture.telemetry!.expectEvent("web.partner.business_opened", { partnerId: "partner", businessId: "harbor", pathname: "/partner/partner/businesses" });
  });

  it("says when a business didn't open, and records nothing", async () => {
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });
    renderAs("admin", (url, init) => init?.method === "POST" && url === "/api/partner/businesses/open"
      ? Response.json({ error: "Business not found.", code: "business_not_found" }, { status: 404 })
      : Response.json({ businesses: [pier] }));
    await userEvent.click(await screen.findByRole("button", { name: "businesses.open.label" }));
    await waitFor(() => expect(fixture.toast.error).toHaveBeenCalledWith("businesses.open.failed"));
    expect(assign).not.toHaveBeenCalled();
    expect(fixture.telemetry!.events).toEqual([]);
  });

  it("says why a business wasn't created, and records nothing", async () => {
    renderAs("owner", (_url, init) => init?.method === "POST"
      ? Response.json({ error: "You need your own domain before you can create a business.", code: "partner_domain_required" }, { status: 409 })
      : Response.json({ businesses: [] }));
    await screen.findByText("businesses.empty.title");
    await userEvent.click(screen.getByRole("button", { name: "businesses.create.action" }));
    await userEvent.type(await screen.findByLabelText("businesses.create.nameLabel"), "Harbor Dental");
    await userEvent.type(screen.getByLabelText("businesses.create.ownerLabel"), "owner@harbor.test");
    await userEvent.click(screen.getByRole("button", { name: "businesses.create.submit" }));
    expect((await screen.findByRole("alert")).textContent).toBe("businesses.create.errors.domainRequired");
    expect(fixture.telemetry!.events).toEqual([]);
  });

  it("says when the owner entered is someone on the partner's team", async () => {
    renderAs("admin", (_url, init) => init?.method === "POST"
      ? Response.json({ error: "The owner can't be someone on your team. Your team works in the business from the console.", code: "owner_on_partner_team" }, { status: 409 })
      : Response.json({ businesses: [] }));
    await screen.findByText("businesses.empty.title");
    await userEvent.click(screen.getByRole("button", { name: "businesses.create.action" }));
    await userEvent.type(await screen.findByLabelText("businesses.create.nameLabel"), "Harbor Dental");
    await userEvent.type(screen.getByLabelText("businesses.create.ownerLabel"), "member@acme.test");
    await userEvent.click(screen.getByRole("button", { name: "businesses.create.submit" }));
    expect((await screen.findByRole("alert")).textContent).toBe("businesses.create.errors.ownerOnTeam");
    expect(fixture.telemetry!.events).toEqual([]);
  });
});
