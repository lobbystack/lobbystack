// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ partner: { partnerId: "partner", name: "Bright Desk", role: "admin" as "owner" | "admin" | "member" }, namespaces: [] as string[] }));
vi.mock("react-i18next", () => ({ useTranslation: (namespace: string) => { fixture.namespaces.push(namespace); return { i18n: { language: "en", resolvedLanguage: "en" }, t: (key: string) => key }; } }));
vi.mock("@/components/partner-shell", () => ({ useConsolePartner: () => fixture.partner }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { PartnerApiKeysSurface } from "./partner-api-keys-surface";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); fixture.namespaces = []; });

const record = (overrides: Record<string, unknown> = {}) => ({ id: "k1", name: "Client onboarding", prefix: "lsp_1a2b3c4d", scopes: ["business:read", "businesses:create"], createdAt: "2026-10-26T12:00:00.000Z", createdBy: { userId: "owner", name: "Olive", email: "olive@example.test" }, lastUsedAt: null, revokedAt: null, ...overrides });

function renderAs(role: "owner" | "admin" | "member") {
  fixture.partner = { ...fixture.partner, role };
  let keys: unknown[] = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "POST") {
      const body = JSON.parse(String(init.body)) as { name: string; scopes: string[] };
      const platformKey = record({ name: body.name, scopes: body.scopes });
      keys = [platformKey];
      return Response.json({ key: "lsp_1a2b3c4d_secretsecretsecretsecretsecret12", platformKey }, { status: 201 });
    }
    if (init?.method === "DELETE") {
      keys = [record({ revokedAt: "2026-10-26T13:00:00.000Z" })];
      return Response.json({ platformKey: keys[0] });
    }
    if (url.startsWith("/api/partner/platform-keys")) return Response.json({ keys });
    return Response.json({});
  });
  vi.stubGlobal("fetch", fetchMock);
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><PartnerApiKeysSurface /></QueryClientProvider>);
  return fetchMock;
}

describe("the partner console's API keys page", () => {
  it("tells a member that only owners and admins manage keys, and reads none", async () => {
    const fetchMock = renderAs("member");
    expect(await screen.findByText("apiKeys.restricted.title")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(fixture.namespaces).toContain("partner");
  });

  it("makes a platform key for the partner, offers the platform-only scopes, and shows the key once", async () => {
    const user = userEvent.setup();
    const fetchMock = renderAs("admin");
    expect(await screen.findByText("apiKeys.empty")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith("/api/partner/platform-keys?partnerId=partner", expect.anything());
    await user.click(screen.getByRole("button", { name: /apiKeys.create.action/ }));
    await user.type(screen.getByLabelText("apiKeys.create.nameLabel"), "Client onboarding");
    expect(screen.getByText("apiKeys.scopes.businesses_create")).toBeTruthy();
    expect(screen.getByText("apiKeys.scopes.users_create")).toBeTruthy();
    await user.click(screen.getByRole("checkbox", { name: /businesses:create/ }));
    await user.click(screen.getByRole("button", { name: "apiKeys.create.submit" }));
    expect((await screen.findByTestId("secret-value")).textContent).toBe("lsp_1a2b3c4d_secretsecretsecretsecretsecret12");
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(post?.[0]).toBe("/api/partner/platform-keys");
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({ partnerId: "partner", name: "Client onboarding", scopes: ["calls:read", "contacts:read", "appointments:read", "messages:read", "business:read", "businesses:create"] });
    await user.click(screen.getByRole("button", { name: "apiKeys.created.done" }));
    await waitFor(() => expect(screen.queryByTestId("secret-value")).toBeNull());
    expect(await screen.findByText("lsp_1a2b3c4d…")).toBeTruthy();
  });

  it("revokes a key after the owner confirms", async () => {
    const user = userEvent.setup();
    const fetchMock = renderAs("owner");
    await user.click(await screen.findByRole("button", { name: /apiKeys.create.action/ }));
    await user.type(screen.getByLabelText("apiKeys.create.nameLabel"), "Client onboarding");
    await user.click(screen.getByRole("button", { name: "apiKeys.create.submit" }));
    await user.click(await screen.findByRole("button", { name: "apiKeys.created.done" }));
    await user.click(await screen.findByRole("button", { name: "apiKeys.revoke.action" }));
    await user.click(await screen.findByRole("button", { name: "apiKeys.revoke.confirm" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/partner/platform-keys/k1?partnerId=partner", expect.objectContaining({ method: "DELETE" })));
    expect(await screen.findByText("apiKeys.revoked")).toBeTruthy();
  });
});
