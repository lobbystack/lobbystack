// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StaffFirstSection } from "./staff-first-section";
import { createRecordedBrowserTelemetry } from "@/lib/telemetry-testing";

const telemetryRef = vi.hoisted(() => ({ current: null as ReturnType<typeof createRecordedBrowserTelemetry> | null }));
vi.mock("@/components/product-analytics", () => ({ useTelemetry: () => telemetryRef.current!.telemetry }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: "en" }, t: (key: string, options?: Record<string, unknown>) => options && "mode" in options ? `${key}:${String(options.mode)}:${String(options.number)}` : key }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const onSave = vi.fn();
const section = (props: Partial<Parameters<typeof StaffFirstSection>[0]> = {}) => render(<StaffFirstSection block={null} businessId="business" canManage defaultLocale="en" isLoading={false} onSave={onSave} profile={{ staffFirstMode: "always", staffFirstNumber: "+14165550142", staffFirstRingSeconds: 20 }} {...props} />);
const openDialog = async (name: "agent:staffFirst.setUp" | "agent:actions.edit") => {
  await userEvent.click(screen.getByRole("button", { name }));
  return within(await screen.findByRole("dialog"));
};

beforeEach(() => {
  telemetryRef.current = createRecordedBrowserTelemetry();
  onSave.mockReset().mockResolvedValue(undefined);
  vi.stubGlobal("matchMedia", vi.fn((query: string) => ({ matches: false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("StaffFirstSection", () => {
  it("says the setting is off and offers to set it up, with the options in a dialog", async () => {
    section({ profile: { staffFirstMode: "never", transferNumber: "+14165550100" } });
    expect(screen.getByText("agent:staffFirst.mode.options.never")).toBeTruthy();
    expect(screen.queryByText("agent:staffFirst.number.label")).toBeNull();
    const dialog = await openDialog("agent:staffFirst.setUp");
    expect(dialog.getByText("agent:staffFirst.mode.hint")).toBeTruthy();
    // Off shows only the mode, as the section did inline.
    expect(dialog.queryByText("agent:staffFirst.number.label")).toBeNull();
  });

  it("shows when the team's phone rings and which phone, with Edit", () => {
    section({ profile: { staffFirstMode: "business_hours", staffFirstNumber: "+14165550142" } });
    expect(screen.getByText("agent:staffFirst.state:agent:staffFirst.mode.options.business_hours:(416) 555-0142")).toBeTruthy();
    expect(screen.getByRole("button", { name: "agent:actions.edit" })).toBeTruthy();
  });

  it("holds the row's place while the settings load", () => {
    const { container } = section({ isLoading: true, profile: undefined });
    expect(screen.queryByRole("button")).toBeNull();
    expect(container.querySelectorAll("[data-slot='skeleton']").length).toBe(2);
    // A placeholder is a <div>, which can't sit inside a <p> without breaking hydration.
    expect(container.querySelectorAll("p div, [data-slot='item-description'] div")).toHaveLength(0);
  });

  it("says when this deployment isn't set up for it", () => {
    section({ block: "setup", profile: { staffFirstMode: "never" } });
    expect(screen.getByText("agent:staffFirst.unavailable.setup")).toBeTruthy();
  });

  it("says why a Telnyx number can't use it, and locks the setting", () => {
    section({ block: "carrier", profile: { staffFirstMode: "never" } });
    expect(screen.getByText("agent:staffFirst.unavailable.carrier")).toBeTruthy();
    expect(screen.getByRole("button", { name: "agent:staffFirst.setUp" }).hasAttribute("disabled")).toBe(true);
  });

  it("says a Free business needs a paid plan", () => {
    section({ block: "plan", profile: { staffFirstMode: "never" } });
    expect(screen.getByText("agent:staffFirst.unavailable.plan")).toBeTruthy();
    expect(screen.getByRole("button", { name: "agent:staffFirst.setUp" }).hasAttribute("disabled")).toBe(true);
  });

  it("lets a business that lost access turn the setting off", async () => {
    section({ block: "plan" });
    expect(screen.getByText("agent:staffFirst.unavailable.plan")).toBeTruthy();
    const dialog = await openDialog("agent:actions.edit");
    await userEvent.click(dialog.getByRole("combobox", { name: "agent:staffFirst.mode.when" }));
    await userEvent.click(await screen.findByRole("option", { name: "agent:staffFirst.mode.options.never" }));
    await userEvent.click(dialog.getByRole("button", { name: "agent:staffFirst.save" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ staffFirstMode: "never", staffFirstNumber: "+14165550142", staffFirstRingSeconds: 20, staffFirstMessage: null, staffFirstHandoverMessage: null }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByRole("button", { name: "agent:staffFirst.setUp" }).hasAttribute("disabled")).toBe(true);
  });

  it("asks for the staff phone in the dialog before saving", async () => {
    section({ profile: { staffFirstMode: "never" } });
    const dialog = await openDialog("agent:staffFirst.setUp");
    await userEvent.click(dialog.getByRole("combobox", { name: "agent:staffFirst.mode.when" }));
    await userEvent.click(await screen.findByRole("option", { name: "agent:staffFirst.mode.options.always" }));
    await userEvent.click(dialog.getByRole("button", { name: "agent:staffFirst.save" }));
    expect(dialog.getByText("agent:staffFirst.errors.numberRequired")).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("saves, closes the dialog and shows the new state in the row", async () => {
    section();
    const dialog = await openDialog("agent:actions.edit");
    await userEvent.click(dialog.getByRole("combobox", { name: "agent:staffFirst.mode.when" }));
    await userEvent.click(await screen.findByRole("option", { name: "agent:staffFirst.mode.options.business_hours" }));
    await userEvent.type(dialog.getByRole("textbox", { name: "agent:staffFirst.message.label" }), "One moment.");
    await userEvent.click(dialog.getByRole("button", { name: "agent:staffFirst.save" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(onSave).toHaveBeenCalledWith({ staffFirstMode: "business_hours", staffFirstNumber: "+14165550142", staffFirstRingSeconds: 20, staffFirstMessage: "One moment.", staffFirstHandoverMessage: null });
    telemetryRef.current!.expectEvent("web.agent.settings_saved", { businessId: "business", setting: "staff_first" });
    expect(screen.getByText("agent:staffFirst.state:agent:staffFirst.mode.options.business_hours:(416) 555-0142")).toBeTruthy();
  });

  it("drops unsaved edits on Cancel", async () => {
    section();
    let dialog = await openDialog("agent:actions.edit");
    await userEvent.type(dialog.getByRole("textbox", { name: "agent:staffFirst.message.label" }), "Draft");
    await userEvent.click(dialog.getByRole("button", { name: "agent:actions.cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    dialog = await openDialog("agent:actions.edit");
    expect((dialog.getByRole("textbox", { name: "agent:staffFirst.message.label" }) as HTMLTextAreaElement).value).toBe("");
  });

  it("shows the server's reason in the dialog when a save fails", async () => {
    onSave.mockRejectedValue(Object.assign(new Error("own line"), { code: "staff_first_number_own_line" }));
    section();
    const dialog = await openDialog("agent:actions.edit");
    await userEvent.click(dialog.getByRole("button", { name: "agent:staffFirst.save" }));
    await waitFor(() => expect(dialog.getByText("agent:staffFirst.errors.ownLine")).toBeTruthy());
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("warns a Serbian business that callers won't hear the messages", async () => {
    section({ defaultLocale: "sr" });
    const dialog = await openDialog("agent:actions.edit");
    expect(dialog.getAllByText("agent:staffFirst.message.noSerbianVoice")).toHaveLength(2);
  });
});
