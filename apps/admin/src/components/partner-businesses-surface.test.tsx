// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

import { PartnerBusinessesSurface } from "./partner-businesses-surface";

afterEach(() => { cleanup(); });

it("shows the console's Businesses page empty, since a partner can't create businesses yet", () => {
  render(<PartnerBusinessesSurface />);
  expect(screen.getByRole("heading", { level: 1, name: "businesses.title" })).toBeTruthy();
  expect(screen.getByRole("heading", { level: 2, name: "businesses.empty.title" })).toBeTruthy();
  expect(screen.getByText("businesses.empty.description")).toBeTruthy();
  expect(screen.queryByRole("table")).toBeNull();
});
