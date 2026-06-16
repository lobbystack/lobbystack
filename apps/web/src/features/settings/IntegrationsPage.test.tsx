import { render, screen } from "@testing-library/react";
import * as React from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { IntegrationsPage } from "./IntegrationsPage";

const useQueryMock = vi.fn((_query: unknown, _args: unknown) => []);

vi.mock("convex/react", () => ({
  useQuery: (query: unknown, args: unknown) => useQueryMock(query, args),
}));

vi.mock("@/lib/observed-convex", () => ({
  useObservedAction: () => vi.fn(async () => []),
}));

vi.mock("@/lib/analytics", () => ({
  captureAnalyticsEvent: vi.fn(),
  captureAnalyticsException: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: {
      language: "en",
      resolvedLanguage: "en",
    },
    t: (key: string) => key,
  }),
}));

vi.mock("@/components/ui/dialog", async () => {
  const ReactModule = await vi.importActual<typeof import("react")>("react");
  const DialogContext = ReactModule.createContext({ open: false });

  function Dialog({
    children,
    open = false,
  }: {
    children: React.ReactNode;
    open?: boolean;
  }) {
    return (
      <DialogContext.Provider value={{ open }}>
        {children}
      </DialogContext.Provider>
    );
  }

  function DialogContent({ children }: { children: React.ReactNode }) {
    const { open } = ReactModule.useContext(DialogContext);

    return open ? <div>{children}</div> : null;
  }

  return {
    Dialog,
    DialogContent,
    DialogDescription: ({ children }: { children: React.ReactNode }) => (
      <div>{children}</div>
    ),
    DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DialogTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  };
});

function LocationProbe() {
  const location = useLocation();

  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
}

describe("IntegrationsPage setup links", () => {
  it("does not subscribe to admin-only calendar connections for viewers", () => {
    render(
      <MemoryRouter initialEntries={["/integrations"]}>
        <IntegrationsPage
          businessId={"business-1" as any}
          canManageTenant={false}
        />
      </MemoryRouter>,
    );

    expect(useQueryMock).toHaveBeenCalledWith(expect.anything(), "skip");
    expect(screen.getByText("integrations.cards.google.title")).toBeTruthy();
    expect(screen.getByText("integrations.cards.microsoft.title")).toBeTruthy();
  });

  it("opens the calendar dialog from the setup param and consumes it", async () => {
    render(
      <MemoryRouter initialEntries={["/integrations?setup=calendar"]}>
        <IntegrationsPage businessId={"business-1" as any} />
        <LocationProbe />
      </MemoryRouter>,
    );

    expect(await screen.findByText("integrations.google.sheetDescription")).toBeTruthy();
    expect(screen.getByTestId("location").textContent).toBe("/integrations");
  });
});
