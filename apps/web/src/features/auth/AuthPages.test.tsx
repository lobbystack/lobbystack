import { MemoryRouter } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ForgotPasswordPage } from "./AuthPages";

const signInMock = vi.fn();

vi.mock("@convex-dev/auth/react", () => ({
  useAuthActions: () => ({
    signIn: signInMock,
  }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      typeof options?.email === "string" ? `${key}:${options.email}` : key,
  }),
}));

describe("ForgotPasswordPage", () => {
  beforeEach(() => {
    signInMock.mockReset();
  });

  it("submits a reset request with the expected FormData", async () => {
    signInMock.mockResolvedValue({});

    render(
      <MemoryRouter>
        <ForgotPasswordPage />
      </MemoryRouter>,
    );

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("forgotPassword.email"), "owner@example.com");
    await user.click(screen.getByRole("button", { name: "forgotPassword.submit" }));

    expect(signInMock).toHaveBeenCalledTimes(1);
    const [provider, formData] = signInMock.mock.calls[0] as [string, FormData];

    expect(provider).toBe("password");
    expect(formData.get("flow")).toBe("reset");
    expect(formData.get("email")).toBe("owner@example.com");
    expect(screen.getByText("forgotPassword.verifyTitle")).toBeTruthy();
  });

  it("submits reset verification with email, code, and new password", async () => {
    signInMock
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ signingIn: true });

    render(
      <MemoryRouter>
        <ForgotPasswordPage />
      </MemoryRouter>,
    );

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("forgotPassword.email"), "owner@example.com");
    await user.click(screen.getByRole("button", { name: "forgotPassword.submit" }));
    await user.type(screen.getByLabelText("forgotPassword.code"), "12345678");
    await user.type(screen.getByLabelText("forgotPassword.newPassword"), "a-secure-password");
    await user.click(screen.getByRole("button", { name: "forgotPassword.verifySubmit" }));

    expect(signInMock).toHaveBeenCalledTimes(2);
    const [provider, formData] = signInMock.mock.calls[1] as [string, FormData];

    expect(provider).toBe("password");
    expect(formData.get("flow")).toBe("reset-verification");
    expect(formData.get("email")).toBe("owner@example.com");
    expect(formData.get("code")).toBe("12345678");
    expect(formData.get("newPassword")).toBe("a-secure-password");
    expect(screen.getByText("status.passwordResetFinishing")).toBeTruthy();
  });

  it("renders reset-specific errors from Convex Auth failures", async () => {
    signInMock
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error("Invalid code"));

    render(
      <MemoryRouter>
        <ForgotPasswordPage />
      </MemoryRouter>,
    );

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("forgotPassword.email"), "owner@example.com");
    await user.click(screen.getByRole("button", { name: "forgotPassword.submit" }));
    await user.type(screen.getByLabelText("forgotPassword.code"), "12345678");
    await user.type(screen.getByLabelText("forgotPassword.newPassword"), "a-secure-password");
    await user.click(screen.getByRole("button", { name: "forgotPassword.verifySubmit" }));

    expect(screen.getByText("errors.invalidResetCode")).toBeTruthy();
  });
});
