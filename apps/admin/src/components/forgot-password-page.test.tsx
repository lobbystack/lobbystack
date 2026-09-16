// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import ForgotPasswordPage from "../../app/forgot-password/page";

const router = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@/components/replacement-onboarding-shell", () => ({ ReplacementOnboardingShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

async function requestCode() {
  await userEvent.type(screen.getByLabelText("forgotPassword.email"), "Person@example.test");
  await userEvent.click(screen.getByRole("button", { name: "forgotPassword.submit" }));
  await screen.findByLabelText("forgotPassword.code");
}

describe("password recovery", () => {
  it("clears the code and password when returning to the request form", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ success: true }));
    vi.stubGlobal("fetch", fetcher);
    render(<ForgotPasswordPage />);
    await requestCode();
    expect(JSON.parse(fetcher.mock.calls[0]?.[1].body)).toEqual({ email: "person@example.test" });
    await userEvent.type(screen.getByLabelText("forgotPassword.code"), "123456");
    await userEvent.type(screen.getByLabelText("forgotPassword.newPassword"), "Password-123!");
    await userEvent.click(screen.getByRole("button", { name: "forgotPassword.back" }));
    expect((screen.getByLabelText("forgotPassword.email") as HTMLInputElement).value).toBe("Person@example.test");
    await userEvent.click(screen.getByRole("button", { name: "forgotPassword.submit" }));
    expect((await screen.findByLabelText("forgotPassword.code") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("forgotPassword.newPassword") as HTMLInputElement).value).toBe("");
  });

  it.each(["INVALID_OTP", "USER_NOT_FOUND"])("keeps reset-specific feedback for %s and signs in only after success", async failureCode => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ success: true }))
      .mockResolvedValueOnce(Response.json({ code: failureCode }, { status: 400 }))
      .mockResolvedValueOnce(Response.json({ success: true }))
      .mockResolvedValueOnce(Response.json({ user: { id: "fixture" } }));
    vi.stubGlobal("fetch", fetcher);
    render(<ForgotPasswordPage />);
    await requestCode();
    await userEvent.type(screen.getByLabelText("forgotPassword.code"), "123456");
    await userEvent.type(screen.getByLabelText("forgotPassword.newPassword"), "Password-123!");
    await userEvent.click(screen.getByRole("button", { name: "forgotPassword.verifySubmit" }));
    await screen.findByText("errors.invalidResetCode");
    expect(router.replace).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "forgotPassword.verifySubmit" }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/"));
    expect(fetcher.mock.calls[2]?.[0]).toBe("/api/auth/email-otp/reset-password");
    expect(JSON.parse(fetcher.mock.calls[2]?.[1].body)).toEqual({ email: "person@example.test", otp: "123456", password: "Password-123!" });
    expect(fetcher.mock.calls[3]?.[0]).toBe("/api/auth/sign-in/email");
  });
});
