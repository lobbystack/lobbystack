// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ALL_CAPABILITIES, BusinessCapabilitiesProvider } from "./business-capabilities-provider";
import { LiveConnectedAppsSurface } from "./live-connected-apps-surface";
import { OAuthConsentSurface } from "./oauth-consent-surface";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string, values?: Record<string, string>) => values ? `${key} ${JSON.stringify(values)}` : key, i18n: { language: "en", resolvedLanguage: "en" } }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("next/link", () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const consentProps = {
  kind: "consent" as const,
  oauthQuery: "client_id=abc&scope=calls%3Aread+appointments%3Awrite+offline_access&sig=s",
  client: { name: "Claude", host: "claude.ai" },
  businesses: [{ businessId: "b1", name: "Maple Dental", active: false }, { businessId: "b2", name: "Harbour Physio", active: true }],
  scopes: ["calls:read", "appointments:write"],
};

describe("OAuth consent screen", () => {
  it("posts the chosen business and permissions, then follows the redirect", async () => {
    const user = userEvent.setup();
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });
    const fetchMock = vi.fn(async () => Response.json({ url: "https://claude.ai/api/mcp/auth_callback?code=abc" }));
    vi.stubGlobal("fetch", fetchMock);
    render(<OAuthConsentSurface {...consentProps} />);
    expect((screen.getByLabelText("oauthConsent.businessLabel") as HTMLSelectElement).value).toBe("b2");
    await user.selectOptions(screen.getByLabelText("oauthConsent.businessLabel"), "b1");
    await user.click(screen.getByRole("checkbox", { name: /oauthConsent.scopes.appointments_write/ }));
    await user.click(screen.getByRole("button", { name: "oauthConsent.allow" }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("https://claude.ai/api/mcp/auth_callback?code=abc"));
    expect(JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body))).toEqual({ oauth_query: consentProps.oauthQuery, accept: true, business_id: "b1", scopes: ["calls:read"] });
    expect(screen.getByText(/oauthConsent.requestedBy/)).toBeTruthy();
  });

  it("asks for at least one permission", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<OAuthConsentSurface {...consentProps} scopes={["calls:read"]} />);
    await user.click(screen.getByRole("checkbox", { name: /oauthConsent.scopes.calls_read/ }));
    await user.click(screen.getByRole("button", { name: "oauthConsent.allow" }));
    expect(screen.getByRole("alert").textContent).toBe("oauthConsent.noScopes");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("explains when the person has no business they can connect", () => {
    render(<OAuthConsentSurface {...consentProps} businesses={[]} />);
    expect(screen.getByText("oauthConsent.noBusinesses.title")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "oauthConsent.allow" })).toBeNull();
  });
});

describe("OAuth consent screen for an agency", () => {
  const agencyProps = { ...consentProps, partners: [{ partnerId: "p1", name: "Northwind Agency", scopes: ["partner:read", "partner.demos:write", "calls:read"] }] };

  it("offers the person's agencies, with the partner permissions, and posts the partner", async () => {
    const user = userEvent.setup();
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });
    const fetchMock = vi.fn(async () => Response.json({ url: "https://claude.ai/api/mcp/auth_callback?code=abc" }));
    vi.stubGlobal("fetch", fetchMock);
    render(<OAuthConsentSurface {...agencyProps} />);
    const select = screen.getByLabelText("oauthConsent.connectToLabel") as HTMLSelectElement;
    expect(select.value).toBe("b2");
    expect(screen.queryByRole("checkbox", { name: /partner:read/ })).toBeNull();
    await user.selectOptions(select, "partner:p1");
    expect(screen.getByRole("checkbox", { name: /oauthConsent.scopes.partner_read/ })).toBeTruthy();
    expect(screen.queryByRole("checkbox", { name: /appointments:write/ })).toBeNull();
    await user.click(screen.getByRole("checkbox", { name: /oauthConsent.scopes.partner_demos_write/ }));
    await user.click(screen.getByRole("button", { name: "oauthConsent.allow" }));
    await waitFor(() => expect(assign).toHaveBeenCalled());
    expect(JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body))).toEqual({ oauth_query: consentProps.oauthQuery, accept: true, partner_id: "p1", scopes: ["partner:read", "calls:read"] });
  });

  it("lets someone with no business of their own connect an agency", () => {
    render(<OAuthConsentSurface {...agencyProps} businesses={[]} />);
    expect(screen.queryByText("oauthConsent.noBusinesses.title")).toBeNull();
    expect((screen.getByLabelText("oauthConsent.connectToLabel") as HTMLSelectElement).value).toBe("partner:p1");
    expect(screen.getByRole("button", { name: "oauthConsent.allow" })).toBeTruthy();
  });
});

describe("the MCP connections under Settings > API keys", () => {
  it("lists grants and disconnects one", async () => {
    const user = userEvent.setup();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    client.setQueryData(["businesses"], { businesses: [{ businessId: "business-1", name: "Salon", active: true, role: "business_owner" }] });
    let grants = [{ id: "g1", clientId: "https://claude.ai/oauth/metadata", clientName: "Claude", clientUri: null, clientDiscovery: "cimd", scopes: ["calls:read"], grantedBy: { userId: "u1", name: "Ada", email: "ada@example.com" }, createdAt: "2026-09-27T12:00:00.000Z", updatedAt: null, lastUsedAt: null }];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "DELETE") { grants = []; return Response.json({ ok: true }); }
      if (url.startsWith("/api/oauth-grants")) return Response.json({ grants });
      return Response.json({});
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<QueryClientProvider client={client}><LiveConnectedAppsSurface /></QueryClientProvider>);
    expect(await screen.findByText("Claude")).toBeTruthy();
    expect(screen.queryByText("calls:read")).toBeNull();
    expect(screen.getByText(/^connectedApps.connectedBy .*"name":"Ada"/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "connectedApps.revoke.action" }).className).toContain("text-destructive");
    await user.click(screen.getByRole("button", { name: "connectedApps.revoke.action" }));
    await user.click(screen.getByRole("button", { name: "connectedApps.revoke.confirm" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/oauth-grants/g1?businessId=business-1", expect.objectContaining({ method: "DELETE" })));
    expect(await screen.findByText("connectedApps.empty")).toBeTruthy();
  });
});

describe("the MCP connections section for someone who can't manage them", () => {
  it("shows nothing to a viewer, or in a business without MCP, and reads no connections", async () => {
    for (const [role, capabilities] of [["viewer", ALL_CAPABILITIES], ["business_owner", ALL_CAPABILITIES.filter((capability) => capability !== "mcp")]] as const) {
      const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
      client.setQueryData(["businesses"], { businesses: [{ businessId: "business-1", name: "Salon", active: true, role, capabilities }] });
      const fetchMock = vi.fn(async () => Response.json({ grants: [] }));
      vi.stubGlobal("fetch", fetchMock);
      const view = render(<QueryClientProvider client={client}><BusinessCapabilitiesProvider initial={capabilities}><LiveConnectedAppsSurface /></BusinessCapabilitiesProvider></QueryClientProvider>);
      expect(view.container.textContent).toBe("");
      expect(fetchMock).not.toHaveBeenCalled();
      view.unmount();
    }
  });
});
