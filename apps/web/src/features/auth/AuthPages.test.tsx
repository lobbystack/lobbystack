import { MemoryRouter } from "react-router-dom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ForgotPasswordPage, LoginPage, SignupPage } from "./AuthPages";

const { signInMock, turnstileExecuteMock, turnstileTokenMock } = vi.hoisted(() => ({
  signInMock: vi.fn(),
  turnstileExecuteMock: vi.fn(),
  turnstileTokenMock: vi.fn(() => "turnstile-token" as string | null),
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
            props.onTokenChange(turnstileTokenMock());
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

describe("LoginPage", () => {
  beforeEach(() => {
    signInMock.mockReset();
    turnstileExecuteMock.mockReset();
    turnstileTokenMock.mockReset();
  });

  it("shows an invalid email error after a typed email field is blurred", async () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );

    expect(screen.queryByText("login.emailInvalid")).toBeNull();

    const user = userEvent.setup();
    const emailInput = screen.getByLabelText("login.email");
    await user.type(emailInput, "rewfwe");
    await user.tab();

    expect(screen.getByText("login.emailInvalid")).toBeTruthy();
    expect(emailInput.getAttribute("aria-invalid")).toBe("true");

    await user.clear(emailInput);
    await user.type(emailInput, "owner@example.com");

    expect(screen.queryByText("login.emailInvalid")).toBeNull();
  });
});

describe("ForgotPasswordPage", () => {
  beforeEach(() => {
    signInMock.mockReset();
    turnstileExecuteMock.mockReset();
    turnstileTokenMock.mockReset();
    turnstileTokenMock.mockReturnValue("turnstile-token");
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
    turnstileTokenMock.mockReset();
    turnstileTokenMock.mockReturnValue("turnstile-token");
  });

  it("shows an invalid email error after a typed email field is blurred", async () => {
    render(
      <MemoryRouter>
        <SignupPage />
      </MemoryRouter>,
    );

    expect(screen.queryByText("signup.emailInvalid")).toBeNull();

    const user = userEvent.setup();
    const emailInput = screen.getByLabelText("signup.email");
    await user.type(emailInput, "rewfwe");
    await user.tab();

    expect(screen.getByText("signup.emailInvalid")).toBeTruthy();
    expect(emailInput.getAttribute("aria-invalid")).toBe("true");

    await user.clear(emailInput);
    await user.type(emailInput, "owner@example.com");

    expect(screen.queryByText("signup.emailInvalid")).toBeNull();
  });

  it("shows password criteria only after the password field is focused", async () => {
    render(
      <MemoryRouter>
        <SignupPage />
      </MemoryRouter>,
    );

    expect(screen.queryByText("signup.passwordCriteria.minimumLength")).toBeNull();
    expect(screen.queryByText("signup.passwordCriteria.number")).toBeNull();
    expect(screen.queryByText("signup.passwordCriteria.specialCharacter")).toBeNull();

    const user = userEvent.setup();
    const passwordInput = screen.getByLabelText("signup.password");
    await user.click(passwordInput);

    expect(screen.getByText("signup.passwordCriteria.minimumLength")).toBeTruthy();
    expect(screen.getByText("signup.passwordCriteria.number")).toBeTruthy();
    expect(screen.getByText("signup.passwordCriteria.specialCharacter")).toBeTruthy();

    await user.type(passwordInput, "abcde1!f");

    expect(screen.getByText("signup.passwordCriteria.minimumLength").closest("li")?.className).toContain(
      "text-emerald-700",
    );
    expect(screen.getByText("signup.passwordCriteria.number").closest("li")?.className).toContain(
      "text-emerald-700",
    );
    expect(screen.getByText("signup.passwordCriteria.specialCharacter").closest("li")?.className).toContain(
      "text-emerald-700",
    );
  });

  it("keeps create account disabled until signup criteria are met", async () => {
    render(
      <MemoryRouter>
        <SignupPage />
      </MemoryRouter>,
    );

    const user = userEvent.setup();
    const submitButton = screen.getByRole("button", {
      name: "signup.submit",
    }) as HTMLButtonElement;
    expect(submitButton.disabled).toBe(true);

    await user.type(screen.getByLabelText("signup.email"), "owner@example.com");
    expect(submitButton.disabled).toBe(true);

    await user.type(screen.getByLabelText("signup.password"), "abcde1!");
    expect(submitButton.disabled).toBe(true);

    await user.type(screen.getByLabelText("signup.password"), "f");
    expect(submitButton.disabled).toBe(false);
  });

  it("does not submit invalid signup passwords", async () => {
    vi.stubEnv("VITE_TURNSTILE_SITE_KEY", "site-key");

    render(
      <MemoryRouter>
        <SignupPage />
      </MemoryRouter>,
    );

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("signup.email"), "owner@example.com");
    await user.type(screen.getByLabelText("signup.password"), "12345678");

    expect(
      (screen.getByRole("button", { name: "signup.submit" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    await user.click(screen.getByRole("button", { name: "signup.submit" }));

    expect(screen.queryByText("errors.invalidPassword")).toBeNull();
    expect(screen.queryByText("errors.turnstileFailed")).toBeNull();
    expect(turnstileExecuteMock).not.toHaveBeenCalled();
    expect(signInMock).not.toHaveBeenCalled();
  });

  it("shows account-exists guidance when signup uses an existing email", async () => {
    vi.stubEnv("VITE_TURNSTILE_SITE_KEY", "site-key");
    signInMock.mockRejectedValueOnce(
      new Error("Uncaught Error: Account owner@example.com already exists"),
    );

    render(
      <MemoryRouter>
        <SignupPage />
      </MemoryRouter>,
    );

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("signup.email"), "owner@example.com");
    await user.type(screen.getByLabelText("signup.password"), "abcde1!f");
    await user.click(screen.getByRole("button", { name: "signup.submit" }));

    expect(await screen.findByText("errors.accountExists")).toBeTruthy();
    expect(screen.queryByText("errors.signupFailed")).toBeNull();
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
    await user.type(screen.getByLabelText("signup.password"), "abcde1!");

    await new Promise((resolve) => window.setTimeout(resolve, 800));

    expect(screen.queryByTestId("turnstile")).toBeNull();
    expect(turnstileExecuteMock).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText("signup.password"), "f");

    await waitFor(() => expect(screen.getByTestId("turnstile")).toBeTruthy());
    await waitFor(() => expect(turnstileExecuteMock).toHaveBeenCalledOnce(), {
      timeout: 1000,
    });
  });

  it("unblocks signup when Turnstile returns without a token during submit", async () => {
    vi.stubEnv("VITE_TURNSTILE_SITE_KEY", "site-key");
    turnstileExecuteMock.mockReturnValue(true);
    turnstileTokenMock.mockReturnValue(null);

    render(
      <MemoryRouter>
        <SignupPage />
      </MemoryRouter>,
    );

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("signup.email"), "owner@example.com");
    await user.type(screen.getByLabelText("signup.password"), "abcde1!f");
    await user.click(screen.getByRole("button", { name: "signup.submit" }));

    expect(await screen.findByText("errors.turnstileRequired")).toBeTruthy();
    expect(signInMock).not.toHaveBeenCalled();
    const submitButton = screen.getByRole("button", {
      name: "signup.submit",
    }) as HTMLButtonElement;
    expect(submitButton.disabled).toBe(false);
  });
});
