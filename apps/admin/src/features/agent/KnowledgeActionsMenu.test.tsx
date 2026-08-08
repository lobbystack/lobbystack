import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { KnowledgeActionsMenu } from "./KnowledgeActionsMenu";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@/components/ui/dropdown-menu", async () => {
  const ReactModule = await vi.importActual<typeof import("react")>("react");
  const DropdownMenuContext = ReactModule.createContext({
    open: false,
    setOpen: (_nextOpen: boolean) => {},
  });

  function DropdownMenu({ children }: { children: React.ReactNode }) {
    const [open, setOpen] = ReactModule.useState(false);

    return (
      <DropdownMenuContext.Provider value={{ open, setOpen }}>
        {children}
      </DropdownMenuContext.Provider>
    );
  }

  function DropdownMenuTrigger({
    render,
  }: {
    render: React.ReactElement<React.ComponentProps<"button">>;
  }) {
    const { setOpen } = ReactModule.useContext(DropdownMenuContext);

    return ReactModule.cloneElement(render, {
      onClick: (event: React.MouseEvent<HTMLButtonElement>) => {
        render.props.onClick?.(event);
        setOpen(true);
      },
    });
  }

  function DropdownMenuContent({ children, ...props }: React.ComponentProps<"div">) {
    const { open } = ReactModule.useContext(DropdownMenuContext);
    if (!open) {
      return null;
    }

    return <div {...props}>{children}</div>;
  }

  function DropdownMenuGroup({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
  }

  function DropdownMenuItem({
    children,
    onClick,
    ...props
  }: React.ComponentProps<"button">) {
    return (
      <button
        {...props}
        onClick={onClick}
        type="button"
      >
        {children}
      </button>
    );
  }

  return {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuTrigger,
  };
});

vi.mock("./UploadKnowledgeDocumentSheet", () => ({
  UploadKnowledgeDocumentSheet: ({ open }: { open?: boolean }) =>
    open ? <div>upload-sheet-open</div> : null,
}));

vi.mock("./ImportWebsiteKnowledgeSheet", () => ({
  ImportWebsiteKnowledgeSheet: ({ open }: { open?: boolean }) =>
    open ? <div>website-sheet-open</div> : null,
}));

vi.mock("./AddKnowledgeSheet", () => ({
  AddKnowledgeSheet: ({ open }: { open?: boolean }) => (open ? <div>text-sheet-open</div> : null),
}));

describe("KnowledgeActionsMenu", () => {
  it("opens upload, website, and text flows from the add knowledge dropdown", async () => {
    render(
      <MemoryRouter>
        <KnowledgeActionsMenu businessId={"business-1" as never} />
      </MemoryRouter>,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "sections.knowledge.addKnowledge" }));

    expect(
      screen.getByRole("button", {
        name: "sections.knowledge.addKnowledgeOptions.upload",
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: "sections.knowledge.addKnowledgeOptions.website",
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: "sections.knowledge.addKnowledgeOptions.text",
      }),
    ).toBeTruthy();

    await user.click(
      screen.getByRole("button", {
        name: "sections.knowledge.addKnowledgeOptions.upload",
      }),
    );
    expect(screen.getByText("upload-sheet-open")).toBeTruthy();

    await user.click(
      screen.getByRole("button", {
        name: "sections.knowledge.addKnowledgeOptions.website",
      }),
    );
    expect(screen.getByText("website-sheet-open")).toBeTruthy();

    await user.click(
      screen.getByRole("button", {
        name: "sections.knowledge.addKnowledgeOptions.text",
      }),
    );
    expect(screen.getByText("text-sheet-open")).toBeTruthy();
  });

  it("opens setup-targeted knowledge dialogs and removes the setup param", async () => {
    function LocationProbe() {
      const location = useLocation();

      return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
    }

    const { unmount } = render(
      <MemoryRouter initialEntries={["/agent/knowledge?setup=upload"]}>
        <KnowledgeActionsMenu businessId={"business-1" as never} />
        <LocationProbe />
      </MemoryRouter>,
    );

    expect(await screen.findByText("upload-sheet-open")).toBeTruthy();
    expect(screen.getByTestId("location").textContent).toBe("/agent/knowledge");

    unmount();

    render(
      <MemoryRouter initialEntries={["/agent/knowledge?setup=website"]}>
        <KnowledgeActionsMenu businessId={"business-1" as never} />
        <LocationProbe />
      </MemoryRouter>,
    );

    expect(await screen.findByText("website-sheet-open")).toBeTruthy();
    expect(screen.getByTestId("location").textContent).toBe("/agent/knowledge");
  });
});
