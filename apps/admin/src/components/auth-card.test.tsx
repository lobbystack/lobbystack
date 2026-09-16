// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthCard } from "./auth-card";
const analytics = vi.hoisted(() => ({ record: vi.fn() }));
vi.mock("@/lib/auth-success-analytics", () => ({ recordAuthSuccess: analytics.record }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en", resolvedLanguage: "en" } }) }));
vi.mock("@/components/turnstile", () => ({ Turnstile: ({ siteKey, onTokenChange }: { siteKey: string; onTokenChange: (token: string) => void }) => <button data-testid="challenge" data-site-key={siteKey} onClick={() => onTokenChange("fixture-challenge-token")}>Solve challenge</button> }));
vi.mock("@/lib/affiliate-referral", () => ({ captureAffiliateReferralFromUrl: () => null, getAffiliateVisitorId: () => "fixture" }));
beforeEach(() => { vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", ""); window.history.replaceState(null, "", "/"); vi.stubGlobal("fetch", vi.fn(async () => Response.json({ code: "INVALID_CREDENTIALS" }, { status: 401 }))); });
afterEach(() => { cleanup(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
describe("original login and signup behavior", () => {
  it("shows verification instructions when signup succeeds without a session", async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ token: null, user: { id: "operator" } }));
    render(<AuthCard mode="signup" />);
    await userEvent.type(screen.getByLabelText("signup.email"), "owner@example.invalid");
    await userEvent.type(screen.getByLabelText("signup.password"), "Valid-Password-123!");
    await userEvent.click(screen.getByRole("button", { name: "signup.submit" }));
    expect((await screen.findByRole("status")).textContent).toBe("signup.checkEmailBody");
    expect(screen.queryByRole("button", { name: "signup.submit" })).toBeNull();
    expect(analytics.record).not.toHaveBeenCalled();
  });
  it("explains when login requires email verification", async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ code: "EMAIL_NOT_VERIFIED" }, { status: 403 }));
    render(<AuthCard mode="login" />);
    await userEvent.type(screen.getByLabelText("login.email"), "owner@example.invalid");
    await userEvent.type(screen.getByLabelText("login.password"), "Valid-Password-123!");
    await userEvent.click(screen.getByRole("button", { name: "login.submit" }));
    expect(await screen.findByText("errors.emailNotVerified")).toBeTruthy();
  });
  it.each(["login", "signup"] as const)("validates %s email on blur and clears it while editing", async mode => {
    render(<AuthCard mode={mode} />);
    const email = screen.getByLabelText(`${mode}.email`);
    await userEvent.type(email, "invalid"); expect(screen.queryByText(`${mode}.emailInvalid`)).toBeNull();
    await userEvent.tab(); expect(screen.getByText(`${mode}.emailInvalid`)).toBeTruthy();
    await userEvent.type(email, "@example.invalid"); expect(screen.queryByText(`${mode}.emailInvalid`)).toBeNull();
  });
  it.each(["login", "signup"] as const)("preserves returnTo in the %s switch link", mode => {
    window.history.replaceState(null, "", "/?returnTo=%2Fclaim-demo%3Ftoken%3Dfixture");
    render(<AuthCard mode={mode} />);
    expect(screen.getByRole("link", { name: mode === "login" ? "login.createOne" : "signup.signIn" }).getAttribute("href")).toBe(`${mode === "login" ? "/signup" : "/login"}?returnTo=%2Fclaim-demo%3Ftoken%3Dfixture`);
  });
  it("mounts the configured signup challenge immediately", () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "fixture-site-key");
    render(<AuthCard mode="signup" />);
    expect(screen.getByTestId("challenge").getAttribute("data-site-key")).toBe("fixture-site-key");
  });
  it("keeps signup usable after a missing challenge token and submits once solved", async () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "fixture-site-key");
    render(<AuthCard mode="signup" />);
    await userEvent.type(screen.getByLabelText("signup.email"), "owner@example.invalid");
    await userEvent.type(screen.getByLabelText("signup.password"), "abcde1!f");
    await userEvent.click(screen.getByRole("button", { name: "signup.submit" }));
    expect(screen.getByText("errors.turnstileRequired")).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
    expect((screen.getByRole("button", { name: "signup.submit" }) as HTMLButtonElement).disabled).toBe(false);
    await userEvent.click(screen.getByRole("button", { name: "Solve challenge" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/auth/sign-up/email", expect.objectContaining({ body: expect.stringContaining('"turnstileToken":"fixture-challenge-token"') })));
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("shows signup criteria only after password focus and requires every criterion", async () => {
    render(<AuthCard mode="signup" />);
    expect(screen.queryByText("signup.passwordCriteria.minimumLength")).toBeNull();
    await userEvent.type(screen.getByLabelText("signup.email"), "owner@example.invalid");
    const password = screen.getByLabelText("signup.password");
    await userEvent.type(password, "abcdefgh");
    expect(screen.getByText("signup.passwordCriteria.minimumLength")).toBeTruthy();
    expect((screen.getByRole("button", { name: "signup.submit" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.submit(password.closest("form")!); expect(fetch).not.toHaveBeenCalled();
    await userEvent.type(password, "1!");
    expect((screen.getByRole("button", { name: "signup.submit" }) as HTMLButtonElement).disabled).toBe(false);
  });
  it("shows specific account-exists guidance from the auth adapter", async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ code: "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL" }, { status: 422 }));
    render(<AuthCard mode="signup" />);
    await userEvent.type(screen.getByLabelText("signup.email"), "Owner@Example.invalid");
    await userEvent.type(screen.getByLabelText("signup.password"), "abcde1!f");
    await userEvent.click(screen.getByRole("button", { name: "signup.submit" }));
    expect(await screen.findByText("errors.accountExists")).toBeTruthy();
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/auth/sign-up/email", expect.objectContaining({ body: expect.stringContaining('"email":"Owner@Example.invalid"') })));
  });
  it("submits the entered login email and renders credential errors", async () => {
    render(<AuthCard mode="login" />);
    await userEvent.type(screen.getByLabelText("login.email"), "Owner@Example.invalid");
    await userEvent.type(screen.getByLabelText("login.password"), "password1!");
    await userEvent.click(screen.getByRole("button", { name: "login.submit" }));
    expect(await screen.findByText("errors.incorrectCredentials")).toBeTruthy();
    expect(fetch).toHaveBeenCalledWith("/api/auth/sign-in/email", expect.objectContaining({ body: JSON.stringify({ email: "Owner@Example.invalid", password: "password1!" }) }));
  });
});

it.each(["login", "signup"] as const)("records %s success only after the authentication API succeeds", async mode => {
  vi.mocked(fetch).mockResolvedValue(Response.json({ user: { id: "operator" } }));
  render(<AuthCard mode={mode} />);
  await userEvent.type(screen.getByLabelText(`${mode}.email`), "owner@example.invalid");
  await userEvent.type(screen.getByLabelText(`${mode}.password`), "Valid-Password-123!");
  await userEvent.click(screen.getByRole("button", { name: `${mode}.submit` }));
  await waitFor(() => expect(analytics.record).toHaveBeenCalledExactlyOnceWith(`web.auth.${mode}_succeeded`));
});
