// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { PasswordResetForm } from "./password-reset-form";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("disables a missing token and uses translated validation", async () => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  const view = render(<PasswordResetForm token={null} />);
  expect(screen.getByRole("button", { name: "forgotPassword.verifySubmit" }).hasAttribute("disabled")).toBe(true);
  view.unmount();
  render(<PasswordResetForm token="legacy-token" />);
  await userEvent.type(screen.getByLabelText("forgotPassword.newPassword"), "weakpassword");
  await userEvent.click(screen.getByRole("button", { name: "forgotPassword.verifySubmit" }));
  expect(screen.getByText("errors.invalidPassword")).toBeTruthy();
  expect(fetcher).not.toHaveBeenCalled();
});
it("accepts an existing reset link and shows translated completion", async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json({ status: true })); vi.stubGlobal("fetch", fetcher);
  render(<PasswordResetForm token="legacy-token" />);
  await userEvent.type(screen.getByLabelText("forgotPassword.newPassword"), "New-Password-123!");
  await userEvent.click(screen.getByRole("button", { name: "forgotPassword.verifySubmit" }));
  await screen.findByText("forgotPassword.resetComplete");
  expect(JSON.parse(fetcher.mock.calls[0]?.[1].body)).toEqual({ token: "legacy-token", newPassword: "New-Password-123!" });
  expect(screen.queryByLabelText("forgotPassword.newPassword")).toBeNull();
});
