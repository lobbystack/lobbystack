// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StaffFirstSection } from "./staff-first-section";
import { createRecordedBrowserTelemetry } from "@/lib/telemetry-testing";

const telemetryRef = vi.hoisted(() => ({ current: null as ReturnType<typeof createRecordedBrowserTelemetry> | null }));
vi.mock("@/components/product-analytics", () => ({ useTelemetry: () => telemetryRef.current!.telemetry }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: "en" }, t: (key: string) => key }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const onSave = vi.fn();
const section = (props: Partial<Parameters<typeof StaffFirstSection>[0]> = {}) => render(<StaffFirstSection block={null} businessId="business" canManage defaultLocale="en" isLoading={false} onSave={onSave} profile={{ staffFirstMode: "always", staffFirstNumber: "+14165550142", staffFirstRingSeconds: 20 }} {...props} />);

beforeEach(() => {
  telemetryRef.current = createRecordedBrowserTelemetry();
  onSave.mockReset().mockResolvedValue(undefined);
  vi.stubGlobal("matchMedia", vi.fn((query: string) => ({ matches: false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("StaffFirstSection", () => {
  it("says when this deployment isn't set up for it", () => {
    section({ block: "setup", profile: { staffFirstMode: "never" } });
    expect(screen.getByText("agent:staffFirst.unavailable.setup")).toBeTruthy();
  });

  it("hides the details while the setting is off", () => {
    section({ profile: { staffFirstMode: "never" } });
    expect(screen.queryByText("agent:staffFirst.number.label")).toBeNull();
  });

  it("says why a Telnyx number can't use it, and locks the setting", () => {
    section({ block: "carrier", profile: { staffFirstMode: "never" } });
    expect(screen.getByText("agent:staffFirst.unavailable.carrier")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "agent:staffFirst.save" })).toBeNull();
  });

  it("says a Free business needs a paid plan", () => {
    section({ block: "plan", profile: { staffFirstMode: "never" } });
    expect(screen.getByText("agent:staffFirst.unavailable.plan")).toBeTruthy();
  });

  it("lets a business that lost access turn the setting off", () => {
    section({ block: "plan" });
    expect(screen.getByRole("button", { name: "agent:staffFirst.save" }).hasAttribute("disabled")).toBe(false);
  });

  it("shows the server's reason in place when a save fails", async () => {
    onSave.mockRejectedValue(Object.assign(new Error("own line"), { code: "staff_first_number_own_line" }));
    section();
    await userEvent.click(screen.getByRole("button", { name: "agent:staffFirst.save" }));
    await waitFor(() => expect(screen.getByText("agent:staffFirst.errors.ownLine")).toBeTruthy());
  });

  it("warns a Serbian business that callers won't hear the messages", () => {
    section({ defaultLocale: "sr" });
    expect(screen.getAllByText("agent:staffFirst.message.noSerbianVoice")).toHaveLength(2);
  });
});
