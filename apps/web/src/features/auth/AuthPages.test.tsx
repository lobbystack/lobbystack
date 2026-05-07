import { MemoryRouter } from "react-router-dom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ForgotPasswordPage, SignupPage } from "./AuthPages";

const { signInMock, turnstileExecuteMock } = vi.hoisted(() => ({
  signInMock: vi.fn(),
  turnstileExecuteMock: vi.fn(),
}));

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

vi.mock("@/components/turnstile", async () => {
  const React = await vi.importActual<typeof import("react")>("react");
  type TurnstileMockProps = {
    onTokenChange: (token: string | null) => void;
  };

  return {
    Turnstile: React.forwardRef(function TurnstileMock(
      props: TurnstileMockProps,
      ref,
    ) {
      React.useImperativeHandle(ref, () => ({
        execute: () => {
          const result = turnstileExecuteMock();
          if (result !== false) {
            props.onTokenChange("turnstile-token");
          }
          return result ?? true;
        },
      }));
      return <div data-testid="turnstile" />;
    }),
  };
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("ForgotPasswordPage", () => {
  beforeEach(() => {
    signInMock.mockReset();
    turnstileExecuteMock.mockReset();
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

  it("renders a specific error when SITE_URL is missing on the Convex deployment", async () => {
    signInMock.mockRejectedValueOnce(new Error("Missing environment variable `SITE_URL`"));

    render(
      <MemoryRouter>
        <ForgotPasswordPage />
      </MemoryRouter>,
    );

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("forgotPassword.email"), "owner@example.com");
    await user.click(screen.getByRole("button", { name: "forgotPassword.submit" }));

    expect(screen.getByText("errors.passwordResetMissingSiteUrl")).toBeTruthy();
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

  it("masks missing accounts as invalid reset codes during verification", async () => {
    signInMock
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error("InvalidAccountId"));

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

describe("SignupPage", () => {
  beforeEach(() => {
    signInMock.mockReset();
    turnstileExecuteMock.mockReset();
  });

  it("shows password guidance when signup fails through the Turnstile provider password policy", async () => {
    vi.stubEnv("VITE_TURNSTILE_SITE_KEY", "site-key");
    signInMock.mockRejectedValueOnce(
      new Error("PasswordWithTurnstile authorize failed: Invalid password"),
    );

    render(
      <MemoryRouter>
        <SignupPage />
      </MemoryRouter>,
    );

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("signup.email"), "owner@example.com");
    await user.type(screen.getByLabelText("signup.password"), "123456789012");
    await user.click(screen.getByRole("button", { name: "signup.submit" }));

    expect(await screen.findByText("errors.invalidPassword")).toBeTruthy();
    expect(screen.queryByText("errors.turnstileFailed")).toBeNull();
  });

  it("preflights Turnstile after the user fills plausible credentials", async () => {
    vi.stubEnv("VITE_TURNSTILE_SITE_KEY", "site-key");
    turnstileExecuteMock.mockReturnValue(true);

    render(
      <MemoryRouter>
        <SignupPage />
      </MemoryRouter>,
    );

    expect(screen.queryByTestId("turnstile")).toBeNull();

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("signup.email"), "owner@example.com");
    await user.type(screen.getByLabelText("signup.password"), "12345678901");

    await new Promise((resolve) => window.setTimeout(resolve, 800));

    expect(screen.queryByTestId("turnstile")).toBeNull();
    expect(turnstileExecuteMock).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText("signup.password"), "2");

    await waitFor(() => expect(screen.getByTestId("turnstile")).toBeTruthy());
    await waitFor(() => expect(turnstileExecuteMock).toHaveBeenCalledOnce(), {
      timeout: 1000,
    });
  });
});
