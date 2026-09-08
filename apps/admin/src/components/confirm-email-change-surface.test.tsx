// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { ConfirmEmailChangeSurface } from "./confirm-email-change-surface";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState({}, "", "/"); });
it.each([true, false])("renders original inline confirmation state for success=%s", async success => {
  window.history.replaceState({}, "", "/confirm-email-change?token=fixture&email=new@example.invalid");
  const fetcher = vi.fn(async (url: string) => url.includes("get-session") ? Response.json({ user: { id: "fixture" } }) : Response.json(success ? { status: true, user: { email: "new@example.invalid" } } : { error: "Invalid token" }, { status: success ? 200 : 401 }));
  vi.stubGlobal("fetch", fetcher);
  render(<ConfirmEmailChangeSurface />);
  const button = screen.getByRole("button", { name: "confirmEmailChange.submit" });
  await waitFor(() => expect(button.hasAttribute("disabled")).toBe(false));
  await userEvent.click(button);
  await screen.findByText(success ? "confirmEmailChange.success" : "confirmEmailChange.invalidLink");
  expect(button.hasAttribute("disabled")).toBe(success);
  expect(screen.getByRole("link", { name: "confirmEmailChange.backToSettings" }).getAttribute("href")).toBe("/settings/usage");
  expect(fetcher.mock.calls.some(([url]) => url === "/api/auth/verify-email?token=fixture")).toBe(true);
});
