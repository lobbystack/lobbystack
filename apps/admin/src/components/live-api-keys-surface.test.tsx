// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LiveApiKeysSurface } from "./live-api-keys-surface";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en", resolvedLanguage: "en" } }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.forEach((client) => client.clear()); clients.length = 0; vi.unstubAllGlobals(); });

function setup(role: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  clients.push(client);
  client.setQueryData(["businesses"], { businesses: [{ businessId: "business-1", name: "Salon", active: true, role }] });
  let keys: unknown[] = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
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
    expect(await screen.findByText("lsk_1a2b3c4d…")).toBeTruthy();
  });
});
