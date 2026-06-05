import { render, screen } from "@testing-library/react";
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  useOutletContext,
} from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { AgentLayout } from "./AgentLayout";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("./AddKnowledgeSheet", () => ({
  AddKnowledgeSheet: ({ open }: { open?: boolean }) =>
    open ? <div>rule-dialog-open</div> : null,
}));

vi.mock("./KnowledgeActionsMenu", () => ({
  KnowledgeActionsMenu: () => <div>knowledge-actions</div>,
}));

function LocationProbe() {
  const location = useLocation();

  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
}

function RulesOutlet() {
  const context = useOutletContext<{ headerActions?: React.ReactNode }>();

  return (
    <div>
      <div>Rules page</div>
      {context.headerActions}
    </div>
  );
}

describe("AgentLayout setup links", () => {
  it("opens the Add Rule dialog from the setup param and consumes it", async () => {
    render(
      <MemoryRouter initialEntries={["/agent/rules?setup=rule"]}>
        <Routes>
          <Route
            element={
              <>
                <AgentLayout
                  businessId={"business-1" as any}
                  canManageTenant
                />
                <LocationProbe />
              </>
            }
            path="/agent/*"
          >
            <Route element={<RulesOutlet />} path="rules" />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("rule-dialog-open")).toBeTruthy();
    expect(screen.getByTestId("location").textContent).toBe("/agent/rules");
  });
});
