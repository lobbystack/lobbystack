// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ partner: { partnerId: "partner", name: "Bright Desk", role: "admin" as "owner" | "admin" | "member" } }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: "en" }, t: (key: string) => key }) }));
vi.mock("@/components/partner-shell", () => ({ useConsolePartner: () => fixture.partner }));
vi.mock("@/components/branding-provider", () => ({ useBranding: () => ({ appName: "Front Desk", logoUrl: null, ready: true }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { PartnerBrandingSurface } from "./partner-branding-surface";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const settings = (role: "owner" | "admin" | "member", extra: Record<string, unknown> = {}) => ({
  role,
  name: "Bright Desk",
  subdomain: "bright.portal.example.test",
  subdomainUrl: "https://bright.portal.example.test",
  logoUrl: "/api/branding/logo?partner=partner&v=abc",
  faviconUrl: null,
  color: "#0f766e",
  termsUrl: "https://bright.example.test/terms",
  privacyUrl: null,
  supportUrl: null,
  supportEmail: "help@bright.example.test",
  ...extra,
});

function renderAs(role: "owner" | "admin" | "member", extra: Record<string, unknown> = {}) {
  fixture.partner = { ...fixture.partner, role };
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => Response.json(init?.method === "PUT" ? { ...settings(role, extra), ...JSON.parse(String(init.body)), logoUrl: null } : settings(role, extra)));
  vi.stubGlobal("fetch", fetchMock);
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><PartnerBrandingSurface /></QueryClientProvider>);
  return fetchMock;
}

describe("the partner console's Branding & domain page", () => {
  it("shows the partner's subdomain and saved brand, read from the partner the console is open on", async () => {
    const fetchMock = renderAs("admin");
    expect(await screen.findByText("bright.portal.example.test")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith("/api/partner/branding?partnerId=partner", expect.anything());
    expect(screen.getByRole("link", { name: "branding.domain.open" }).getAttribute("href")).toBe("https://bright.portal.example.test");
    expect((screen.getByLabelText("branding.nameLabel") as HTMLInputElement).value).toBe("Bright Desk");
    expect((screen.getByLabelText("branding.links.supportEmail") as HTMLInputElement).value).toBe("help@bright.example.test");
  });

  it("says when the partner has no subdomain yet", async () => {
    renderAs("owner", { subdomain: null, subdomainUrl: null });
    expect(await screen.findByText("branding.domain.none")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "branding.domain.open" })).toBeNull();
  });

  it("shows a member the brand with no way to change it", async () => {
    renderAs("member");
    await screen.findByText("bright.portal.example.test");
    expect((screen.getByLabelText("branding.nameLabel") as HTMLInputElement).disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "branding.save" })).toBeNull();
    expect(screen.queryByRole("button", { name: "branding.logoRemove" })).toBeNull();
    expect(screen.getByText("branding.membersCantEdit")).toBeTruthy();
  });

  it("saves the fields for the partner the console is open on, removing the logo when asked and keeping images left alone", async () => {
    const fetchMock = renderAs("admin");
    const name = await screen.findByLabelText("branding.nameLabel");
    await userEvent.clear(name);
    await userEvent.type(name, "Brighter Desk");
    await userEvent.click(screen.getByRole("button", { name: "branding.logoRemove" }));
    await userEvent.click(screen.getByRole("button", { name: "branding.save" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/partner/branding", expect.objectContaining({ method: "PUT" })));
    const body = JSON.parse(String(fetchMock.mock.calls.find(([, init]) => init?.method === "PUT")![1]!.body));
    expect(body).toEqual({ partnerId: "partner", name: "Brighter Desk", color: "#0f766e", termsUrl: "https://bright.example.test/terms", privacyUrl: "", supportUrl: "", supportEmail: "help@bright.example.test", logo: null });
  });

  it("catches a color it can't use before saving", async () => {
    const fetchMock = renderAs("admin");
    const color = await screen.findByLabelText("branding.colorLabel");
    await userEvent.clear(color);
    await userEvent.type(color, "teal");
    await userEvent.click(screen.getByRole("button", { name: "branding.save" }));
    expect(await screen.findByText("branding.errors.color")).toBeTruthy();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PUT")).toBe(false);
  });
});
