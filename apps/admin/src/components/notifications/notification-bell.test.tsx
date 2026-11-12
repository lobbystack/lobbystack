// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BUSINESS_NOTIFICATION_KINDS, type BusinessNotificationItem } from "@lobbystack/shared";

import { createRecordedBrowserTelemetry } from "@/lib/telemetry-testing";
import en from "../../../public/locales/en/nav.json";
import es from "../../../public/locales/es/nav.json";
import fr from "../../../public/locales/fr/nav.json";
import sr from "../../../public/locales/sr/nav.json";
import { NotificationBell } from "./notification-bell";
import { notificationCopy } from "./notification-copy";

const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/" }));
const telemetryRef = vi.hoisted(() => ({ current: null as ReturnType<typeof createRecordedBrowserTelemetry> | null }));
vi.mock("@/components/product-analytics", () => ({ useTelemetry: () => telemetryRef.current!.telemetry }));

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

const importFailed: BusinessNotificationItem = { id: "11111111-1111-4111-8111-111111111111", kind: "website_import_failed", category: "action", params: { site: "example.com" }, href: "/business/knowledge", occurredAt: minutesAgo(5), read: false };
const paymentFailed: BusinessNotificationItem = { id: "22222222-2222-4222-8222-222222222222", kind: "payment_failed", category: "action", params: {}, href: "/workspace/billing", occurredAt: minutesAgo(120), read: true };
const productUpdate: BusinessNotificationItem = {
  id: "33333333-3333-4333-8333-333333333333",
  kind: "product_update",
  category: "update",
  params: { slug: "multiple-agents", copy: { en: { title: "Run several agents", description: "Each with its own number.", href: "https://lobbystack.com/changelog/#multiple-agents" }, fr: { title: "Plusieurs agents", description: "Chacun son numéro.", href: "https://lobbystack.com/fr/changelog/#multiple-agents" } } },
  href: "/agents",
  occurredAt: minutesAgo(30),
  read: false,
};

let list: BusinessNotificationItem[];
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  list = [importFailed, paymentFailed, productUpdate];
  router.push.mockReset();
  telemetryRef.current = createRecordedBrowserTelemetry();
  vi.stubGlobal("EventSource", class { addEventListener() {} removeEventListener() {} close() {} });
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.startsWith("/api/notifications/read")) {
      const body = JSON.parse(String(init?.body)) as { ids?: string[]; all?: boolean };
      list = list.map((item) => (body.all || body.ids?.includes(item.id) ? { ...item, read: true } : item));
      return Response.json({ marked: 1 });
    }
    if (url.startsWith("/api/notifications")) return Response.json({ notifications: list });
    if (url.startsWith("/api/businesses")) return Response.json({ businesses: [{ businessId: "business", name: "Tenant", active: true, role: "business_owner" }] });
    return Response.json({});
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

async function renderBell(language = "en") {
  const i18n = createInstance();
  await i18n.init({ lng: language, fallbackLng: "en", resources: { en: { nav: en }, fr: { nav: fr } }, defaultNS: "nav", interpolation: { escapeValue: false } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["businesses"], { businesses: [{ businessId: "business", name: "Tenant", active: true, role: "business_owner" }] });
  render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}><NotificationBell /></I18nextProvider>
    </QueryClientProvider>,
  );
  return client;
}

const bell = () => screen.getByRole("button", { name: /^Notifications/ });
const posted = () => fetchMock.mock.calls.filter(([url]) => String(url).startsWith("/api/notifications/read")).map(([, init]) => JSON.parse(String((init as RequestInit).body)));

describe("the notification bell", () => {
  it("shows an unread dot and the unread count to screen readers", async () => {
    await renderBell();
    await waitFor(() => expect(bell().getAttribute("aria-label")).toBe("Notifications, 2 unread"));
    expect(bell().querySelector("[data-unread-dot]")).not.toBeNull();
  });

  it("lists each item's title, line and time, action required first, and reports opening", async () => {
    await renderBell();
    await waitFor(() => expect(bell().getAttribute("aria-label")).toContain("2 unread"));
    await userEvent.click(bell());
    const panel = await screen.findByRole("dialog");
    const rows = within(panel).getAllByRole("button").filter((row) => row.hasAttribute("data-kind"));
    expect(rows.map((row) => row.getAttribute("data-kind"))).toEqual(["website_import_failed", "payment_failed", "product_update"]);
    expect(within(rows[0]!).getByText("We couldn't import example.com")).toBeTruthy();
    expect(within(rows[0]!).getByText("Check the address and import it again.")).toBeTruthy();
    expect(within(rows[0]!).getByText("5 minutes ago")).toBeTruthy();
    expect(within(rows[0]!).getByText("Unread")).toBeTruthy();
    expect(within(rows[1]!).queryByText("Unread")).toBeNull();
    expect(within(rows[2]!).getByText("Run several agents")).toBeTruthy();
    expect(rows.every((row) => !row.querySelector("svg"))).toBe(true);
    telemetryRef.current!.expectEvent("web.notifications.bell_opened", { businessId: "business", unreadCount: 2, actionCount: 2 });
  });

  it("marks a clicked item read, opens the page where you act and reports the click", async () => {
    await renderBell();
    await waitFor(() => expect(bell().getAttribute("aria-label")).toContain("2 unread"));
    await userEvent.click(bell());
    await userEvent.click(await screen.findByText("We couldn't import example.com"));
    expect(posted()).toEqual([{ ids: [importFailed.id] }]);
    expect(router.push).toHaveBeenCalledWith("/business/knowledge");
    telemetryRef.current!.expectEvent("web.notifications.item_clicked", { businessId: "business", kind: "website_import_failed", category: "action", unread: true });
    await waitFor(() => expect(bell().getAttribute("aria-label")).toBe("Notifications, 1 unread"));
  });

  it("clears every unread mark with Mark all as read", async () => {
    await renderBell();
    await waitFor(() => expect(bell().getAttribute("aria-label")).toContain("2 unread"));
    await userEvent.click(bell());
    await userEvent.click(await screen.findByRole("button", { name: "Mark all as read" }));
    expect(posted()).toEqual([{ all: true }]);
    await waitFor(() => expect(bell().getAttribute("aria-label")).toBe("Notifications"));
    expect(bell().querySelector("[data-unread-dot]")).toBeNull();
    expect((screen.getByRole("button", { name: "Mark all as read" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("keeps an action item listed after it's read", async () => {
    await renderBell();
    await waitFor(() => expect(bell().getAttribute("aria-label")).toContain("2 unread"));
    await userEvent.click(bell());
    await userEvent.click(await screen.findByRole("button", { name: "Mark all as read" }));
    await waitFor(() => expect(bell().getAttribute("aria-label")).toBe("Notifications"));
    // The server keeps listing it until its condition clears; the panel shows it, read.
    expect(screen.getByText("We couldn't import example.com")).toBeTruthy();
  });

  it("says when there's nothing", async () => {
    list = [];
    await renderBell();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await userEvent.click(bell());
    expect(await screen.findByText("No notifications")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Mark all as read" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows a placeholder list while the items load", async () => {
    fetchMock.mockImplementation(async (url: string) => (String(url).startsWith("/api/notifications") ? await new Promise<Response>(() => undefined) : Response.json({ businesses: [{ businessId: "business", name: "Tenant", active: true, role: "business_owner" }] })));
    await renderBell();
    await userEvent.click(bell());
    const loading = await screen.findByRole("status", { name: "Loading notifications" });
    expect(loading.getAttribute("aria-busy")).toBe("true");
  });

  it("shows a product update in the reader's language and opens its dashboard page", async () => {
    await renderBell("fr");
    await waitFor(() => expect(bell().getAttribute("aria-label")).toBe("Notifications, 2 non lues"));
    await userEvent.click(bell());
    await userEvent.click(await screen.findByText("Plusieurs agents"));
    expect(router.push).toHaveBeenCalledWith("/agents");
  });

  it("opens the changelog in a new tab for an update without a dashboard page", async () => {
    list = [{ ...productUpdate, href: null }];
    const open = vi.fn();
    vi.stubGlobal("open", open);
    await renderBell();
    await waitFor(() => expect(bell().getAttribute("aria-label")).toContain("1 unread"));
    await userEvent.click(bell());
    await userEvent.click(await screen.findByText("Run several agents"));
    expect(open).toHaveBeenCalledWith("https://lobbystack.com/changelog/#multiple-agents", "_blank", "noopener,noreferrer");
    expect(router.push).not.toHaveBeenCalled();
  });
});

describe("notification copy", () => {
  const params: Record<string, Record<string, unknown>> = {
    trial_ending: { days: 4 },
    number_released: { number: "+15145550100", trial: true },
    plan_canceled: { endsAt: "2026-12-01T00:00:00.000Z" },
    minutes_80: { used: 480, included: 600 },
    minutes_100: { used: 600, included: 600 },
    number_purchase_failed: { number: "+15145550100" },
    number_release_soon: { number: "+15145550100", releaseAt: "2026-12-01T00:00:00.000Z" },
    calendar_sync_failing: { provider: "google" },
    instagram_reconnect: { username: "studio" },
    webhook_failing: { host: "hooks.example.com" },
    website_import_failed: { site: "example.com" },
    website_import_finished: { site: "example.com", pages: 48 },
    invite_accepted: { email: "sam@example.com" },
    forwarding_detected: { from: "+15145550199", number: "+15145550100" },
    product_update: { copy: { en: { title: "T", description: "D", href: "https://lobbystack.com/changelog/" } } },
  };

  it("writes every kind's title and line in each interface language", async () => {
    for (const [language, nav] of Object.entries({ en, fr, es, sr })) {
      const i18n = createInstance();
      await i18n.init({ lng: language, resources: { [language]: { nav } }, defaultNS: "nav", interpolation: { escapeValue: false } });
      for (const kind of BUSINESS_NOTIFICATION_KINDS) {
        const { title, line } = notificationCopy({ kind, params: params[kind] ?? {} }, i18n.t, language);
        expect(title, `${language} ${kind}`).not.toMatch(/notifications\.|^$/);
        expect(line, `${language} ${kind}`).not.toMatch(/notifications\.|^$/);
      }
    }
  });

  it("counts the days and pages", async () => {
    const i18n = createInstance();
    await i18n.init({ lng: "en", resources: { en: { nav: en } }, defaultNS: "nav" });
    expect(notificationCopy({ kind: "trial_ending", params: { days: 1 } }, i18n.t, "en").title).toBe("Your free trial ends tomorrow");
    expect(notificationCopy({ kind: "trial_ending", params: { days: 4 } }, i18n.t, "en").title).toBe("Your free trial ends in 4 days");
    expect(notificationCopy({ kind: "website_import_finished", params: { site: "example.com", pages: 48 } }, i18n.t, "en").line).toBe("Read 48 pages of example.com.");
  });
});
