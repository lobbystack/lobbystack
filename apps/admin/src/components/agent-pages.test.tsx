// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";


const fixture = vi.hoisted(() => ({ capabilities: ["activity", "setup"] as string[] }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: "en" }, t: (key: string) => key }) }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock("@/components/business-capabilities-provider", () => ({ useBusinessCan: () => (capability: string) => fixture.capabilities.includes(capability) }));
vi.mock("@/components/product-analytics", () => ({ useTelemetry: () => ({ track: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/components/agents/channels-section", () => ({ ChannelsSection: ({ agentId, widgetsEnabled }: { agentId: string; widgetsEnabled: boolean }) => <p>channels for {agentId}{widgetsEnabled ? " with widgets" : ""}</p> }));

import { AgentChannelsPage, AgentSettingsPage } from "./agent-pages";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function renderWith(node: React.ReactNode) {
  const client = new QueryClient();
  client.setQueryData(["businesses"], { businesses: [{ businessId: "business", active: true, role: "business_owner" }] });
  render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

it("shows the agent's channels, with widgets when the server makes them", () => {
  renderWith(<AgentChannelsPage agentId="agent-2" widgetsEnabled />);
  expect(screen.getByText("channels for agent-2 with widgets")).toBeTruthy();
  cleanup();
  renderWith(<AgentChannelsPage agentId="agent-2" widgetsEnabled={false} />);
  expect(screen.getByText("channels for agent-2")).toBeTruthy();
});

it("holds the name, greeting and voice, then calls and booking, on the agent's own page, each section waiting with placeholders", () => {
  vi.stubGlobal("matchMedia", vi.fn((query: string) => ({ matches: false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));
  renderWith(<AgentSettingsPage agentId="agent-1" />);
  const titles = ["agent:identity.title", "agent:transfers.title", "agent:staffFirst.title", "agent:booking.title"];
  expect(screen.getAllByRole("heading").map((heading) => heading.textContent)).toEqual(titles);
  for (const title of titles) {
    const section = screen.getByRole("heading", { name: title }).closest("section")!;
    expect(section.closest("[aria-busy]")?.getAttribute("aria-busy"), title).toBe("true");
    expect(section.querySelectorAll("[data-slot='skeleton']").length, title).toBeGreaterThan(0);
  }
  const appointments = screen.getByRole("heading", { name: "agent:booking.title" }).closest("section")!;
  for (const row of ["agent:booking.mode.label", "agent:appointmentChanges.allowCancel.label", "agent:appointmentChanges.allowReschedule.label", "agent:appointmentChanges.verification.label"]) {
    expect(appointments.textContent, row).toContain(row);
  }
});
