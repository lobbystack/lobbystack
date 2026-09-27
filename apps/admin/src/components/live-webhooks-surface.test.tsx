// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LiveWebhooksSurface } from "./live-webhooks-surface";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en", resolvedLanguage: "en" } }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("next/link", () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));

const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.forEach((client) => client.clear()); clients.length = 0; vi.unstubAllGlobals(); });

const endpoint = { id: "e1", url: "https://hooks.example.com/in", description: null, events: ["appointment.booked"], status: "disabled", disabled_reason: "failing", consecutive_failures: 9, last_success_at: null, last_failure_at: "2026-09-27T12:00:00.000Z", created_at: "2026-09-20T12:00:00.000Z" };
const delivery = { id: "d1", eventId: "ev1", eventType: "appointment.booked", status: "failed", attemptCount: 9, lastResponseStatus: 503, lastError: "HTTP 503", nextAttemptAt: null, lastAttemptAt: "2026-09-27T12:00:00.000Z", createdAt: "2026-09-26T12:00:00.000Z" };

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  clients.push(client);
  client.setQueryData(["businesses"], { businesses: [{ businessId: "b1", name: "Salon", active: true, role: "business_admin" }] });
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.startsWith("/api/webhook-endpoints/e1/deliveries")) return Response.json({ deliveries: [delivery] });
    if (url.startsWith("/api/webhook-deliveries/d1/resend")) return Response.json({ deliveryId: "d2" }, { status: 202 });
    if (url.startsWith("/api/webhook-endpoints/e1?") && init?.method === "PATCH") return Response.json({ endpoint: { ...endpoint, status: "enabled", disabled_reason: null } });
    if (url.startsWith("/api/webhook-endpoints")) return Response.json({ endpoints: [endpoint] });
    return Response.json({});
  });
  vi.stubGlobal("fetch", fetchMock);
  render(<QueryClientProvider client={client}><LiveWebhooksSurface /></QueryClientProvider>);
  return fetchMock;
}

describe("webhooks integration page", () => {
  it("explains an endpoint turned off after failures and shows the delivery log with resend", async () => {
    const user = userEvent.setup();
    const fetchMock = setup();
    expect(await screen.findByText("https://hooks.example.com/in")).toBeTruthy();
    expect(screen.getByText("webhooks.failing.title")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "webhooks.deliveries.show" }));
    expect(await screen.findByText("webhooks.deliveries.status.failed")).toBeTruthy();
    expect(screen.getByText("503")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /webhooks.deliveries.resend/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/webhook-deliveries/d1/resend?businessId=b1", expect.objectContaining({ method: "POST" })));
  });

  it("turns an endpoint back on", async () => {
    const user = userEvent.setup();
    const fetchMock = setup();
    await user.click(await screen.findByRole("switch", { name: "webhooks.enabledLabel" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/webhook-endpoints/e1?businessId=b1", expect.objectContaining({ method: "PATCH", body: JSON.stringify({ status: "enabled" }) })));
  });
});
