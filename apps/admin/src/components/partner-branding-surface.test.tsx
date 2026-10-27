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

type Domains = { customDomains?: "available" | "paid_tier_required" | "unavailable"; custom?: Record<string, unknown> | null };

const pendingDomain = {
  hostname: "app.bright.example",
  status: "pending",
  records: [
    { type: "CNAME", name: "app.bright.example", value: "edge.portal.example.test", verified: false },
    { type: "TXT", name: "_domain-verification.app.bright.example", value: "0123456789abcdef0123456789abcdef", verified: true },
  ],
  errors: ["custom hostname does not CNAME to this zone."],
  checkedAt: "2026-10-26T12:00:00.000Z",
  url: null,
  taken: false,
};

function renderAs(role: "owner" | "admin" | "member", extra: Record<string, unknown> = {}, initial: Domains = {}) {
  fixture.partner = { ...fixture.partner, role };
  let current = { customDomains: "available", custom: null, ...initial };
  const domainsBody = () => ({ role, subdomain: settings(role, extra).subdomain, subdomainUrl: settings(role, extra).subdomainUrl, ...current });
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.startsWith("/api/partner/domain")) {
      if (init?.method === "POST") current = { ...current, custom: { ...pendingDomain, hostname: JSON.parse(String(init.body)).hostname, records: [], errors: [], checkedAt: null } };
      if (init?.method === "DELETE") current = { ...current, custom: null };
      return Response.json(domainsBody());
    }
    return Response.json(init?.method === "PUT" ? { ...settings(role, extra), ...JSON.parse(String(init.body)), logoUrl: null } : settings(role, extra));
  });
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

  it("doesn't point to a subdomain above when custom domains are off and the partner has none", async () => {
    renderAs("owner", { subdomain: null, subdomainUrl: null }, { customDomains: "unavailable" });
    expect(await screen.findByText("branding.domain.own.unavailableNoSubdomain")).toBeTruthy();
    expect(screen.queryByText("branding.domain.own.unavailable")).toBeNull();
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

  it("connects a domain of the partner's own as the domain it is, then shows it waiting", async () => {
    const fetchMock = renderAs("admin");
    const input = await screen.findByLabelText("branding.domain.own.label");
    await userEvent.type(input, "https://App.Bright.Example/");
    await userEvent.click(screen.getByRole("button", { name: "branding.domain.own.connect" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/partner/domain", expect.objectContaining({ method: "POST" })));
    const body = JSON.parse(String(fetchMock.mock.calls.find(([url, init]) => url === "/api/partner/domain" && init?.method === "POST")![1]!.body));
    expect(body).toEqual({ partnerId: "partner", hostname: "app.bright.example" });
    expect(await screen.findByText("branding.domain.own.status.pending")).toBeTruthy();
    expect(screen.getByText("branding.domain.own.settingUp")).toBeTruthy();
    // The brand's form never sends the domain.
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PUT")).toBe(false);
  });

  it("refuses an apex or anything that isn't a hostname before sending it", async () => {
    const fetchMock = renderAs("owner");
    await userEvent.type(await screen.findByLabelText("branding.domain.own.label"), "brightexample.com");
    await userEvent.click(screen.getByRole("button", { name: "branding.domain.own.connect" }));
    expect(await screen.findByText("branding.domain.own.errors.invalid")).toBeTruthy();
    expect(fetchMock.mock.calls.some(([url, init]) => url === "/api/partner/domain" && init?.method === "POST")).toBe(false);
  });

  it("lists the DNS records to add, whether each checks out, and what the provider says", async () => {
    renderAs("admin", {}, { custom: pendingDomain });
    expect(await screen.findByText("branding.domain.own.pendingHelp")).toBeTruthy();
    expect(screen.getByText("CNAME")).toBeTruthy();
    expect(screen.getByText("edge.portal.example.test")).toBeTruthy();
    expect(screen.getByText("branding.domain.own.records.waiting")).toBeTruthy();
    // The TXT record that proves the partner controls the domain, found already.
    expect(screen.getByText("_domain-verification.app.bright.example")).toBeTruthy();
    expect(screen.getByText("0123456789abcdef0123456789abcdef")).toBeTruthy();
    expect(screen.getByText("branding.domain.own.records.verified")).toBeTruthy();
    expect(screen.getByText("custom hostname does not CNAME to this zone.")).toBeTruthy();
    expect(screen.getByText("branding.domain.own.checkedAt")).toBeTruthy();
  });

  it("says when another dashboard connected the domain first, with nothing left to add", async () => {
    renderAs("owner", {}, { custom: { ...pendingDomain, status: "failed", errors: [], taken: true } });
    expect(await screen.findByText("branding.domain.own.takenHelp")).toBeTruthy();
    expect(screen.queryByText("branding.domain.own.failedHelp")).toBeNull();
    expect(screen.queryByText("CNAME")).toBeNull();
    expect(screen.getByRole("button", { name: "branding.domain.own.remove" })).toBeTruthy();
  });

  it("links to an active domain, and removes it after asking", async () => {
    const fetchMock = renderAs("owner", {}, { custom: { ...pendingDomain, status: "active", records: [{ ...pendingDomain.records[0], verified: true }], errors: [], url: "https://app.bright.example" } });
    expect(await screen.findByText("branding.domain.own.status.active")).toBeTruthy();
    expect(screen.getAllByRole("link", { name: "branding.domain.open" }).map((link) => link.getAttribute("href"))).toEqual(["https://bright.portal.example.test", "https://app.bright.example"]);
    // Nothing left to add.
    expect(screen.queryByText("CNAME")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "branding.domain.own.remove" }));
    expect(await screen.findByText("branding.domain.own.removeTitle")).toBeTruthy();
    const confirm = screen.getAllByRole("button", { name: "branding.domain.own.remove" }).at(-1)!;
    await userEvent.click(confirm);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/partner/domain", expect.objectContaining({ method: "DELETE" })));
    expect(await screen.findByLabelText("branding.domain.own.label")).toBeTruthy();
  });

  it("tells a free tier's owner to choose a tier and its admins to ask an owner, and says the dashboard can't connect a domain where the deployment can't issue certificates", async () => {
    renderAs("owner", {}, { customDomains: "paid_tier_required" });
    expect(await screen.findByText("branding.domain.own.paidTier")).toBeTruthy();
    expect(screen.getByRole("link", { name: "branding.domain.own.chooseTier" }).getAttribute("href")).toBe("/partner/partner/billing");
    expect(screen.queryByLabelText("branding.domain.own.label")).toBeNull();
    cleanup();
    renderAs("admin", {}, { customDomains: "paid_tier_required" });
    expect(await screen.findByText("branding.domain.own.paidTierAskOwner")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "branding.domain.own.chooseTier" })).toBeNull();
    cleanup();
    renderAs("owner", {}, { customDomains: "unavailable" });
    await screen.findByText("bright.portal.example.test");
    expect(screen.getByText("branding.domain.own.unavailable")).toBeTruthy();
    expect(screen.queryByLabelText("branding.domain.own.label")).toBeNull();
  });

  it("shows a member the partner's domain with no way to change it", async () => {
    renderAs("member", {}, { custom: pendingDomain });
    expect(await screen.findByText("branding.domain.own.status.pending")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "branding.domain.own.remove" })).toBeNull();
    cleanup();
    renderAs("member");
    expect(await screen.findByText("branding.domain.own.membersCantEdit")).toBeTruthy();
    expect(screen.queryByLabelText("branding.domain.own.label")).toBeNull();
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
