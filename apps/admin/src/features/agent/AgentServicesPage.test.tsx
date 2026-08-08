import { render, screen } from "@testing-library/react";
import * as React from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { AgentServicesPage } from "./AgentServicesPage";

vi.mock("convex/react", () => ({
  useQuery: () => ({
    services: [],
  }),
}));

vi.mock("@/lib/observed-convex", () => ({
  useObservedAction: () => vi.fn(),
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
    DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DialogTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DialogTrigger: ({ render }: { render?: React.ReactNode }) => <>{render}</>,
  };
});

function LocationProbe() {
  const location = useLocation();

  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
}

describe("AgentServicesPage setup links", () => {
  it("opens the Add Service dialog from the setup param and consumes it", async () => {
    render(
      <MemoryRouter initialEntries={["/agent/services?setup=service"]}>
        <AgentServicesPage
          businessId={"business-1" as any}
          canManageTenant
        />
        <LocationProbe />
      </MemoryRouter>,
    );

    expect(await screen.findByText("sections.services.addKnowledgeDescription")).toBeTruthy();
    expect(screen.getByTestId("location").textContent).toBe("/agent/services");
  });
});
