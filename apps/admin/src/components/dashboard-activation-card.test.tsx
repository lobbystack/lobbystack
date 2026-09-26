// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DashboardActivationCard } from "./dashboard-activation-card";
import { UpgradePlanDialogProvider } from "./upgrade-plan-dialog-context";
import { announceTestCallEnded, registerTestCallStarter } from "@/lib/test-call-launcher";
import { createRecordedBrowserTelemetry } from "@/lib/telemetry-testing";

const telemetryRef = vi.hoisted(() => ({ current: null as ReturnType<typeof createRecordedBrowserTelemetry> | null }));
vi.mock("@/components/product-analytics", () => ({ useTelemetry: () => telemetryRef.current!.telemetry }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const clients: QueryClient[] = [];
let store: Record<string, string>;

beforeEach(() => {
  telemetryRef.current = createRecordedBrowserTelemetry();
  store = {};
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
  });
});

afterEach(() => { cleanup(); clients.forEach(client => client.clear()); clients.length = 0; vi.unstubAllGlobals(); vi.clearAllMocks(); });

type Activation = {
  deploymentMode: string;
  plan: string;
  paidPlanLive: boolean;
  hasDedicatedNumber: boolean;
  completedWebCalls: number;
  websiteImport: { status: string; websiteUrl: string; importedCount: number; indexedCount: number } | null;
};

function activationBody(activation: Partial<Activation>): Activation {
  return {
    deploymentMode: "cloud",
    plan: "free_cloud",
    paidPlanLive: false,
    hasDedicatedNumber: false,
    completedWebCalls: 0,
    websiteImport: null,
    ...activation,
  };
}

function setup(activation: Partial<Activation>) {
  const body = activationBody(activation);
  vi.stubGlobal("fetch", vi.fn(async () => Response.json(body)));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  const onOpen = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <UpgradePlanDialogProvider onOpen={onOpen}>
        <DashboardActivationCard businessId="business" />
      </UpgradePlanDialogProvider>
    </QueryClientProvider>,
  );
  return onOpen;
}

describe("dashboard activation card", () => {
  it("shows crawl progress while the website import is still running", async () => {
    setup({ websiteImport: { status: "crawling", websiteUrl: "https://example.com", importedCount: 4, indexedCount: 0 } });
    expect(await screen.findByText("websiteImport.runningTitle")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("invites the operator to hear the agent once the import finishes", async () => {
    const stop = registerTestCallStarter(vi.fn());
    setup({ websiteImport: { status: "completed", websiteUrl: "https://example.com", importedCount: 12, indexedCount: 11 } });
    expect(await screen.findByText("activation.hearIt.title")).toBeTruthy();
    expect(screen.getByText("activation.hearIt.descriptionWithPages")).toBeTruthy();
    stop();
  });

  it("starts a call through the registered launcher", async () => {
    const start = vi.fn();
    const stop = registerTestCallStarter(start);
    setup({});
    await userEvent.click(await screen.findByRole("button", { name: /activation.hearIt.cta/ }));
    expect(start).toHaveBeenCalledOnce();
    stop();
  });

  it("records the first completed call and shows the upgrade prompt after it", async () => {
    const onOpen = setup({ completedWebCalls: 1 });
    expect(await screen.findByText("activation.upgrade.title")).toBeTruthy();
    telemetryRef.current!.expectEvent("web.activation.first_call_completed", { businessId: "business", transport: "web_voice" });
    telemetryRef.current!.expectEvent("web.activation.upgrade_prompt_shown", { businessId: "business", trigger: "first_call_completed" });

    await userEvent.click(screen.getByRole("button", { name: "activation.upgrade.cta" }));
    telemetryRef.current!.expectEvent("web.activation.upgrade_prompt_clicked", { businessId: "business", trigger: "first_call_completed" });
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it("reports the first completed call once per browser", async () => {
    setup({ completedWebCalls: 1 });
    await screen.findByText("activation.upgrade.title");
    cleanup();
    setup({ completedWebCalls: 3 });
    await screen.findByText("activation.upgrade.title");
    expect(telemetryRef.current!.events.filter(event => event.name === "web.activation.first_call_completed")).toHaveLength(1);
  });

  it("stays hidden once the business has its own phone number", async () => {
    setup({ hasDedicatedNumber: true, completedWebCalls: 2 });
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    expect(screen.queryByText("activation.upgrade.title")).toBeNull();
    expect(telemetryRef.current!.events).toHaveLength(0);
  });

  it("stays hidden for a self-hosted workspace, whatever its billing row says", async () => {
    setup({ deploymentMode: "self_hosted_standard", plan: "free_cloud", completedWebCalls: 1 });
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    expect(screen.queryByText("activation.upgrade.title")).toBeNull();
    expect(screen.queryByText("activation.hearIt.title")).toBeNull();
    expect(telemetryRef.current!.events).toHaveLength(0);
  });

  it("sends a paying operator without a number to claiming instead of checkout", async () => {
    setup({ plan: "starter", paidPlanLive: true, completedWebCalls: 1 });
    expect(await screen.findByText("activation.claimNumber.title")).toBeTruthy();
    expect(screen.getByText("activation.claimNumber.cta").closest("a")?.getAttribute("href")).toBe("/settings/phone-number");
    expect(screen.queryByText("activation.upgrade.title")).toBeNull();
    expect(telemetryRef.current!.events.filter(event => event.name === "web.activation.upgrade_prompt_shown")).toHaveLength(0);
    telemetryRef.current!.expectEvent("web.activation.first_call_completed", { businessId: "business", transport: "web_voice" });
  });

  it("re-checks activation after a call ends in this tab", async () => {
    const stop = registerTestCallStarter(vi.fn());
    let completedWebCalls = 0;
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(activationBody({ completedWebCalls }))));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    clients.push(client);
    render(
      <QueryClientProvider client={client}>
        <UpgradePlanDialogProvider onOpen={vi.fn()}>
          <DashboardActivationCard businessId="business" />
        </UpgradePlanDialogProvider>
      </QueryClientProvider>,
    );
    await screen.findByText("activation.hearIt.title");

    completedWebCalls = 1;
    announceTestCallEnded();

    expect(await screen.findByText("activation.upgrade.title", {}, { timeout: 5000 })).toBeTruthy();
    stop();
  });
});
