// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { AgentHandlingSection } from "./agent-handling-section";
import { AgentIdentitySection } from "./agent-identity-section";
import { AgentInstructionsSection } from "./agent-instructions-section";
import { WorkspaceBusinessSection } from "./workspace-business-section";

/** The agent's sections and the workspace's business details, together, as the agent and workspace pages show them. */
function AgentSettingsSections({ businessId, canManageTenant }: { businessId: string; canManageTenant: boolean }) {
  const props = { agentId: "agent-1", businessId, canManage: canManageTenant };
  return <><AgentIdentitySection {...props} /><AgentInstructionsSection {...props} /><AgentHandlingSection {...props} /><WorkspaceBusinessSection businessId={businessId} canManage={canManageTenant} /></>;
}

vi.mock("@/components/product-analytics", () => ({ useTelemetry: () => ({ track: vi.fn() }) }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: "en" }, t: (key: string) => key }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/components/business-hours-section", () => ({ BusinessHoursSection: () => null }));

beforeEach(() => { vi.stubGlobal("matchMedia", vi.fn((query: string) => ({ matches: false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() }))); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function renderPage(fetchMock: typeof fetch) {
  vi.stubGlobal("fetch", fetchMock);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><AgentSettingsSections businessId="business" canManageTenant /></QueryClientProvider>);
  return client;
}

const settings = { business: { defaultLocale: "en", timezone: "America/Toronto" }, profile: { id: "agent-1", name: "Agent", greeting: "Hi", summary: "Clinic", summarySource: "operator", transferNumber: null, transferMode: "on_request", appointmentChangePolicy: null, bookingMode: "instant" } };

it("marks every section busy, with each row's titles in place, until the settings load", async () => {
  const client = renderPage(vi.fn(() => new Promise<Response>(() => undefined)) as unknown as typeof fetch);
  for (const title of ["agent:identity.title", "agent:fields.instructions.title", "agent:transfers.title", "agent:businessDetails.title"]) {
    expect(screen.getByRole("heading", { name: title }).closest("[aria-busy]")?.getAttribute("aria-busy")).toBe("true");
  }
  // Fixed labels stay real text, and the rows wait with their buttons off.
  expect(screen.getByText("agent:fields.greeting.label")).toBeTruthy();
  expect(screen.getByText("agent:instructions.voice.label")).toBeTruthy();
  for (const button of screen.getAllByRole("button", { name: "agent:actions.editField" })) expect((button as HTMLButtonElement).disabled).toBe(true);
  client.clear();
});

it("clears the busy state once the workspace and the agent have loaded", async () => {
  const client = renderPage(vi.fn(async () => Response.json(settings)) as unknown as typeof fetch);
  await waitFor(() => expect(document.querySelector("[aria-busy]")).toBeNull());
  expect(screen.getByRole("button", { name: "agent:fields.voice.change" })).toBeTruthy();
  client.clear();
});
