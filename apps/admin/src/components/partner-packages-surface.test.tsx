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
vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: "en" }, t: (key: string, options?: Record<string, unknown>) => options?.amount !== undefined ? `${key}:${String(options.amount)}` : key }) }));
vi.mock("next/navigation", () => ({ usePathname: () => "/partner/partner/packages" }));
vi.mock("@/components/partner-shell", () => ({ useConsolePartner: () => fixture.partner }));
vi.mock("@/components/product-analytics", () => ({ useTelemetry: () => fixture.telemetry!.telemetry }));
vi.mock("sonner", () => ({ toast: fixture.toast }));

import { PartnerPackagesSurface } from "./partner-packages-surface";

const frontDesk = { packageId: "pkg-front", name: "Front desk", currency: "CAD", monthlyPriceMinor: 14900, setupFeeMinor: 5000, allowance: { voiceMinutes: 300, chats: 1000 }, onConnectedAccount: true, createdAt: "2026-10-20T12:00:00.000Z" };
const active = { configured: true, status: "active", currency: "CAD" };
const listing = (packages: unknown[], stripe: Record<string, unknown> = active, role = "admin") => ({ role, stripe, packages });

beforeEach(() => { fixture.telemetry = createRecordedBrowserTelemetry(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

function renderAs(role: "owner" | "admin" | "member", respond: (url: string, init?: RequestInit) => Response) {
  fixture.partner = { ...fixture.partner, role };
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => respond(url, init));
  vi.stubGlobal("fetch", fetchMock);
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><PartnerPackagesSurface /></QueryClientProvider>);
  return fetchMock;
}

const sent = (fetchMock: ReturnType<typeof vi.fn>, method: string) => fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === method).map(([, init]) => JSON.parse(String((init as RequestInit).body)) as Record<string, unknown>);

describe("the partner console's Packages page", () => {
  it("lists each package's price, setup fee and allowance in its currency", async () => {
    const fetchMock = renderAs("admin", () => Response.json(listing([frontDesk, { ...frontDesk, packageId: "pkg-basic", name: "Basic", setupFeeMinor: null, onConnectedAccount: false }])));
    const rows = await screen.findAllByRole("row");
    expect(fetchMock).toHaveBeenCalledWith("/api/partner/packages?partnerId=partner", expect.anything());
    expect(within(rows[1]!).getByText("Front desk")).toBeTruthy();
    expect(within(rows[1]!).getByText("packages.perMonth:CAD 149")).toBeTruthy();
    expect(within(rows[1]!).getByText("packages.setupFee:CAD 50")).toBeTruthy();
    expect(within(rows[1]!).getByText("packages.minutes:300")).toBeTruthy();
    expect(within(rows[1]!).getByText("packages.chats:1,000")).toBeTruthy();
    expect(within(rows[2]!).getByText("packages.noSetupFee")).toBeTruthy();
    expect(within(rows[2]!).getByText("packages.oldAccount")).toBeTruthy();
    expect(screen.getByRole("button", { name: "packages.create.action" })).toBeTruthy();
  });

  it("creates a package from the amounts typed, in the account's currency, and records web.partner.package_created", async () => {
    const packages: unknown[] = [];
    const fetchMock = renderAs("owner", (_url, init) => {
      if (init?.method === "POST") {
        packages.push(frontDesk);
        return Response.json(frontDesk, { status: 201 });
      }
      return Response.json(listing(packages, active, "owner"));
    });
    await screen.findByText("packages.empty.title");
    await userEvent.click(screen.getByRole("button", { name: "packages.create.action" }));
    await userEvent.type(await screen.findByLabelText("packages.create.nameLabel"), "Front desk");
    await userEvent.type(screen.getByLabelText("packages.create.priceLabel"), "149");
    await userEvent.type(screen.getByLabelText("packages.create.setupFeeLabel"), "50.00");
    await userEvent.type(screen.getByLabelText("packages.create.minutesLabel"), "300");
    await userEvent.type(screen.getByLabelText("packages.create.chatsLabel"), "1,000");
    await userEvent.click(screen.getByRole("button", { name: "packages.create.submit" }));

    await waitFor(() => fixture.telemetry!.expectEvent("web.partner.package_created", { partnerId: "partner", packageId: "pkg-front", currency: "CAD", setupFee: true, pathname: "/partner/partner/packages" }));
    expect(sent(fetchMock, "POST")).toEqual([{ partnerId: "partner", name: "Front desk", monthlyPriceMinor: 14900, setupFeeMinor: 5000, voiceMinutes: 300, chats: 1000 }]);
    expect(fixture.toast.success).toHaveBeenCalledWith("packages.create.created");
    expect(await screen.findByText("Front desk")).toBeTruthy();
  });

  it("checks the amounts before sending, and says why the server refused a package", async () => {
    const fetchMock = renderAs("admin", (_url, init) => init?.method === "POST"
      ? Response.json({ error: "Connect your Stripe account before you sell packages.", code: "stripe_not_connected" }, { status: 409 })
      : Response.json(listing([])));
    await screen.findByText("packages.empty.title");
    await userEvent.click(screen.getByRole("button", { name: "packages.create.action" }));
    await userEvent.type(await screen.findByLabelText("packages.create.nameLabel"), "Front desk");
    await userEvent.type(screen.getByLabelText("packages.create.priceLabel"), "0");
    await userEvent.click(screen.getByRole("button", { name: "packages.create.submit" }));
    expect((await screen.findByRole("alert")).textContent).toBe("packages.create.errors.invalidPrice");
    expect(sent(fetchMock, "POST")).toEqual([]);

    await userEvent.clear(screen.getByLabelText("packages.create.priceLabel"));
    await userEvent.type(screen.getByLabelText("packages.create.priceLabel"), "149");
    await userEvent.type(screen.getByLabelText("packages.create.minutesLabel"), "2.5");
    await userEvent.click(screen.getByRole("button", { name: "packages.create.submit" }));
    expect((await screen.findByRole("alert")).textContent).toBe("packages.create.errors.invalidAllowance");

    await userEvent.clear(screen.getByLabelText("packages.create.minutesLabel"));
    await userEvent.type(screen.getByLabelText("packages.create.minutesLabel"), "300");
    await userEvent.type(screen.getByLabelText("packages.create.chatsLabel"), "0");
    await userEvent.click(screen.getByRole("button", { name: "packages.create.submit" }));
    await waitFor(async () => expect((await screen.findByRole("alert")).textContent).toBe("packages.create.errors.notConnected"));
    expect(fixture.telemetry!.events).toEqual([]);
  });

  it("asks an owner to connect Stripe first, and an admin to ask an owner, with nothing to create", async () => {
    renderAs("owner", () => Response.json(listing([], { configured: true, status: "not_connected", currency: null }, "owner")));
    expect(await screen.findByText("packages.connectFirst.owner")).toBeTruthy();
    expect(screen.getByRole("link", { name: "packages.openStripe" }).getAttribute("href")).toBe("/partner/partner/payments");
    expect(screen.queryByRole("button", { name: "packages.create.action" })).toBeNull();
    cleanup();

    renderAs("admin", () => Response.json(listing([], { configured: true, status: "onboarding", currency: null })));
    expect(await screen.findByText("packages.connectFirst.admin")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "packages.openStripe" })).toBeNull();
    cleanup();

    renderAs("admin", () => Response.json(listing([], { configured: false, status: "not_connected", currency: null })));
    expect(await screen.findByText("packages.notConfigured")).toBeTruthy();
  });

  it("renames a package and takes one off sale", async () => {
    const fetchMock = renderAs("admin", (_url, init) => {
      if (init?.method === "PATCH") return Response.json({ ...frontDesk, name: "Front desk plus" });
      if (init?.method === "DELETE") return Response.json({ ok: true });
      return Response.json(listing([frontDesk]));
    });
    await userEvent.click(await screen.findByRole("button", { name: "packages.moreOptions" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "packages.rename.action" }));
    const name = await screen.findByLabelText("packages.create.nameLabel");
    await userEvent.clear(name);
    await userEvent.type(name, "Front desk plus");
    await userEvent.click(screen.getByRole("button", { name: "packages.rename.submit" }));
    await waitFor(() => expect(sent(fetchMock, "PATCH")).toEqual([{ partnerId: "partner", packageId: "pkg-front", name: "Front desk plus" }]));

    await userEvent.click(await screen.findByRole("button", { name: "packages.moreOptions" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "packages.archive.action" }));
    await userEvent.click(await screen.findByRole("button", { name: "packages.archive.confirm" }));
    await waitFor(() => expect(sent(fetchMock, "DELETE")).toEqual([{ partnerId: "partner", packageId: "pkg-front" }]));
    expect(fixture.toast.success).toHaveBeenCalledWith("packages.archive.done");
  });

  it("shows members that only owners and admins see packages, without asking the server", async () => {
    const fetchMock = renderAs("member", () => Response.json(listing([frontDesk])));
    expect(await screen.findByText("packages.managersOnly")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
