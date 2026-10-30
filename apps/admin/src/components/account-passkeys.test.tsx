// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AccountPasskeys, defaultPasskeyName } from "./account-passkeys";

const client = vi.hoisted(() => ({ addPasskey: vi.fn() }));
vi.mock("@/lib/auth-client", () => ({ authClient: { passkey: { addPasskey: client.addPasskey } } }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: "en" }, t: (key: string) => key }) }));

type Row = { id: string; name: string | null; createdAt: string };
let rows: Row[];
const requests: Array<{ url: string; body: unknown }> = [];

function stubServer(passkeyAllowed = true) {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/auth/providers") return Response.json({ google: false, passkey: passkeyAllowed });
    if (url === "/api/auth/passkey/list-user-passkeys") return Response.json(rows);
    requests.push({ url, body: JSON.parse(String(init?.body ?? "{}")) });
    return Response.json({ status: true });
  }));
}
function renderCard(businessName?: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}><AccountPasskeys {...(businessName ? { businessName } : {})} /></QueryClientProvider>);
}
const listCalls = () => vi.mocked(fetch).mock.calls.filter(([url]) => url === "/api/auth/passkey/list-user-passkeys").length;

beforeEach(() => {
  rows = [{ id: "one", name: "MacBook", createdAt: "2026-10-01T10:00:00Z" }, { id: "two", name: null, createdAt: "2026-10-02T10:00:00Z" }];
  requests.length = 0;
  client.addPasskey.mockReset();
  vi.mocked(toast.success).mockClear();
  vi.mocked(toast.error).mockClear();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("passkeys on the account page", () => {
  it("shows nothing where passkeys are off, such as a partner's host", async () => {
    stubServer(false);
    renderCard();
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/auth/providers", expect.anything()));
    expect(screen.queryByText("account.passkeys.title")).toBeNull();
    expect(listCalls()).toBe(0);
  });

  it("holds the card's place with a skeleton until it knows whether passkeys are on", async () => {
    let allow!: (response: Response) => void;
    vi.stubGlobal("fetch", vi.fn((url: string) => url === "/api/auth/providers" ? new Promise<Response>((done) => { allow = done; }) : Promise.resolve(Response.json(rows))));
    const { container } = renderCard();
    expect(container.querySelectorAll("[data-slot=skeleton]").length).toBeGreaterThan(5);
    expect(screen.queryByText("account.passkeys.title")).toBeNull();
    allow(Response.json({ google: false, passkey: true }));
    expect(await screen.findByText("MacBook")).toBeTruthy();
    expect(container.querySelector("[data-slot=skeleton]")).toBeNull();
  });

  it("clears the skeleton and leaves no gap when passkeys are off", async () => {
    let allow!: (response: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((done) => { allow = done; })));
    const { container } = renderCard();
    expect(container.querySelector("[data-slot=skeleton]")).not.toBeNull();
    allow(Response.json({ google: false, passkey: false }));
    await waitFor(() => expect(container.querySelector("[data-slot=skeleton]")).toBeNull());
    expect(container.textContent).toBe("");
  });

  it("shows placeholder rows inside the card while the list loads", async () => {
    let list!: (response: Response) => void;
    vi.stubGlobal("fetch", vi.fn((url: string) => url === "/api/auth/providers" ? Promise.resolve(Response.json({ passkey: true })) : new Promise<Response>((done) => { list = done; })));
    const { container } = renderCard();
    expect(await screen.findByText("account.passkeys.title")).toBeTruthy();
    expect(container.querySelectorAll("[data-slot=skeleton]").length).toBeGreaterThan(4);
    expect(screen.queryByText("account.passkeys.empty")).toBeNull();
    list(Response.json(rows));
    expect(await screen.findByText("MacBook")).toBeTruthy();
    expect(container.querySelector("[data-slot=skeleton]")).toBeNull();
  });

  it("lists each passkey with its name, or a fallback when it has none", async () => {
    stubServer();
    renderCard();
    expect(await screen.findByText("MacBook")).toBeTruthy();
    expect(screen.getByText("account.passkeys.unnamed")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "account.passkeys.rename.action" })).toHaveLength(2);
  });

  it("says so when there are none", async () => {
    rows = [];
    stubServer();
    renderCard();
    expect(await screen.findByText("account.passkeys.empty")).toBeTruthy();
  });

  it("adds a passkey named after the business, confirms with a toast and reloads the list", async () => {
    stubServer();
    client.addPasskey.mockResolvedValue({ data: { id: "three" }, error: null });
    renderCard("Maple Family Clinic");
    await screen.findByText("MacBook");
    await userEvent.click(screen.getByRole("button", { name: "account.passkeys.add" }));
    expect(client.addPasskey).toHaveBeenCalledWith({ name: "maple-family-clinic-passkey" });
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("account.passkeys.added"));
    await waitFor(() => expect(listCalls()).toBe(2));
  });

  it.each([
    ["the person closes the browser's prompt", "ERROR_CEREMONY_ABORTED", null],
    ["the browser reports \"not allowed\"", "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY", null],
    ["the device already has one", "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED", "account.passkeys.errors.alreadyAdded"],
    ["the session is too old to add one", "SESSION_NOT_FRESH", "account.passkeys.errors.signInAgain"],
    ["the browser rejects this address", "ERROR_INVALID_RP_ID", "account.passkeys.errors.wrongAddress"],
    ["anything else goes wrong", "UNKNOWN_ERROR", "account.passkeys.errors.addFailed"],
  ])("handles adding when %s", async (_case, code, message) => {
    stubServer();
    client.addPasskey.mockResolvedValue({ data: null, error: { code, message: "x", status: 400 } });
    renderCard();
    await screen.findByText("MacBook");
    await userEvent.click(screen.getByRole("button", { name: "account.passkeys.add" }));
    await waitFor(() => expect(client.addPasskey).toHaveBeenCalled());
    if (message) await waitFor(() => expect(toast.error).toHaveBeenCalledWith(message));
    else expect(toast.error).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("renames a passkey, asking for a name first", async () => {
    stubServer();
    renderCard();
    await screen.findByText("MacBook");
    await userEvent.click(screen.getAllByRole("button", { name: "account.passkeys.rename.action" })[0]!);
    const input = await screen.findByLabelText("account.passkeys.rename.label") as HTMLInputElement;
    expect(input.value).toBe("MacBook");
    expect(input.placeholder).toBe("account.passkeys.rename.placeholder");
    await userEvent.clear(input);
    await userEvent.click(screen.getByRole("button", { name: "account.passkeys.rename.save" }));
    const message = await screen.findByText("account.passkeys.rename.required");
    expect(input.getAttribute("aria-describedby")).toBe(message.id);
    expect(requests).toHaveLength(0);
    await userEvent.type(input, "  Work laptop ");
    await userEvent.click(screen.getByRole("button", { name: "account.passkeys.rename.save" }));
    await waitFor(() => expect(requests).toEqual([{ url: "/api/auth/passkey/update-passkey", body: { id: "one", name: "Work laptop" } }]));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("account.passkeys.renamed"));
    await waitFor(() => expect(screen.queryByLabelText("account.passkeys.rename.label")).toBeNull());
  });

  it("removes a passkey only after confirming", async () => {
    stubServer();
    renderCard();
    await screen.findByText("MacBook");
    await userEvent.click(screen.getAllByRole("button", { name: "account.passkeys.remove" })[0]!);
    const dialog = await screen.findByRole("alertdialog");
    expect(requests).toHaveLength(0);
    await userEvent.click(within(dialog).getByRole("button", { name: "account.passkeys.remove" }));
    await waitFor(() => expect(requests).toEqual([{ url: "/api/auth/passkey/delete-passkey", body: { id: "one" } }]));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("account.passkeys.removed"));
  });

  it("keeps the passkey when the removal is cancelled", async () => {
    stubServer();
    renderCard();
    await screen.findByText("MacBook");
    await userEvent.click(screen.getAllByRole("button", { name: "account.passkeys.remove" })[0]!);
    const dialog = await screen.findByRole("alertdialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "account.actions.cancel" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(requests).toHaveLength(0);
  });
});

describe("defaultPasskeyName", () => {
  it("is the business's name in lowercase with dashes for spaces, then -passkey", () => {
    expect(defaultPasskeyName("Maple Family Clinic")).toBe("maple-family-clinic-passkey");
    expect(defaultPasskeyName("  ÉCOLE Dentaire ")).toBe("école-dentaire-passkey");
    // A run of spaces or tabs is one dash.
    expect(defaultPasskeyName("Acme\t  & Sons")).toBe("acme-&-sons-passkey");
  });

  it("is just passkey without a business name", () => {
    expect(defaultPasskeyName(undefined)).toBe("passkey");
    expect(defaultPasskeyName("   ")).toBe("passkey");
  });

  it("keeps the suffix and the name limit for a very long business name", () => {
    const name = defaultPasskeyName("x".repeat(300));
    expect(name).toHaveLength(100);
    expect(name.endsWith("-passkey")).toBe(true);
  });
});
