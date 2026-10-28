// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
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

function renderAs(role: "owner" | "admin" | "member", initialKeys: Array<Record<string, unknown>> = []) {
  fixture.partner = { ...fixture.partner, role };
  let keys: Array<Record<string, unknown>> = initialKeys;
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "PATCH") {
      const { partnerId: _partnerId, ...body } = JSON.parse(String(init.body)) as { partnerId: string; name: string; scopes: string[] };
      keys = keys.map((key) => ({ ...key, ...body }));
      return Response.json({ platformKey: keys[0] });
    }
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
    expect(await screen.findByText("Client onboarding")).toBeTruthy();
    expect(screen.queryByText(/lsp_1a2b3c4d/)).toBeNull();
  });

  it("offers the partner scopes, and the billing ones to owners only", async () => {
    const user = userEvent.setup();
    renderAs("admin");
    await user.click(await screen.findByRole("button", { name: /apiKeys.create.action/ }));
    expect(screen.getByText("apiKeys.scopes.partner_read")).toBeTruthy();
    expect(screen.getByText("apiKeys.scopes.partner_team_write")).toBeTruthy();
    expect(screen.queryByText("apiKeys.scopes.partner_billing_read")).toBeNull();
    expect(screen.queryByText("apiKeys.scopes.partner_billing_write")).toBeNull();
    cleanup();
    renderAs("owner");
    await user.click(await screen.findByRole("button", { name: /apiKeys.create.action/ }));
    expect(screen.getByText("apiKeys.scopes.partner_billing_read")).toBeTruthy();
    expect(screen.getByText("apiKeys.scopes.partner_billing_write")).toBeTruthy();
  });

  it("revokes a key after the owner confirms", async () => {
    const user = userEvent.setup();
    const fetchMock = renderAs("owner");
    await user.click(await screen.findByRole("button", { name: /apiKeys.create.action/ }));
    await user.type(screen.getByLabelText("apiKeys.create.nameLabel"), "Client onboarding");
    await user.click(screen.getByRole("button", { name: "apiKeys.create.submit" }));
    await user.click(await screen.findByRole("button", { name: "apiKeys.created.done" }));
    await user.click(await screen.findByRole("button", { name: "apiKeys.revoke.action" }));
    const confirm = await screen.findByRole("button", { name: "apiKeys.revoke.confirm" });
    expect(confirm.className).toContain("text-destructive");
    await user.click(confirm);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/partner/platform-keys/k1?partnerId=partner", expect.objectContaining({ method: "DELETE" })));
    expect(await screen.findByText("apiKeys.revoked")).toBeTruthy();
  });

  it("updates a key's name and scopes as the partner, with the dialog filled in", async () => {
    const user = userEvent.setup();
    const fetchMock = renderAs("admin", [record()]);
    const row = within(await screen.findByRole("list", { name: "apiKeys.title" })).getByRole("listitem");
    expect(row.textContent).not.toContain("businesses:create");
    expect(within(row).getByRole("button", { name: "apiKeys.revoke.action" }).className).toContain("text-destructive");
    await user.click(within(row).getByRole("button", { name: "apiKeys.update.action" }));
    const dialog = await screen.findByRole("dialog");
    expect((within(dialog).getByLabelText("apiKeys.create.nameLabel") as HTMLInputElement).value).toBe("Client onboarding");
    expect(within(dialog).getByRole("checkbox", { name: /businesses:create/ }).getAttribute("aria-checked")).toBe("true");
    await user.click(within(dialog).getByRole("checkbox", { name: /contacts:read/ }));
    await user.click(within(dialog).getByRole("button", { name: "apiKeys.update.submit" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/partner/platform-keys/k1", expect.objectContaining({ method: "PATCH" })));
    const patch = fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH");
    expect(JSON.parse(String(patch?.[1]?.body))).toEqual({ partnerId: "partner", name: "Client onboarding", scopes: ["business:read", "businesses:create", "contacts:read"] });
  });

  it("lets only an owner update a key with billing scopes", async () => {
    renderAs("admin", [record({ scopes: ["partner:read", "partner.billing:read"] })]);
    const update = await screen.findByRole("button", { name: "apiKeys.update.action" });
    expect((update as HTMLButtonElement).disabled).toBe(true);
    expect(update.getAttribute("title")).toBe("apiKeys.update.ownerOnly");
    cleanup();
    renderAs("owner", [record({ scopes: ["partner:read", "partner.billing:read"] })]);
    expect(((await screen.findByRole("button", { name: "apiKeys.update.action" })) as HTMLButtonElement).disabled).toBe(false);
  });

  it("has no icon on its create button", async () => {
    renderAs("owner");
    const create = await screen.findByRole("button", { name: "apiKeys.create.action" });
    expect(create.querySelector("svg")).toBeNull();
  });
});
