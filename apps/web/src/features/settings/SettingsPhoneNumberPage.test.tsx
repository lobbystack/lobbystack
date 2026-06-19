import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { getFunctionName } from "convex/server";
import type { ReactElement, ReactNode } from "react";
import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Id } from "../../../../../convex/_generated/dataModel";
import { SettingsPhoneNumberPage } from "./SettingsPhoneNumberPage";

const {
  claimReplacementNumberMock,
  getInitialReplacementNumberSuggestionMock,
  navigateMock,
  searchReplacementNumbersMock,
  toastSuccessMock,
  useObservedActionMock,
  useQueryMock,
} = vi.hoisted(() => ({
  claimReplacementNumberMock: vi.fn(),
  getInitialReplacementNumberSuggestionMock: vi.fn(),
  navigateMock: vi.fn(),
  searchReplacementNumbersMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  useObservedActionMock: vi.fn(),
  useQueryMock: vi.fn(),
}));

vi.mock("convex/react", () => ({
  useQuery: (...args: unknown[]) => useQueryMock(...args),
}));

vi.mock("@/lib/observed-convex", () => ({
  useObservedAction: (...args: unknown[]) => useObservedActionMock(...args),
}));

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
  },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: "en" },
    t: (key: string) => {
      const translations: Record<string, string> = {
        "phoneNumber.current.label": "Current phone number",
        "phoneNumber.current.description":
          "This is the number callers use to reach your AI receptionist.",
        "phoneNumber.current.empty": "You don't have a number yet.",
        "phoneNumber.actions.requestChange": "Request change",
        "phoneNumber.actions.getNumber": "Get number",
        "phoneNumber.dialog.title": "Choose a new phone number",
        "phoneNumber.dialog.description": "You can change your phone number once.",
        "phoneNumber.dialog.getNumberTitle": "Choose a phone number",
        "phoneNumber.dialog.getNumberDescription":
          "Pick a number callers can use to reach your AI receptionist.",
        "phoneNumber.picker.countryLabel": "Country",
        "phoneNumber.picker.areaCodeLabel": "Area code",
        "phoneNumber.picker.areaCodePlaceholder": "Area code",
        "phoneNumber.picker.search": "Search",
        "phoneNumber.picker.phoneNumberHeader": "Phone number",
        "phoneNumber.picker.select": "Select",
        "phoneNumber.picker.loadMore": "Load more",
        "phoneNumber.picker.empty": "No numbers matched that search.",
        "phoneNumber.picker.loadFailed": "We couldn't load numbers right now.",
        "phoneNumber.picker.searchFailed": "We couldn't search numbers right now.",
        "phoneNumber.picker.claimFailed":
          "We couldn't replace the phone number. Please try again.",
        "phoneNumber.picker.unavailable":
          "That number was just taken. Pick another one from the refreshed list.",
        "phoneNumber.toast.changed":
          "Phone number changed. Your previous number will stay active for 30 days.",
        "phoneNumber.toast.added": "Phone number added.",
      };

      return translations[key] ?? key;
    },
  }),
}));

vi.mock("react-router-dom", () => ({
  useNavigate: () => navigateMock,
}));

vi.mock("@/components/ui/dialog", async () => {
  const ReactModule = await vi.importActual<typeof import("react")>("react");
  const DialogContext = ReactModule.createContext<{
    open: boolean;
    onOpenChange?: (open: boolean) => void;
  }>({ open: false });

  function Dialog({
    children,
    onOpenChange,
    open = false,
  }: {
    children: ReactNode;
    onOpenChange?: (open: boolean) => void;
    open?: boolean;
  }) {
    const value = {
      open,
      ...(onOpenChange ? { onOpenChange } : {}),
    };

    return (
      <DialogContext.Provider value={value}>
        {children}
      </DialogContext.Provider>
    );
  }

  function DialogTrigger({
    children,
    render: trigger,
  }: {
    children: ReactNode;
    render: ReactElement;
  }) {
    const { onOpenChange } = ReactModule.useContext(DialogContext);

    return ReactModule.cloneElement(trigger as ReactElement<Record<string, unknown>>, {
      children,
      onClick: () => onOpenChange?.(true),
    });
  }

  function DialogContent({ children }: { children: ReactNode }) {
    const { open } = ReactModule.useContext(DialogContext);

    return open ? <div>{children}</div> : null;
  }

  return {
    Dialog,
    DialogContent,
    DialogDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
    DialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
    DialogTrigger,
  };
});

const businessId = "business_phone_number" as Id<"businesses">;

const currentPhoneNumber = {
  _id: "phone_current" as Id<"phone_numbers">,
  e164: "+14165550123",
  voiceEnabled: true,
  smsEnabled: true,
  status: "active",
};

const suggestedNumber = {
  e164: "+14165550124",
  display: "(416) 555-0124",
  locality: "Toronto",
  region: "ON",
  countryCode: "CA",
  kind: "local" as const,
  capabilities: { sms: true, voice: true },
  selectionContext: { mode: "area_code" as const, countryCode: "CA", areaCode: "416" },
  claimToken: "claim_token_124",
};

const refreshedNumber = {
  ...suggestedNumber,
  e164: "+14165550125",
  display: "(416) 555-0125",
  claimToken: "claim_token_125",
};

function renderPage(
  canManageTenant = true,
  props: Partial<React.ComponentProps<typeof SettingsPhoneNumberPage>> = {},
) {
  return render(
    <SettingsPhoneNumberPage
      businessId={businessId}
      canManageTenant={canManageTenant}
      {...props}
    />,
  );
}

describe("SettingsPhoneNumberPage", () => {
  beforeEach(() => {
    claimReplacementNumberMock.mockReset();
    getInitialReplacementNumberSuggestionMock.mockReset();
    navigateMock.mockReset();
    searchReplacementNumbersMock.mockReset();
    toastSuccessMock.mockReset();
    useObservedActionMock.mockReset();
    useQueryMock.mockReset();

    useQueryMock.mockReturnValue(currentPhoneNumber);
    getInitialReplacementNumberSuggestionMock.mockResolvedValue({
      market: { countryCode: "CA", areaCode: "416" },
      suggestion: suggestedNumber,
      alternatives: [],
    });
    searchReplacementNumbersMock.mockResolvedValue({
      market: { countryCode: "CA", areaCode: "416" },
      selectionContext: suggestedNumber.selectionContext,
      numbers: [suggestedNumber],
    });
    claimReplacementNumberMock.mockResolvedValue({
      status: "claimed",
      phoneNumberId: "phone_new" as Id<"phone_numbers">,
      e164: suggestedNumber.e164,
    });
    useObservedActionMock.mockImplementation((reference: unknown) => {
      const name = getFunctionName(reference as never);
      if (name === "settings/phoneNumbers:getInitialReplacementNumberSuggestion") {
        return getInitialReplacementNumberSuggestionMock;
      }
      if (name === "settings/phoneNumbers:searchReplacementNumbers") {
        return searchReplacementNumbersMock;
      }
      if (name === "settings/phoneNumbers:claimReplacementNumber") {
        return claimReplacementNumberMock;
      }
      throw new Error(`Unexpected action reference ${name}.`);
    });
  });

  it("shows the current phone number and request-change action for admins", () => {
    renderPage();

    expect(screen.getByText("Current phone number")).toBeTruthy();
    expect(screen.getByText("(416) 555-0123")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Request change" })).toBeTruthy();
  });

  it("disables the request-change action after the one allowed change is used", () => {
    renderPage(true, { phoneNumberReplacementUsedAt: "2026-06-17T21:00:00.000Z" });

    expect(screen.getByRole("button", { name: "Request change" })).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("shows a get-number action when no phone number is assigned", () => {
    useQueryMock.mockReturnValue(null);

    renderPage();

    expect(screen.getByText("You don't have a number yet.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Get number" })).toHaveProperty(
      "disabled",
      false,
    );
    expect(screen.queryByRole("button", { name: "Request change" })).toBeNull();
  });

  it("hides the request-change action from non-admin members", () => {
    renderPage(false);

    expect(screen.getByText("(416) 555-0123")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Request change" })).toBeNull();
  });

  it("opens the replacement chooser in a modal", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: "Request change" }));

    expect(await screen.findByRole("heading", { name: "Choose a new phone number" })).toBeTruthy();
    expect(await screen.findByText("You can change your phone number once.")).toBeTruthy();
    expect(await screen.findByText("(416) 555-0124")).toBeTruthy();
  });

  it("opens the phone number chooser from the get-number action", async () => {
    const user = userEvent.setup();
    useQueryMock.mockReturnValue(null);
    renderPage();

    await user.click(screen.getByRole("button", { name: "Get number" }));

    expect(await screen.findByRole("heading", { name: "Choose a phone number" })).toBeTruthy();
    expect(
      await screen.findByText("Pick a number callers can use to reach your AI receptionist."),
    ).toBeTruthy();
    expect(await screen.findByText("(416) 555-0124")).toBeTruthy();
  });

  it("routes first-number users to phone verification when their mobile is unverified", async () => {
    const user = userEvent.setup();
    useQueryMock.mockReturnValue(null);
    getInitialReplacementNumberSuggestionMock.mockRejectedValueOnce(
      new Error("Verify your mobile number before choosing a business number."),
    );
    renderPage();

    await user.click(screen.getByRole("button", { name: "Get number" }));

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith("/onboarding/verify-phone");
    });
  });

  it("refreshes alternatives when a selected number becomes unavailable", async () => {
    const user = userEvent.setup();
    claimReplacementNumberMock.mockResolvedValueOnce({
      status: "unavailable",
      message: "The selected phone number is no longer available.",
      alternatives: [refreshedNumber],
    });
    renderPage();

    await user.click(screen.getByRole("button", { name: "Request change" }));
    await user.click(await screen.findByRole("button", { name: "Select" }));

    expect(
      await screen.findByText("That number was just taken. Pick another one from the refreshed list."),
    ).toBeTruthy();
    expect(await screen.findByText("(416) 555-0125")).toBeTruthy();
  });

  it("claims a replacement number and shows a success toast", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: "Request change" }));
    await user.click(await screen.findByRole("button", { name: "Select" }));

    await waitFor(() => {
      expect(claimReplacementNumberMock).toHaveBeenCalledWith({
        businessId,
        e164: suggestedNumber.e164,
        selectionContext: suggestedNumber.selectionContext,
        claimToken: suggestedNumber.claimToken,
      });
    });
    expect(toastSuccessMock).toHaveBeenCalledWith(
      "Phone number changed. Your previous number will stay active for 30 days.",
    );
  });

  it("claims a first phone number and shows an added toast", async () => {
    const user = userEvent.setup();
    useQueryMock.mockReturnValue(null);
    renderPage();

    await user.click(screen.getByRole("button", { name: "Get number" }));
    await user.click(await screen.findByRole("button", { name: "Select" }));

    await waitFor(() => {
      expect(claimReplacementNumberMock).toHaveBeenCalledWith({
        businessId,
        e164: suggestedNumber.e164,
        selectionContext: suggestedNumber.selectionContext,
        claimToken: suggestedNumber.claimToken,
      });
    });
    expect(toastSuccessMock).toHaveBeenCalledWith("Phone number added.");
  });
});
