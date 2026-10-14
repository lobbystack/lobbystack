// @vitest-environment jsdom
import type { ReactNode } from "react";
import { act, cleanup, fireEvent, render as renderView, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DashboardTestCallWidget } from "./dashboard-test-call-widget";
import { UpgradePlanDialogProvider } from "./upgrade-plan-dialog-context";
import { createRecordedBrowserTelemetry } from "@/lib/telemetry-testing";

const startCall = vi.fn();
const forceEndCall = vi.fn();
const openUpgrade = vi.fn();
const voice = vi.hoisted(() => ({ onEvent: null as null | ((eventName: string, properties?: Record<string, unknown>) => void), onUpgrade: undefined as undefined | (() => void) }));
const telemetryRef = vi.hoisted(() => ({ current: null as ReturnType<typeof createRecordedBrowserTelemetry> | null }));
vi.mock("@/components/product-analytics", () => ({ useTelemetry: () => telemetryRef.current!.telemetry }));
let client: QueryClient;
afterEach(() => { cleanup(); client.clear(); vi.clearAllMocks(); });
beforeEach(() => {
  telemetryRef.current = createRecordedBrowserTelemetry();
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(["billing", "business-1"], { effectivePlan: "pro" });
});
function render(ui: ReactNode) {
  return renderView(<QueryClientProvider client={client}><UpgradePlanDialogProvider onOpen={openUpgrade}>{ui}</UpgradePlanDialogProvider></QueryClientProvider>);
}

vi.mock("@/components/web-voice/AuraVoiceDemo", () => ({
  AuraVoiceDemo: ({
    onEvent,
    onRegisterControls,
    onUpgrade,
  }: {
    onEvent?: (eventName: string, properties?: Record<string, unknown>) => void;
    onRegisterControls?: (controls: {
      forceEndCall: () => Promise<void>;
      startCall: () => Promise<void>;
    }) => void;
    onUpgrade?: () => void;
  }) => {
    voice.onEvent = onEvent ?? null;
    voice.onUpgrade = onUpgrade;
    onRegisterControls?.({
      forceEndCall,
      startCall,
    });

    return <div data-testid="aura-voice-demo" />;
  },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        "testCall.trigger": "Test Call",
        "testCall.title": "Test your AI receptionist",
        "testCall.description":
          "Start a live browser call with your configured receptionist.",
      };

      return translations[key] ?? key;
    },
  }),
}));

describe("DashboardTestCallWidget", () => {
  it("renders nothing without a business slug", () => {
    const { container } = render(
      <DashboardTestCallWidget businessId={"business-1" as never} />,
    );

    expect(container.firstChild).toBeNull();
  });

  it("renders the test call trigger when a business slug is available", () => {
    render(
      <DashboardTestCallWidget
        businessId={"business-1" as never}
        businessSlug="acme-dental"
      />,
    );

    expect(screen.getByRole("button", { name: "Test Call" })).toBeTruthy();
  });

  it("opens the test call dialog and starts the call when the trigger is clicked", async () => {
    startCall.mockClear();

    render(
      <DashboardTestCallWidget
        businessId={"business-1" as never}
        businessSlug="acme-dental"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Test Call" }));

    expect(screen.getByTestId("aura-voice-demo")).toBeTruthy();
    expect(screen.getByText("Test your AI receptionist")).toBeTruthy();
    expect(startCall).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape", code: "Escape" });
    await waitFor(() => expect(forceEndCall).toHaveBeenCalledTimes(1));
  });

  it("forwards web voice telemetry with the active business", () => {
    render(
      <DashboardTestCallWidget
        businessId={"business-1" as never}
        businessSlug="acme-dental"
      />,
    );

    voice.onEvent?.("web.voice.test_call_started", {
      widgetId: "lobbystack-dashboard-test-call",
    });

    telemetryRef.current!.expectEvent("web.voice.test_call_started", {
      businessId: "business-1",
    });
  });
});

describe("upgrading from a used-up test call", () => {
  it("offers a free workspace the plans, closing the call first", async () => {
    client.setQueryData(["billing", "business-1"], { effectivePlan: "free_cloud" });
    render(<DashboardTestCallWidget businessId={"business-1" as never} businessSlug="acme-dental" />);
    fireEvent.click(screen.getByRole("button", { name: "Test Call" }));
    expect(screen.getByRole("dialog")).toBeTruthy();

    act(() => voice.onUpgrade!());

    expect(openUpgrade).toHaveBeenCalledOnce();
    expect(forceEndCall).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("offers nothing to a paid workspace, which has no plan to buy", () => {
    render(<DashboardTestCallWidget businessId={"business-1" as never} businessSlug="acme-dental" />);
    expect(voice.onUpgrade).toBeUndefined();
  });

  it("renders in onboarding, which has no plan dialog, and offers nothing there", () => {
    client.setQueryData(["billing", "business-1"], { effectivePlan: "free_cloud" });
    renderView(<QueryClientProvider client={client}><DashboardTestCallWidget businessId={"business-1" as never} businessSlug="acme-dental" /></QueryClientProvider>);
    expect(screen.getByRole("button", { name: "Test Call" })).toBeTruthy();
    expect(voice.onUpgrade).toBeUndefined();
  });
});
