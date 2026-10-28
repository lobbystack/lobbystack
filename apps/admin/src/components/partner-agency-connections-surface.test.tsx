// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ partner: { partnerId: "partner", name: "Bright Desk", role: "member" as "owner" | "admin" | "member" } }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: "en", resolvedLanguage: "en" }, t: (key: string) => key }) }));
vi.mock("@/components/partner-shell", () => ({ useConsolePartner: () => fixture.partner }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { PartnerAgencyConnectionsSurface } from "./partner-agency-connections-surface";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("the console's agency connections", () => {
  it("lists the connections the person may see, and disconnects one after they confirm", async () => {
    const user = userEvent.setup();
    let grants = [{ id: "g1", clientId: "https://claude.ai/oauth/metadata", clientName: "Claude", clientUri: null, clientDiscovery: "cimd", scopes: ["partner:read", "calls:read"], grantedBy: { userId: "u1", name: "Ada", email: "ada@example.test" }, createdAt: "2026-10-27T12:00:00.000Z", updatedAt: null, lastUsedAt: null }];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "DELETE") { grants = []; return Response.json({ ok: true }); }
      if (url.startsWith("/api/partner/oauth-grants")) return Response.json({ grants });
      return Response.json({});
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><PartnerAgencyConnectionsSurface /></QueryClientProvider>);
    expect(await screen.findByText("Claude")).toBeTruthy();
    expect(screen.getByText("agencyConnections.descriptionOwn")).toBeTruthy();
    // One line about the connection, without its permissions or client id, and no Update.
    expect(screen.getByText("agencyConnections.connectedBy")).toBeTruthy();
    expect(screen.getByText("agencyConnections.neverUsed")).toBeTruthy();
    expect(screen.queryByText("partner:read")).toBeNull();
    expect(screen.queryByText("https://claude.ai/oauth/metadata")).toBeNull();
    expect(screen.queryByRole("button", { name: /update/ })).toBeNull();
    expect(screen.getByRole("button", { name: "agencyConnections.revoke.action" }).className).toContain("text-destructive");
    expect(fetchMock).toHaveBeenCalledWith("/api/partner/oauth-grants?partnerId=partner", expect.anything());
    await user.click(screen.getByRole("button", { name: "agencyConnections.revoke.action" }));
    await user.click(screen.getByRole("button", { name: "agencyConnections.revoke.confirm" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/partner/oauth-grants/g1?partnerId=partner", expect.objectContaining({ method: "DELETE" })));
    expect(await screen.findByText("agencyConnections.empty")).toBeTruthy();
  });
});
