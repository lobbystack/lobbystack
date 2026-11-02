// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";

import { AccountSecurityForms } from "./account-security-forms";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string, options?: { email?: string }) => (options?.email ? `${key}:${options.email}` : key) }) }));

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(Response.json({}));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

async function openEmailDialog() {
  render(<AccountSecurityForms currentEmail="owner@example.com" />);
  await userEvent.click(screen.getAllByRole("button", { name: "account.actions.change" })[0]!);
  return await screen.findByLabelText("account.changeEmail.newEmailLabel");
}
const send = () => userEvent.click(screen.getByRole("button", { name: "account.changeEmail.save" }));

describe("change email dialog", () => {
  it("shows the current email in a disabled field and keeps sending enabled", async () => {
    await openEmailDialog();
    expect((screen.getByLabelText("account.changeEmail.currentEmailLabel") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText("account.changeEmail.currentEmailLabel") as HTMLInputElement).value).toBe("owner@example.com");
    expect((screen.getByRole("button", { name: "account.changeEmail.save" }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByText("account.changeEmail.errors.required")).toBeNull();
  });

  it("marks the field invalid under the input after a send attempt, without calling the server", async () => {
    const input = await openEmailDialog();
    await send();
    expect(await screen.findByText("account.changeEmail.errors.required")).toBeTruthy();
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toBe(screen.getByText("account.changeEmail.errors.required").id);
    await userEvent.type(input, "not-an-email");
    expect(screen.getByText("account.changeEmail.errors.invalid")).toBeTruthy();
    await userEvent.clear(input);
    await userEvent.type(input, " Owner@Example.com ");
    expect(screen.getByText("account.changeEmail.errors.unchanged")).toBeTruthy();
    await send();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the trimmed address and closes", async () => {
    const input = await openEmailDialog();
    await userEvent.type(input, "  new@example.com ");
    await send();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/auth/change-email", expect.objectContaining({ body: JSON.stringify({ newEmail: "new@example.com", callbackURL: "/settings/account?emailChanged=true" }) })));
    await waitFor(() => expect(screen.queryByLabelText("account.changeEmail.newEmailLabel")).toBeNull());
    // A toast confirms it; nothing is left on the page.
    expect(toast.success).toHaveBeenCalledWith("account.changeEmail.confirmationSent:new@example.com");
    expect(screen.queryByText("account.changeEmail.confirmationSent:new@example.com")).toBeNull();
  });

  it("shows the server's refusal under the field", async () => {
    fetchMock.mockResolvedValue(Response.json({ message: "An account with that email already exists." }, { status: 400 }));
    const input = await openEmailDialog();
    await userEvent.type(input, "taken@example.com");
    await send();
    expect(await screen.findByText("An account with that email already exists.")).toBeTruthy();
    expect(input.getAttribute("aria-invalid")).toBe("true");
  });

  it("clears what was typed and any error when cancelled", async () => {
    const input = await openEmailDialog();
    await userEvent.type(input, "x");
    await send();
    await userEvent.click(screen.getByRole("button", { name: "account.actions.cancel" }));
    await waitFor(() => expect(screen.queryByLabelText("account.changeEmail.newEmailLabel")).toBeNull());
    await userEvent.click(screen.getAllByRole("button", { name: "account.actions.change" })[0]!);
    const reopened = await screen.findByLabelText("account.changeEmail.newEmailLabel") as HTMLInputElement;
    expect(reopened.value).toBe("");
    expect(screen.queryByText("account.changeEmail.errors.invalid")).toBeNull();
  });
});

describe("change password dialog", () => {
  async function openPasswordDialog() {
    render(<AccountSecurityForms currentEmail="owner@example.com" />);
    await userEvent.click(screen.getAllByRole("button", { name: "account.actions.change" })[1]!);
    return {
      current: await screen.findByLabelText("account.changePassword.currentPasswordLabel") as HTMLInputElement,
      next: screen.getByLabelText("account.changePassword.newPasswordLabel") as HTMLInputElement,
      confirm: screen.getByLabelText("account.changePassword.confirmPasswordLabel") as HTMLInputElement,
    };
  }
  const save = () => userEvent.click(screen.getByRole("button", { name: "account.changePassword.save" }));

  it("keeps saving enabled and marks each empty field under its input after a save attempt", async () => {
    const { current, next, confirm } = await openPasswordDialog();
    expect((screen.getByRole("button", { name: "account.changePassword.save" }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByText("account.changePassword.errors.currentRequired")).toBeNull();
    await save();
    for (const [field, key] of [[current, "currentRequired"], [next, "newRequired"], [confirm, "confirmRequired"]] as const) {
      const message = await screen.findByText(`account.changePassword.errors.${key}`);
      expect(field.getAttribute("aria-invalid")).toBe("true");
      expect(field.getAttribute("aria-describedby")).toBe(message.id);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("checks the policy, a different password, and that the two new ones match", async () => {
    const { current, next, confirm } = await openPasswordDialog();
    await userEvent.type(current, "Old-pass1!");
    await userEvent.type(next, "short");
    await save();
    // Every requirement it misses is listed, as bullets.
    expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "account.changePassword.errors.minimumLengthMissing",
      "account.changePassword.errors.numberMissing",
      "account.changePassword.errors.specialCharacterMissing",
    ]);
    await userEvent.clear(next);
    await userEvent.type(next, "Old-pass1!");
    // One problem is plain text, not a one-item list.
    expect(screen.getByText("account.changePassword.errors.unchanged")).toBeTruthy();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    await userEvent.clear(next);
    await userEvent.type(next, "New-pass2!");
    await userEvent.type(confirm, "New-pass3!");
    expect(screen.getByText("account.changePassword.errors.mismatch")).toBeTruthy();
    await save();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("lists a weak password that is also the current one as several bullets", async () => {
    const { current, next } = await openPasswordDialog();
    await userEvent.type(current, "abc");
    await userEvent.type(next, "abc");
    await save();
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
    expect(screen.getByText("account.changePassword.errors.unchanged")).toBeTruthy();
  });

  it("saves, then closes and shows the confirmation", async () => {
    const { current, next, confirm } = await openPasswordDialog();
    await userEvent.type(current, "Old-pass1!");
    await userEvent.type(next, "New-pass2!");
    await userEvent.type(confirm, "New-pass2!");
    await save();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/auth/change-password", expect.objectContaining({ body: JSON.stringify({ currentPassword: "Old-pass1!", newPassword: "New-pass2!", revokeOtherSessions: true }) })));
    await waitFor(() => expect(screen.queryByLabelText("account.changePassword.currentPasswordLabel")).toBeNull());
    expect(toast.success).toHaveBeenCalledWith("account.changePassword.saved");
    expect(screen.queryByText("account.changePassword.saved")).toBeNull();
  });

  it("puts a wrong current password under that field, and clears it when it is edited", async () => {
    fetchMock.mockResolvedValue(Response.json({ code: "INVALID_PASSWORD", message: "Invalid password" }, { status: 400 }));
    const { current, next, confirm } = await openPasswordDialog();
    await userEvent.type(current, "Wrong-pass1!");
    await userEvent.type(next, "New-pass2!");
    await userEvent.type(confirm, "New-pass2!");
    await save();
    const message = await screen.findByText("account.changePassword.errors.invalidCurrent");
    expect(current.getAttribute("aria-describedby")).toBe(message.id);
    await userEvent.type(current, "x");
    expect(screen.queryByText("account.changePassword.errors.invalidCurrent")).toBeNull();
  });

  it("clears the fields and errors when cancelled", async () => {
    const { current } = await openPasswordDialog();
    await userEvent.type(current, "x");
    await save();
    await userEvent.click(screen.getByRole("button", { name: "account.actions.cancel" }));
    await waitFor(() => expect(screen.queryByLabelText("account.changePassword.currentPasswordLabel")).toBeNull());
    await userEvent.click(screen.getAllByRole("button", { name: "account.actions.change" })[1]!);
    expect((await screen.findByLabelText("account.changePassword.currentPasswordLabel") as HTMLInputElement).value).toBe("");
    expect(screen.queryByText("account.changePassword.errors.minimumLengthMissing")).toBeNull();
  });
});
