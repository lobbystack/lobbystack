import { MemoryRouter } from "react-router-dom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AcceptInvitePage, ForgotPasswordPage, LoginPage, SignupPage } from "./AuthPages";

const {
  acceptInvitationMock,
  signInMock,
  turnstileExecuteMock,
  turnstileTokenMock,
  useConvexAuthMock,
  useQueryMock,
} = vi.hoisted(() => ({
  acceptInvitationMock: vi.fn(),
  signInMock: vi.fn(),
  turnstileExecuteMock: vi.fn(),
  turnstileTokenMock: vi.fn(() => "turnstile-token" as string | null),
  useConvexAuthMock: vi.fn(),
  useQueryMock: vi.fn(),
}));

vi.mock("@convex-dev/auth/react", () => ({
  useAuthActions: () => ({
    signIn: signInMock,
  }),
}));

vi.mock("convex/react", () => ({
  useConvexAuth: () => useConvexAuthMock(),
  useQuery: (...args: Array<unknown>) => useQueryMock(...args),
}));

vi.mock("@/lib/observed-convex", () => ({
  useObservedAction: () => vi.fn(),
  useObservedMutation: () => acceptInvitationMock,
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
      React.useEffect(() => {
        props.onTokenChange(turnstileTokenMock());
      }, [props.onTokenChange]);

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

describe("AcceptInvitePage", () => {
  beforeEach(() => {
    acceptInvitationMock.mockReset();
    useConvexAuthMock.mockReset();
    useQueryMock.mockReset();
  });

  it("does not flash invalid link copy after a successful acceptance", async () => {
    let previewState: {
      businessName: string | null;
      email: string;
      expired: boolean;
      role: string;
      status: string;
    } = {
      businessName: "Acme Clinic",
      email: "invitee@example.com",
      expired: false,
      role: "viewer",
      status: "pending",
    };
    useConvexAuthMock.mockReturnValue({ isAuthenticated: true, isLoading: false });
    useQueryMock.mockImplementation(() => previewState);
    acceptInvitationMock.mockImplementation(async () => {
      previewState = {
        ...previewState,
        businessName: null,
        status: "accepted",
      };
      return { alreadyMember: false, businessId: "business_123" };
    });

    render(
      <MemoryRouter initialEntries={["/accept-invite?token=invite-token"]}>
        <AcceptInvitePage />
      </MemoryRouter>,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "acceptInvite.submit" }));

    expect(await screen.findByText("acceptInvite.success")).toBeTruthy();
    await waitFor(() => {
      expect(screen.queryByText("acceptInvite.invalidLink")).toBeNull();
    });
  });
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
    await user.type(emailInput, "o");

    expect(screen.queryByText("login.emailInvalid")).toBeNull();

    await user.tab();

    expect(screen.getByText("login.emailInvalid")).toBeTruthy();

    await user.clear(emailInput);
    await user.type(emailInput, "owner@example.com");

    expect(screen.queryByText("login.emailInvalid")).toBeNull();
  });

  it("keeps the default legal footer on login", () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );

    expect(screen.getByText("shell.terms")).toBeTruthy();
    expect(screen.getByText("shell.privacy")).toBeTruthy();
  });

  it("submits the raw email for login", async () => {
    signInMock.mockResolvedValue({});

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("login.email"), " OWNER@Example.COM ");
    await user.type(screen.getByLabelText("login.password"), "CurrentPass123!");
    await user.click(screen.getByRole("button", { name: "login.submit" }));

    expect(signInMock).toHaveBeenCalledTimes(1);
    const [, formData] = signInMock.mock.calls[0] as [string, FormData];

    expect(formData.get("email")).toBe("OWNER@Example.COM");
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
    await user.type(screen.getByLabelText("forgotPassword.email"), " OWNER@Example.COM ");
    await user.click(screen.getByRole("button", { name: "forgotPassword.submit" }));

    expect(signInMock).toHaveBeenCalledTimes(1);
    const [provider, formData] = signInMock.mock.calls[0] as [string, FormData];

    expect(provider).toBe("password");
    expect(formData.get("flow")).toBe("reset");
    expect(formData.get("email")).toBe("OWNER@Example.COM");
    expect(screen.getByText("forgotPassword.verifyTitle")).toBeTruthy();
    expect(screen.queryByText("forgotPassword.submitting")).toBeNull();
  });

  it("renders a specific error when SITE_URL is missing on the Convex deployment", async () => {
    signInMock.mockRejectedValueOnce(new Error("Missing environment variable `SITE_URL`"));

    render(
      <MemoryRouter>
        <ForgotPasswordPage />
      </MemoryRouter>,
    );

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("forgotPassword.email"), " OWNER@Example.COM ");
    await user.click(screen.getByRole("button", { name: "forgotPassword.submit" }));

    expect(screen.getByText("errors.passwordResetMissingSiteUrl")).toBeTruthy();
  });

  it("submits reset verification with raw email, code, and new password", async () => {
    signInMock
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ signingIn: true });

    render(
      <MemoryRouter>
        <ForgotPasswordPage />
      </MemoryRouter>,
    );

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("forgotPassword.email"), " OWNER@Example.COM ");
    await user.click(screen.getByRole("button", { name: "forgotPassword.submit" }));
    await user.type(screen.getByLabelText("forgotPassword.code"), "12345678");
    await user.type(screen.getByLabelText("forgotPassword.newPassword"), "a-secure-password");
    await user.click(screen.getByRole("button", { name: "forgotPassword.verifySubmit" }));

    expect(signInMock).toHaveBeenCalledTimes(2);
    const [provider, formData] = signInMock.mock.calls[1] as [string, FormData];

    expect(provider).toBe("password");
    expect(formData.get("flow")).toBe("reset-verification");
    expect(formData.get("email")).toBe("OWNER@Example.COM");
    expect(formData.get("code")).toBe("12345678");
    expect(formData.get("newPassword")).toBe("a-secure-password");
    expect(screen.queryByText("status.passwordResetFinishing")).toBeNull();
    expect(
      screen.getByRole("button", { name: "forgotPassword.verifySubmitting" }),
    ).toBeTruthy();
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
    await user.type(emailInput, "o");

    expect(screen.queryByText("signup.emailInvalid")).toBeNull();

    await user.tab();

    expect(screen.getByText("signup.emailInvalid")).toBeTruthy();

    await user.clear(emailInput);
    await user.type(emailInput, "owner@example.com");

    expect(screen.queryByText("signup.emailInvalid")).toBeNull();
  });

  it("uses the signup-specific legal footer", () => {
    render(
      <MemoryRouter>
        <SignupPage />
      </MemoryRouter>,
    );

    expect(screen.getByText(/signup\.legal\.prefix/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "signup.legal.terms" }).getAttribute("href")).toBe(
      "/terms",
    );
    expect(screen.getByRole("link", { name: "signup.legal.privacy" }).getAttribute("href")).toBe(
      "/privacy",
    );
    expect(screen.queryByText("shell.terms")).toBeNull();
    expect(screen.queryByText("shell.privacy")).toBeNull();
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

  it("submits the raw email for signup", async () => {
    vi.stubEnv("VITE_TURNSTILE_SITE_KEY", "site-key");
    signInMock.mockResolvedValueOnce({});

    render(
      <MemoryRouter>
        <SignupPage />
      </MemoryRouter>,
    );

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("signup.email"), " OWNER@Example.COM ");
    await user.type(screen.getByLabelText("signup.password"), "abcde1!f");
    await user.click(screen.getByRole("button", { name: "signup.submit" }));

    expect(signInMock).toHaveBeenCalledTimes(1);
    const [, formData] = signInMock.mock.calls[0] as [string, FormData];

    expect(formData.get("email")).toBe("OWNER@Example.COM");
  });

  it("renders Turnstile as soon as the signup page loads", async () => {
    render(
      <MemoryRouter>
        <SignupPage />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("turnstile")).toBeTruthy();
    expect(turnstileExecuteMock).not.toHaveBeenCalled();
  });

  it("uses an explicit Turnstile site key when one is configured", async () => {
    vi.stubEnv("VITE_TURNSTILE_SITE_KEY", "site-key");

    render(
      <MemoryRouter>
        <SignupPage />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("turnstile")).toBeTruthy();
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
