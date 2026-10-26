// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ signOut: vi.fn() }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string, values?: Record<string, string>) => values?.email ? `${key}:${values.email}` : key }) }));
vi.mock("@/hooks/use-sign-out", () => ({ useSignOut: () => fixture.signOut }));
vi.mock("@/components/replacement-onboarding-shell", () => ({ ReplacementOnboardingShell: ({ children, title, description }: { children: React.ReactNode; title: string; description: string }) => <main><h1>{title}</h1><p>{description}</p>{children}</main> }));

import { NoBusinessesSurface } from "./no-businesses-surface";

afterEach(() => { cleanup(); vi.clearAllMocks(); });

it("says the partner hasn't added the account to a business, and offers another account", async () => {
  render(<NoBusinessesSurface email="owner@example.com" />);
  expect(screen.getByRole("heading", { name: "noBusinesses.title" })).toBeTruthy();
  expect(screen.getByText("noBusinesses.description:owner@example.com")).toBeTruthy();
  // It never offers to create a business: a partner's domain makes none.
  expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual(["noBusinesses.switchAccount"]);
  await userEvent.click(screen.getByRole("button", { name: "noBusinesses.switchAccount" }));
  expect(fixture.signOut).toHaveBeenCalledOnce();
});
