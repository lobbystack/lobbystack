import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SetupGuidePage } from "./SetupGuidePage";

const setupGuideQueryState = vi.hoisted(() => ({
  progress: undefined as
    | {
        steps: Array<{
          id: "website" | "sources" | "calendar" | "services" | "rules";
          completed: boolean;
        }>;
        completedSteps: number;
        totalSteps: number;
        allCompleted: boolean;
      }
    | undefined,
}));
const setupGuideMutationState = vi.hoisted(() => ({
  skipStep: vi.fn(),
}));

vi.mock("convex/react", () => ({
  useQuery: () => setupGuideQueryState.progress,
}));

vi.mock("@/lib/observed-convex", () => ({
  useObservedMutation: () => setupGuideMutationState.skipStep,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, number>) => {
      const translations: Record<string, string> = {
        "sidebar.setupGuide.title": "Getting started",
        "sidebar.setupGuide.description": `${options?.completed ?? 0} of ${options?.total ?? 5} setup steps complete.`,
        "sidebar.setupGuide.skip": "Skip tutorial",
        "sidebar.setupGuide.skipStep": "Skip",
        "sidebar.setupGuide.steps.website": "Add your website",
        "sidebar.setupGuide.steps.sources": "Add more sources",
        "sidebar.setupGuide.steps.calendar": "Connect your calendar",
        "sidebar.setupGuide.steps.services": "Add your Services",
        "sidebar.setupGuide.steps.rules": "Define Rules",
        "sidebar.setupGuide.stepDescriptions.website": "Import your public website.",
        "sidebar.setupGuide.stepDescriptions.sources": "Upload a document.",
        "sidebar.setupGuide.stepDescriptions.calendar": "Connect a calendar.",
        "sidebar.setupGuide.stepDescriptions.services": "Add services.",
        "sidebar.setupGuide.stepDescriptions.rules": "Define instructions.",
        "sidebar.setupGuide.stepActions.website": "Add website",
        "sidebar.setupGuide.stepActions.sources": "Upload document",
        "sidebar.setupGuide.stepActions.calendar": "Connect calendar",
        "sidebar.setupGuide.stepActions.services": "Add service",
        "sidebar.setupGuide.stepActions.rules": "Add rule",
      };

      return translations[key] ?? key;
    },
  }),
}));

type StepId = "website" | "sources" | "calendar" | "services" | "rules";

const stepIds: Array<StepId> = [
  "website",
  "sources",
  "calendar",
  "services",
  "rules",
];

function setupProgress(completedIds: Array<StepId>) {
  const steps = stepIds.map((id) => ({
    id,
    completed: completedIds.includes(id),
  }));
  setupGuideQueryState.progress = {
    steps,
    completedSteps: completedIds.length,
    totalSteps: steps.length,
    allCompleted: completedIds.length === steps.length,
  };
}

function LocationProbe() {
  const location = useLocation();

  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/setup-guide"]}>
      <Routes>
        <Route
          element={<SetupGuidePage businessId={"business-1" as any} />}
          path="/setup-guide"
        />
      </Routes>
      <LocationProbe />
    </MemoryRouter>,
  );
}

describe("SetupGuidePage", () => {
  beforeEach(() => {
    setupGuideQueryState.progress = undefined;
    setupGuideMutationState.skipStep.mockReset();
    setupGuideMutationState.skipStep.mockResolvedValue({ stepId: "sources" });
  });

  it("renders the full setup checklist layout with the active incomplete step expanded", () => {
    setupProgress(["website", "services"]);

    renderPage();

    expect(screen.getByRole("heading", { name: "Getting started" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Skip tutorial" })).toBeTruthy();
    expect(screen.getByText("2 of 5 setup steps complete.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Add your website/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Add more sources/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Connect your calendar/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Add your Services/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Define Rules/i })).toBeTruthy();
    expect(screen.getByText("Upload a document.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Upload document" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Skip" })).toBeTruthy();
  });

  it("leaves the setup guide when the tutorial is skipped", async () => {
    const user = userEvent.setup();
    setupProgress(["website", "services"]);

    renderPage();

    await user.click(screen.getByRole("button", { name: "Skip tutorial" }));

    expect(screen.getByTestId("location").textContent).toBe("/");
  });

  it("marks an individual step skipped and advances to the next accordion item", async () => {
    const user = userEvent.setup();
    setupProgress(["website", "services"]);

    renderPage();

    expect(screen.getByText("Upload a document.")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Skip" }));

    expect(setupGuideMutationState.skipStep).toHaveBeenCalledWith({
      businessId: "business-1",
      stepId: "sources",
    });
    expect(screen.getByText("Connect a calendar.")).toBeTruthy();
  });

  it.each([
    ["website", "Add website", "/agent/knowledge?setup=website"],
    ["sources", "Upload document", "/agent/knowledge?setup=upload"],
    ["calendar", "Connect calendar", "/integrations?setup=calendar"],
    ["services", "Add service", "/agent/services?setup=service"],
    ["rules", "Add rule", "/agent/rules?setup=rule"],
  ] as const)("navigates the %s action to its setup target", async (step, action, target) => {
    const user = userEvent.setup();
    const completedIds = stepIds.slice(0, stepIds.indexOf(step));
    setupProgress(completedIds);

    renderPage();

    await user.click(screen.getByRole("button", { name: action }));

    expect(screen.getByTestId("location").textContent).toBe(target);
  });

  it("redirects away once every setup step is complete", () => {
    setupProgress(["website", "sources", "calendar", "services", "rules"]);

    renderPage();

    expect(screen.getByTestId("location").textContent).toBe("/");
  });
});
