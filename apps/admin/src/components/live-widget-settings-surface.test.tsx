// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: "fr", resolvedLanguage: "fr" }, t: (key: string, options?: { date?: string; name?: string }) => [key, options?.date ?? options?.name].filter(Boolean).join(":") }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("./live-notification-settings-surface", () => ({ LiveNotificationSettingsSurface: () => null }));

import { LiveWidgetSettingsSurface } from "./live-widget-settings-surface";

const clients: QueryClient[] = [];
const savedKey = { id: "widget", key: "wk_live_saved", label: "Website", status: "active", allowedOrigins: ["https://a.com"], config: {}, lastUsedAt: null, createdAt: "2026-09-23T12:00:00.000Z" };

function setup(issuanceEnabled: boolean, keys: Array<Record<string, unknown>> = []) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  clients.push(client);
  client.setQueryData(["businesses"], { businesses: [{ businessId: "business", name: "Acme", active: true }] });
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes("/api/billing")) return Response.json({ account: { plan: "starter" }, widgetIssuanceEnabled: issuanceEnabled });
    if (url.includes("/api/widget-keys") && init?.method === "POST") return Response.json({ ok: true, key: { id: "created", key: "wk_live_created" } });
    if (url.includes("/api/widget-keys") && init?.method === "PATCH") return Response.json({ ok: true });
    if (url.includes("/api/widget-keys")) return Response.json({ keys });
    return Response.json({ businesses: [{ businessId: "business", name: "Acme", active: true }] });
  });
  vi.stubGlobal("fetch", fetchMock);
  render(<QueryClientProvider client={client}><LiveWidgetSettingsSurface /></QueryClientProvider>);
  const sent = (method: string) => {
    const call = fetchMock.mock.calls.find(([, init]) => init?.method === method);
    return call ? JSON.parse(String(call[1]!.body)) as Record<string, unknown> & { config: Record<string, unknown> } : undefined;
  };
  return { user: userEvent.setup(), sent };
}

afterEach(() => {
  cleanup();
  clients.forEach(client => client.clear());
  clients.length = 0;
  vi.unstubAllGlobals();
  vi.mocked(toast.success).mockClear();
});

describe("website widget issuance restriction", () => {
  it("shows the restricted notice and offers no new key when issuance is disabled", async () => {
    setup(false);
    expect(await screen.findByText("widget.restricted.title")).toBeTruthy();
    expect(screen.getByText("widget.keys.empty")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "widget:manage.newKey" })).toBeNull();
  });

  it("offers a new key from the empty list once an operator enables issuance", async () => {
    setup(true);
    expect(await screen.findByRole("button", { name: "widget:manage.newKey" })).toBeTruthy();
    expect(screen.getByText("widget:manage.emptyDescription")).toBeTruthy();
    expect(screen.queryByText("widget.restricted.title")).toBeNull();
  });
});

describe("creating a widget key", () => {
  it("creates the key from the dialog, shows its snippet, and starts the next one over", async () => {
    const { user, sent } = setup(true);
    await user.click(await screen.findByRole("button", { name: "widget:manage.newKey" }));
    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByLabelText("widget.fields.origins"), "https://shop.example");
    await user.type(within(dialog).getByLabelText("widget.fields.title"), "Ask the shop");
    await user.selectOptions(within(dialog).getByLabelText("widget.fields.position"), "bottom-left");
    // The preview follows the form.
    expect(within(dialog).getAllByText("Ask the shop").length).toBeGreaterThan(0);
    await user.click(within(dialog).getByRole("button", { name: "widget.create.action" }));

    expect(await screen.findByText("widget.created.title")).toBeTruthy();
    expect(screen.getByText(/embed\.js\?key=wk_live_created" data-widget-key="wk_live_created"/)).toBeTruthy();
    expect(sent("POST")).toMatchObject({ allowedOrigins: ["https://shop.example"], config: { title: "Ask the shop", position: "bottom-left", color: "#18181b", leadForm: { enabled: false }, liveChat: { enabled: false } } });

    await user.click(screen.getByRole("button", { name: "widget.created.done" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await user.click(screen.getByRole("button", { name: "widget:manage.newKey" }));
    expect((screen.getByLabelText("widget.fields.title") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("widget.fields.position") as HTMLSelectElement).value).toBe("bottom-right");
  });

  it("asks for the lead form's options only once the form is on", async () => {
    const { user, sent } = setup(true);
    await user.click(await screen.findByRole("button", { name: "widget:manage.newKey" }));
    expect(screen.queryByLabelText("widget.fields.requireEmail")).toBeNull();
    await user.click(screen.getByRole("switch", { name: "widget.fields.leadEnabled" }));
    await user.click(screen.getByRole("checkbox", { name: "widget.fields.requireEmail" }));
    await user.type(screen.getByLabelText("widget.fields.origins"), "https://shop.example");
    await user.click(screen.getByRole("button", { name: "widget.create.action" }));
    await waitFor(() => expect(sent("POST")?.config.leadForm).toEqual({ enabled: true, requireEmail: true, requirePhone: false, showBeforeChat: false }));
  });
});

describe("a saved widget key", () => {
  it("saves an edit, closes the dialog, and says when its look reaches the website", async () => {
    const { user, sent } = setup(true, [savedKey]);
    await user.click(await screen.findByRole("button", { name: "widget:manage.edit" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("widget.keys.appearanceHint")).toBeTruthy();
    await user.type(within(dialog).getByLabelText("widget.fields.greeting"), "Hello there");
    await user.click(within(dialog).getByRole("button", { name: "widget.keys.save" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(toast.success).toHaveBeenCalledWith("widget.keys.saved");
    expect(sent("PATCH")).toMatchObject({ label: "Website", allowedOrigins: ["https://a.com"], config: { greeting: "Hello there" } });
  });

  it("copies a saved key's snippet from its card, and shows it while editing", async () => {
    const { user } = setup(true, [savedKey]);
    // user-event puts its own clipboard on navigator.
    const writeText = vi.spyOn(navigator.clipboard, "writeText");
    const snippet = `<script src="${window.location.origin}/embed.js?key=wk_live_saved" data-widget-key="wk_live_saved" defer></script>`;
    await user.click(await screen.findByRole("button", { name: "widget:manage.copySnippet" }));
    expect(writeText).toHaveBeenCalledWith(snippet);
    expect(await screen.findByText("widget.keys.snippetCopied")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "widget:manage.edit" }));
    expect(within(screen.getByRole("dialog")).getByText(snippet)).toBeTruthy();
  });

  it("explains why an older key has no snippet, and offers nothing on a revoked key", async () => {
    const { user } = setup(true, [
      { ...savedKey, id: "older", key: null, label: "Older" },
      { ...savedKey, id: "revoked", key: null, label: "Gone", status: "revoked", allowedOrigins: ["https://b.com"] },
    ]);
    expect(await screen.findByText("Gone")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "widget:manage.copySnippet" })).toBeNull();
    expect(screen.getAllByRole("button", { name: "widget:manage.edit" })).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "widget:manage.edit" }));
    expect(within(screen.getByRole("dialog")).getByText("widget.keys.noSnippet")).toBeTruthy();
  });

  it("lists revoked keys after the others", async () => {
    setup(true, [{ ...savedKey, id: "revoked", label: "Gone", status: "revoked" }, { ...savedKey, id: "live", label: "Live" }]);
    expect(await screen.findByText("Gone")).toBeTruthy();
    expect(screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)).toEqual(["Live", "Gone"]);
  });

  it("formats the last-used date with the active dashboard locale", async () => {
    const lastUsedAt = "2026-09-23T12:00:00.000Z";
    setup(true, [{ ...savedKey, lastUsedAt }]);
    const expected = new Intl.DateTimeFormat("fr", { dateStyle: "medium" }).format(new Date(lastUsedAt));
    expect(await screen.findByText(`widget.keys.lastUsed:${expected}`)).toBeTruthy();
  });

  it("turns live chat with the team on for a saved key", async () => {
    const { user, sent } = setup(true, [{ ...savedKey, config: { liveChat: { enabled: false } } }]);
    await user.click(await screen.findByRole("button", { name: "widget:manage.edit" }));
    const toggle = screen.getByRole("switch", { name: /^widget\.fields\.liveChat/ });
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    await user.click(toggle);
    await user.click(screen.getByRole("button", { name: "widget.keys.save" }));
    await waitFor(() => expect(sent("PATCH")?.config.liveChat).toEqual({ enabled: true }));
  });

  it("keeps every saved origin separate when the operator adds another and saves", async () => {
    const { user, sent } = setup(true, [{ ...savedKey, allowedOrigins: ["https://a.com", "https://b.com"] }]);
    await user.click(await screen.findByRole("button", { name: "widget:manage.edit" }));
    await user.type(screen.getByLabelText("widget.fields.origins"), ", https://c.com");
    await user.click(screen.getByRole("button", { name: "widget.keys.save" }));
    await waitFor(() => expect(sent("PATCH")?.allowedOrigins).toEqual(["https://a.com", "https://b.com", "https://c.com"]));
  });

  it("pauses a key from its menu and revokes it only after the operator confirms", async () => {
    const { user, sent } = setup(true, [savedKey]);
    await user.click(await screen.findByRole("button", { name: "widget:manage.moreActions:Website" }));
    await user.click(await screen.findByRole("menuitem", { name: "widget.keys.pause" }));
    await waitFor(() => expect(sent("PATCH")).toEqual({ status: "disabled" }));

    await user.click(screen.getByRole("button", { name: "widget:manage.moreActions:Website" }));
    await user.click(await screen.findByRole("menuitem", { name: "widget.keys.revoke" }));
    const confirm = await screen.findByRole("alertdialog");
    expect(within(confirm).getByText("widget:manage.revokeTitle:Website")).toBeTruthy();
    await user.click(within(confirm).getByRole("button", { name: "widget.keys.revoke" }));
    const fetchMock = vi.mocked(fetch);
    await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PATCH" && init.body === JSON.stringify({ status: "revoked" }))).toBe(true));
  });
});
