// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LiveApiKeysSurface } from "./live-api-keys-surface";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en", resolvedLanguage: "en" } }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.forEach((client) => client.clear()); clients.length = 0; vi.unstubAllGlobals(); });

function setup(role: string, initialKeys: Array<Record<string, unknown>> = []) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  clients.push(client);
  client.setQueryData(["businesses"], { businesses: [{ businessId: "business-1", name: "Salon", active: true, role }] });
  let keys: Array<Record<string, unknown>> = initialKeys;
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "PATCH") {
      const body = JSON.parse(String(init.body)) as { name: string; scopes: string[] };
      keys = keys.map((key) => ({ ...key, ...body }));
      return Response.json({ apiKey: keys[0] });
    }
    if (init?.method === "POST") {
      const body = JSON.parse(String(init.body)) as { name: string; scopes: string[] };
      const apiKey = { id: "k1", name: body.name, prefix: "lsk_1a2b3c4d", scopes: body.scopes, createdAt: "2026-09-27T12:00:00.000Z", createdBy: null, lastUsedAt: null, revokedAt: null };
      keys = [apiKey];
      return Response.json({ key: "lsk_1a2b3c4d_secretsecretsecretsecretsecret12", apiKey }, { status: 201 });
    }
    if (url.startsWith("/api/api-keys")) return Response.json({ keys });
    return Response.json({});
  });
  vi.stubGlobal("fetch", fetchMock);
  render(<QueryClientProvider client={client}><LiveApiKeysSurface /></QueryClientProvider>);
  return fetchMock;
}

describe("API keys settings", () => {
  it("tells viewers that only owners and admins manage keys", async () => {
    const fetchMock = setup("viewer");
    expect(await screen.findByText("apiKeys.restricted.title")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining("/api/api-keys"), expect.anything());
  });

  it("creates a key with the chosen scopes and shows it once", async () => {
    const user = userEvent.setup();
    const fetchMock = setup("business_owner");
    expect(await screen.findByText("apiKeys.empty")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /apiKeys.create.action/ }));
    await user.type(screen.getByLabelText("apiKeys.create.nameLabel"), "Zapier");
    await user.click(screen.getByRole("button", { name: "apiKeys.create.submit" }));
    expect((await screen.findByTestId("secret-value")).textContent).toBe("lsk_1a2b3c4d_secretsecretsecretsecretsecret12");
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({ name: "Zapier", scopes: ["calls:read", "contacts:read", "appointments:read", "messages:read", "business:read"] });
    await user.click(screen.getByRole("button", { name: "apiKeys.created.done" }));
    await waitFor(() => expect(screen.queryByTestId("secret-value")).toBeNull());
    expect(await screen.findByText("Zapier")).toBeTruthy();
  });

  it("lists each key by name with one line about it, and neither its key nor its scopes", async () => {
    setup("business_owner", [
      { id: "k1", name: "Zapier", prefix: "lsk_1a2b3c4d", scopes: ["calls:read", "contacts:write"], createdAt: "2026-09-27T12:00:00.000Z", createdBy: { userId: "u1", name: "Ada", email: "ada@example.com" }, lastUsedAt: null, revokedAt: null },
      { id: "k2", name: "Old sync", prefix: "lsk_9f8e7d6c", scopes: ["calls:read"], createdAt: "2026-09-01T12:00:00.000Z", createdBy: null, lastUsedAt: "2026-09-02T12:00:00.000Z", revokedAt: "2026-09-03T12:00:00.000Z" },
    ]);
    const list = await screen.findByRole("list", { name: "apiKeys.title" });
    const [live, revoked] = within(list).getAllByRole("listitem");
    expect(within(live!).getByText("Zapier")).toBeTruthy();
    expect(within(live!).getByText("apiKeys.createdBy")).toBeTruthy();
    expect(within(live!).getByText("apiKeys.neverUsed")).toBeTruthy();
    expect(within(live!).getByRole("button", { name: "apiKeys.update.action" })).toBeTruthy();
    expect(within(live!).getByRole("button", { name: "apiKeys.revoke.action" }).className).toContain("text-destructive");
    // A revoked key stays, with when it was revoked, and nothing to do.
    expect(within(revoked!).getByText("apiKeys.createdOn")).toBeTruthy();
    expect(within(revoked!).getByText("apiKeys.revoked")).toBeTruthy();
    expect(within(revoked!).queryByRole("button")).toBeNull();
    expect(list.textContent).not.toContain("lsk_");
    expect(list.textContent).not.toContain("calls:read");
  });

  it("updates a key's name and scopes in the create dialog, filled in with the key's", async () => {
    const user = userEvent.setup();
    const fetchMock = setup("business_admin", [{ id: "k1", name: "Zapier", prefix: "lsk_1a2b3c4d", scopes: ["calls:read", "contacts:write"], createdAt: "2026-09-27T12:00:00.000Z", createdBy: null, lastUsedAt: null, revokedAt: null }]);
    await user.click(await screen.findByRole("button", { name: "apiKeys.update.action" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("apiKeys.update.title")).toBeTruthy();
    expect((within(dialog).getByLabelText("apiKeys.create.nameLabel") as HTMLInputElement).value).toBe("Zapier");
    expect(within(dialog).getByRole("checkbox", { name: /calls:read/ }).getAttribute("aria-checked")).toBe("true");
    expect(within(dialog).getByRole("checkbox", { name: /contacts:write/ }).getAttribute("aria-checked")).toBe("true");
    expect(within(dialog).getByRole("checkbox", { name: /messages:read/ }).getAttribute("aria-checked")).toBe("false");
    await user.clear(within(dialog).getByLabelText("apiKeys.create.nameLabel"));
    await user.type(within(dialog).getByLabelText("apiKeys.create.nameLabel"), "CRM sync");
    await user.click(within(dialog).getByRole("checkbox", { name: /contacts:write/ }));
    await user.click(within(dialog).getByRole("button", { name: "apiKeys.update.submit" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const patch = fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH");
    expect(patch?.[0]).toBe("/api/api-keys/k1?businessId=business-1");
    expect(JSON.parse(String(patch?.[1]?.body))).toEqual({ name: "CRM sync", scopes: ["calls:read"] });
    expect(await screen.findByText("CRM sync")).toBeTruthy();
    // No key is shown, since it didn't change.
    expect(screen.queryByTestId("secret-value")).toBeNull();
  });
});
