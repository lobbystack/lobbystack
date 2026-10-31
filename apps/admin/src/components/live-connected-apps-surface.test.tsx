// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BusinessCapabilitiesProvider } from "./business-capabilities-provider";
import { LiveConnectedAppsSurface } from "./live-connected-apps-surface";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en", resolvedLanguage: "en" } }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.forEach((client) => client.clear()); clients.length = 0; vi.unstubAllGlobals(); });

const skeletons = () => document.querySelectorAll('[data-slot="skeleton"]').length;

function renderSurface({ role = "business_owner", workspace = true, grants, capabilities }: { role?: string; workspace?: boolean; grants?: unknown; capabilities?: readonly ("activity" | "setup" | "team" | "billing" | "api_keys" | "mcp")[] }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } }); clients.push(client);
  if (workspace) client.setQueryData(["businesses"], { businesses: [{ businessId: "business-1", name: "Salon", active: true, role }] });
  if (grants) client.setQueryData(["oauth-grants", "business-1"], grants);
  else vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
  const surface = <LiveConnectedAppsSurface />;
  render(<QueryClientProvider client={client}>{capabilities ? <BusinessCapabilitiesProvider initial={capabilities}>{surface}</BusinessCapabilitiesProvider> : surface}</QueryClientProvider>);
}

describe("connected apps loading states", () => {
  it.each([["the workspace", false], ["the connections", true]])("shows the section as a placeholder while %s load", (_, workspace) => {
    renderSurface({ workspace });
    expect(screen.getByText("connectedApps.title").className).toContain("invisible");
    expect(screen.getByText("connectedApps.description").className).toContain("invisible");
    expect(document.querySelectorAll("li").length).toBe(2);
    // A title and a description, then a name, a line and one button for each of two rows.
    expect(skeletons()).toBe(2 + 2 * 3);
    expect(screen.queryByRole("heading")).toBeNull();
  });

  it("holds no place for the section while the workspace loads when the plan has no MCP", () => {
    renderSurface({ workspace: false, capabilities: ["activity"] });
    expect(document.body.textContent).toBe("");
  });

  it("drops the section once the workspace shows the person can't manage it", () => {
    renderSurface({ role: "viewer", grants: { grants: [] } });
    expect(document.body.textContent).toBe("");
  });

  it("turns the section real together once the connections have loaded", () => {
    renderSurface({ grants: { grants: [] } });
    expect(screen.getByRole("heading", { name: "connectedApps.title" })).toBeTruthy();
    expect(screen.getByText("connectedApps.empty")).toBeTruthy();
    expect(skeletons()).toBe(0);
  });
});
