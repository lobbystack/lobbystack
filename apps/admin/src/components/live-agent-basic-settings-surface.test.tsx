// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AgentBasicSettingsPage,
  buildAppointmentChangePolicyForSave,
  resolveTransferNumberForSave,
} from "./live-agent-basic-settings-surface";

vi.mock("@/components/product-analytics", () => ({ useTelemetry: () => ({ track: vi.fn() }) }));
// Only the voice row's summary interpolates, so its parts show up in the text.
vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: "en" }, t: (key: string, options?: Record<string, string>) => key === "agent:fields.voice.summary" ? `voice=${options?.voice} traits=${options?.traits}` : key }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/components/business-hours-section", () => ({
  BusinessHoursSection: () => null,
}));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("resolveTransferNumberForSave", () => {
  it("rejects partial visible input instead of silently keeping the old value", () => {
    expect(
      resolveTransferNumberForSave({
        rawInputValue: "(855) 747-77",
        validTransferNumber: "",
      }),
    ).toEqual({
      ok: false,
      errorKey: "agent:fields.transferNumber.errors.invalid",
    });
  });

  it("clears the transfer number when the visible input is empty", () => {
    expect(
      resolveTransferNumberForSave({
        rawInputValue: "",
        validTransferNumber: "",
      }),
    ).toEqual({
      ok: true,
      value: null,
    });
  });

  it("saves the normalized transfer number when the current input is valid", () => {
    expect(
      resolveTransferNumberForSave({
        rawInputValue: "(514) 555-0123",
        validTransferNumber: "+15145550123",
      }),
    ).toEqual({
      ok: true,
      value: "+15145550123",
    });
  });
});

describe("buildAppointmentChangePolicyForSave", () => {
  it("enables appointment changes when at least one change type is allowed", () => {
    expect(
      buildAppointmentChangePolicyForSave({
        allowCancel: true,
        allowReschedule: false,
        verificationMode: "phone_match_and_facts",
      }),
    ).toEqual({
      enabled: true,
      allowCancel: true,
      allowReschedule: false,
      verificationMode: "phone_match_and_facts",
    });
  });

  it("stores the verification mode the operator picked", () => {
    expect(
      buildAppointmentChangePolicyForSave({
        allowCancel: true,
        allowReschedule: true,
        verificationMode: "otp_required",
      }),
    ).toEqual({
      enabled: true,
      allowCancel: true,
      allowReschedule: true,
      verificationMode: "otp_required",
    });
  });

  it("disables the policy when both change toggles are off", () => {
    expect(
      buildAppointmentChangePolicyForSave({
        allowCancel: false,
        allowReschedule: false,
        verificationMode: "otp_required",
      }),
    ).toEqual({
      enabled: false,
      allowCancel: false,
      allowReschedule: false,
      verificationMode: "otp_required",
    });
  });

  it("stores the keypad PIN mode", () => {
    expect(
      buildAppointmentChangePolicyForSave({
        allowCancel: true,
        allowReschedule: false,
        verificationMode: "passcode_required",
      }),
    ).toEqual({
      enabled: true,
      allowCancel: true,
      allowReschedule: false,
      verificationMode: "passcode_required",
    });
  });
});

describe("AgentBasicSettingsPage saves", () => {
  it("sends only the changed setting, not a cancelled greeting draft", async () => {
    const patches: unknown[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        patches.push(JSON.parse(String(init.body)));
        return Response.json({ profile: {} });
      }
      return Response.json({
        business: { defaultLocale: "en" },
        profile: { greeting: "Thanks for calling.", summary: "Clinic", summarySource: "operator", transferNumber: "+15145550123", transferMode: "on_request", appointmentChangePolicy: null, bookingMode: "instant" },
      });
    }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><AgentBasicSettingsPage businessId="business" canManageTenant /></QueryClientProvider>);

    const user = userEvent.setup();
    await waitFor(() => expect(screen.getAllByRole("button", { name: "agent:actions.editField" })[0]?.hasAttribute("disabled")).toBe(false));
    await user.click(screen.getAllByRole("button", { name: "agent:actions.editField" })[0]!);
    await user.type(await screen.findByPlaceholderText("agent:fields.greeting.placeholder"), " Discarded.");
    await user.click(screen.getByRole("button", { name: "agent:actions.cancel" }));

    await user.click(screen.getByRole("switch", { name: "agent:appointmentChanges.allowCancel.label" }));
    await waitFor(() => expect(patches).toHaveLength(1));
    await user.click(screen.getByRole("combobox", { name: "agent:fields.defaultLocale.label" }));
    await user.click(await screen.findByRole("option", { name: "common:callerLanguage.fr" }));
    await waitFor(() => expect(patches).toHaveLength(2));

    expect(patches).toEqual([
      { businessId: "business", appointmentChangePolicy: { enabled: true, allowCancel: false, allowReschedule: true, verificationMode: "phone_match_and_facts" } },
      { businessId: "business", locale: "fr" },
    ]);
    client.clear();
  });

  it("saves the keypad PIN check picked for appointment changes", async () => {
    const patches: unknown[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        patches.push(JSON.parse(String(init.body)));
        return Response.json({ profile: {} });
      }
      return Response.json({
        business: { defaultLocale: "en" },
        profile: { greeting: "Thanks for calling.", summary: "Clinic", summarySource: "operator", transferNumber: null, transferMode: "on_request", appointmentChangePolicy: { enabled: true, allowCancel: true, allowReschedule: false, verificationMode: "otp_required" }, bookingMode: "instant" },
      });
    }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><AgentBasicSettingsPage businessId="business" canManageTenant /></QueryClientProvider>);

    const user = userEvent.setup();
    const select = await screen.findByRole("combobox", { name: "agent:appointmentChanges.verification.label" });
    await waitFor(() => expect(select.textContent).toContain("agent:appointmentChanges.verification.options.otp_required"));
    await waitFor(() => expect(select.hasAttribute("data-disabled")).toBe(false));
    await user.click(select);
    expect(screen.queryByRole("option", { name: "agent:appointmentChanges.verification.options.operator_only" })).toBeNull();
    await user.click(await screen.findByRole("option", { name: "agent:appointmentChanges.verification.options.passcode_required" }));
    await waitFor(() => expect(patches).toHaveLength(1));

    expect(patches).toEqual([
      { businessId: "business", appointmentChangePolicy: { enabled: true, allowCancel: true, allowReschedule: false, verificationMode: "passcode_required" } },
    ]);
    expect(screen.getByText("agent:appointmentChanges.verification.descriptions.passcode_required")).toBeTruthy();
    client.clear();
  });

  it("keeps showing operator-only checks set through the API", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({
      business: { defaultLocale: "en" },
      profile: { greeting: "Thanks for calling.", summary: "Clinic", summarySource: "operator", transferNumber: null, transferMode: "on_request", appointmentChangePolicy: { enabled: true, allowCancel: true, allowReschedule: true, verificationMode: "operator_only" }, bookingMode: "instant" },
    })));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><AgentBasicSettingsPage businessId="business" canManageTenant /></QueryClientProvider>);

    const select = await screen.findByRole("combobox", { name: "agent:appointmentChanges.verification.label" });
    await waitFor(() => expect(select.textContent).toContain("agent:appointmentChanges.verification.options.operator_only"));
    await userEvent.click(select);
    expect(await screen.findByRole("option", { name: "agent:appointmentChanges.verification.options.operator_only" })).toBeTruthy();
    client.clear();
  });
});

describe("AgentBasicSettingsPage voice", () => {
  function renderWithVoice(voice: string | undefined) {
    const patches: unknown[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        patches.push(JSON.parse(String(init.body)));
        return Response.json({ profile: {} });
      }
      return Response.json({
        business: { defaultLocale: "en" },
        profile: { greeting: "Thanks for calling.", summary: "Clinic", summarySource: "operator", transferNumber: null, transferMode: "on_request", appointmentChangePolicy: null, bookingMode: "instant", ...(voice ? { voice } : {}) },
      });
    }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><AgentBasicSettingsPage businessId="business" canManageTenant /></QueryClientProvider>);
    return { client, patches };
  }

  it("shows the saved voice and saves the one picked in the voice dialog", async () => {
    const { client, patches } = renderWithVoice("cedar");
    const user = userEvent.setup();
    expect(await screen.findByText("voice=Cedar traits=fields.voice.traits")).toBeTruthy();
    const change = await screen.findByRole("button", { name: "agent:fields.voice.change" });
    await waitFor(() => expect((change as HTMLButtonElement).disabled).toBe(false));
    await user.click(change);
    await user.click(await screen.findByRole("button", { name: /^Shimmer/ }));
    await user.click(screen.getByRole("button", { name: "fields.voice.dialog.use" }));
    await waitFor(() => expect(patches).toEqual([{ businessId: "business", voice: "shimmer" }]));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    client.clear();
  });

  it("keeps the saved voice in use while a save runs, and the pick when it fails", async () => {
    let failSave: () => void = () => {};
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "PATCH") return await new Promise<Response>((resolve) => { failSave = () => resolve(Response.json({ error: "down" }, { status: 500 })); });
      return Response.json({
        business: { defaultLocale: "en" },
        profile: { greeting: "Thanks for calling.", summary: "Clinic", summarySource: "operator", transferNumber: null, transferMode: "on_request", appointmentChangePolicy: null, bookingMode: "instant", voice: "cedar" },
      });
    }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><AgentBasicSettingsPage businessId="business" canManageTenant /></QueryClientProvider>);
    const user = userEvent.setup();
    const change = await screen.findByRole("button", { name: "agent:fields.voice.change" });
    await waitFor(() => expect((change as HTMLButtonElement).disabled).toBe(false));
    await user.click(change);
    await user.click(await screen.findByRole("button", { name: /^Shimmer/ }));
    await user.click(screen.getByRole("button", { name: "fields.voice.dialog.use" }));

    const current = () => screen.getByRole("heading", { name: "fields.voice.dialog.current" }).parentElement!;
    expect(current().textContent).toContain("Cedar");
    act(() => failSave());
    await waitFor(() => expect((screen.getByRole("button", { name: "fields.voice.dialog.use" }) as HTMLButtonElement).disabled).toBe(false));
    expect(current().textContent).toContain("Cedar");
    expect(screen.getByRole("button", { name: /^Shimmer/ }).getAttribute("aria-pressed")).toBe("true");
    client.clear();
  });

  it("shows marin for a business that never picked a voice or has one calls no longer use", async () => {
    const { client } = renderWithVoice("nova");
    expect(await screen.findByText("voice=Marin traits=fields.voice.traits")).toBeTruthy();
    client.clear();
  });
});

describe("AgentBasicSettingsPage transfer number", () => {
  it("offers only the transfer countries, and says when the server refuses the number's country", async () => {
    const patches: unknown[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        patches.push(JSON.parse(String(init.body)));
        return Response.json({ error: "Your receptionist can't transfer calls to this country yet.", code: "transfer_country_unsupported" }, { status: 400 });
      }
      return Response.json({
        business: { defaultLocale: "en" },
        profile: { greeting: "Thanks for calling.", summary: "Clinic", summarySource: "operator", transferNumber: "+15145550123", transferMode: "on_request", appointmentChangePolicy: null, bookingMode: "instant" },
      });
    }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><AgentBasicSettingsPage businessId="business" canManageTenant /></QueryClientProvider>);

    const user = userEvent.setup();
    const country = await screen.findByRole("combobox", { name: "agent:fields.transferNumber.country" });
    expect(country.textContent).toContain("+1");
    await user.click(country);
    expect(await screen.findAllByRole("option")).toHaveLength(18);
    await user.keyboard("{Escape}");

    const input = document.getElementById("agent-transfer-number") as HTMLInputElement;
    await user.clear(input);
    await user.type(input, "+18769261234");
    await user.click(screen.getByRole("button", { name: "agent:actions.save" }));

    expect(await screen.findByText("agent:fields.transferNumber.errors.countryUnsupported")).toBeTruthy();
    expect(patches).toEqual([{ businessId: "business", transferNumber: "+18769261234" }]);
    client.clear();
  });

  it("keeps a number being typed when a refetch of the saved settings lands", async () => {
    const patches: unknown[] = [];
    const settings = (transferNumber: string | null = "+15145550123") => ({
      business: { defaultLocale: "en" },
      profile: { greeting: "Thanks for calling.", summary: "Clinic", summarySource: "operator", transferNumber, transferMode: "on_request", appointmentChangePolicy: null, bookingMode: "instant" },
    });
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        patches.push(JSON.parse(String(init.body)));
        return Response.json({ ok: true });
      }
      return Response.json(settings());
    }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><AgentBasicSettingsPage businessId="business" canManageTenant /></QueryClientProvider>);

    const user = userEvent.setup();
    await screen.findByRole("combobox", { name: "agent:fields.transferNumber.country" });
    const input = document.getElementById("agent-transfer-number") as HTMLInputElement;
    await user.clear(input);
    await user.type(input, "+15145550199");
    // The refetch an earlier save started arrives late, with the number that save stored.
    act(() => client.setQueryData(["agent-settings", "business"], settings("+15145550177")));
    await user.click(screen.getByRole("button", { name: "agent:actions.save" }));

    await waitFor(() => expect(patches).toEqual([{ businessId: "business", transferNumber: "+15145550199" }]));
    client.clear();
  });

  it("keeps a cleared number empty when a refetch lands, even if none was saved before", async () => {
    const patches: unknown[] = [];
    const settings = (transferNumber: string | null) => ({
      business: { defaultLocale: "en" },
      profile: { greeting: "Thanks for calling.", summary: "Clinic", summarySource: "operator", transferNumber, transferMode: "on_request", appointmentChangePolicy: null, bookingMode: "instant" },
    });
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        patches.push(JSON.parse(String(init.body)));
        return Response.json({ ok: true });
      }
      return Response.json(settings(null));
    }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><AgentBasicSettingsPage businessId="business" canManageTenant /></QueryClientProvider>);

    const user = userEvent.setup();
    await screen.findByRole("combobox", { name: "agent:fields.transferNumber.country" });
    const input = document.getElementById("agent-transfer-number") as HTMLInputElement;
    await user.type(input, "+15145550100");
    await user.clear(input);
    // The field is empty again, as it was when the page loaded, when a late refetch brings a saved number.
    act(() => client.setQueryData(["agent-settings", "business"], settings("+15145550177")));
    await user.type(input, "+15145550199");
    await user.click(screen.getByRole("button", { name: "agent:actions.save" }));

    await waitFor(() => expect(patches).toEqual([{ businessId: "business", transferNumber: "+15145550199" }]));
    client.clear();
  });

  it("shows the next business's number, not one typed for the last, after switching business", async () => {
    const settings = (transferNumber: string) => ({
      business: { defaultLocale: "en" },
      profile: { greeting: "Thanks for calling.", summary: "Clinic", summarySource: "operator", transferNumber, transferMode: "on_request", appointmentChangePolicy: null, bookingMode: "instant" },
    });
    vi.stubGlobal("fetch", vi.fn(async (url: string) => Response.json(settings(url.includes("business-b") ? "+15145550222" : "+15145550111"))));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const page = (businessId: string) => <QueryClientProvider client={client}><AgentBasicSettingsPage businessId={businessId} canManageTenant /></QueryClientProvider>;
    const { rerender } = render(page("business-a"));

    const user = userEvent.setup();
    const input = () => document.getElementById("agent-transfer-number") as HTMLInputElement;
    await waitFor(() => expect(input()?.value.replace(/\D/g, "")).toBe("5145550111"));
    await user.clear(input());
    await user.type(input(), "+15145550199");
    // The workspace switcher keeps the page mounted and only changes the business.
    rerender(page("business-b"));

    await waitFor(() => expect(input()?.value.replace(/\D/g, "")).toBe("5145550222"));
    client.clear();
  });
});
