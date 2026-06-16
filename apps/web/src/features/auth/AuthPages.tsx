import type { FormEvent } from "react";
import { useCallback, useRef, useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth, useQuery } from "convex/react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { api } from "../../../../../convex/_generated/api";
import { ForgotPasswordForm } from "@/components/forgot-password-form";
import { LoginForm } from "@/components/login-form";
import { SignupForm } from "@/components/signup-form";
import { Button } from "@/components/ui/button";
import { OnboardingShell } from "@/features/onboarding/components/OnboardingShell";
import { captureAnalyticsEvent, resetAnalyticsIdentity } from "@/lib/analytics";
import { isValidEmailAddress, meetsSignupPasswordRequirements } from "@/lib/auth-validation";
import { useObservedAction, useObservedMutation } from "@/lib/observed-convex";

type AuthErrorFlow = "signIn" | "signUp" | "resetRequest" | "resetVerification";

const DEV_TURNSTILE_SITE_KEY = "0x4AAAAAADKUjCqHD6BIFbWo";

function capturePublicAuthEvent(name: "web.auth.login_succeeded" | "web.auth.signup_succeeded") {
  resetAnalyticsIdentity();
  captureAnalyticsEvent(name);
}

function getAuthErrorMessage(
  error: unknown,
  flow: AuthErrorFlow,
  t: TFunction<"auth">,
): string {
  const message = error instanceof Error ? error.message : "";

  if (message.includes("Missing environment variable `SITE_URL`")) {
    return t("errors.passwordResetMissingSiteUrl");
  }

  if (flow === "signIn") {
    if (message.includes("InvalidSecret") || message.includes("Invalid credentials")) {
      return t("errors.incorrectCredentials");
    }
    return t("errors.incorrectCredentials");
  }

  if (flow === "signUp") {
    if (message.includes("already exists")) {
      return t("errors.accountExists");
    }

    if (message.includes("Invalid password")) {
      return t("errors.invalidPassword");
    }

    if (message.includes("Turnstile")) {
      return t("errors.turnstileFailed");
    }

    return t("errors.signupFailed");
  }

  if (flow === "resetVerification") {
    if (
      message.includes("Invalid code") ||
      message.includes("Could not verify code") ||
      message.includes("InvalidAccountId")
    ) {
      return t("errors.invalidResetCode");
    }

    if (message.includes("Invalid password")) {
      return t("errors.invalidPassword");
    }

    return t("errors.passwordResetFailed");
  }

  return t("errors.passwordResetRequestFailed");
}

function isResetRequestLookupError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : "";
  return message.includes("InvalidAccountId");
}

export function LoginPage() {
  const { t } = useTranslation("auth");
  const { signIn } = useAuthActions();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    let keepSubmitting = false;
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const formData = new FormData();
      formData.set("flow", "signIn");
      formData.set("email", email);
      formData.set("password", password);
      const result = await signIn("password", formData);

      if (result.redirect) {
        keepSubmitting = true;
        return;
      }

      if (result.signingIn) {
        keepSubmitting = true;
        capturePublicAuthEvent("web.auth.login_succeeded");
        return;
      }

      keepSubmitting = true;
      capturePublicAuthEvent("web.auth.login_succeeded");
    } catch (error) {
      setErrorMessage(getAuthErrorMessage(error, "signIn", t));
    } finally {
      if (!keepSubmitting) {
        setIsSubmitting(false);
      }
    }
  }

  return (
    <OnboardingShell
      progress={null}
      title={t("login.title")}
      width="sm"
    >
      <LoginForm
        email={email}
        errorMessage={errorMessage}
        isSubmitting={isSubmitting}
        onEmailChange={setEmail}
        onPasswordChange={setPassword}
        onSubmit={handleSubmit}
        password={password}
      />
    </OnboardingShell>
  );
}

export function SignupPage() {
  const { t } = useTranslation("auth");
  const { signIn } = useAuthActions();
  const configuredTurnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY?.trim();
  const turnstileSiteKey =
    configuredTurnstileSiteKey || (import.meta.env.DEV ? DEV_TURNSTILE_SITE_KEY : undefined);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const pendingTurnstileSubmitRef = useRef(false);
  const isSignupReady = isValidEmailAddress(email) && meetsSignupPasswordRequirements(password);

  const handleTurnstileError = useCallback(() => {
    pendingTurnstileSubmitRef.current = false;
    setTurnstileToken(null);
    setIsSubmitting(false);
    setErrorMessage(t("errors.turnstileFailed"));
  }, [t]);

  const submitSignUp = useCallback(async (verifiedTurnstileToken: string | null) => {
    let keepSubmitting = false;
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const formData = new FormData();
      formData.set("flow", "signUp");
      formData.set("email", email);
      formData.set("password", password);
      if (verifiedTurnstileToken) {
        formData.set("cf-turnstile-response", verifiedTurnstileToken);
      }
      const result = await signIn("password", formData);

      if (result.redirect) {
        keepSubmitting = true;
        return;
      }

      if (result.signingIn) {
        keepSubmitting = true;
        capturePublicAuthEvent("web.auth.signup_succeeded");
        return;
      }

      keepSubmitting = true;
      capturePublicAuthEvent("web.auth.signup_succeeded");
    } catch (error) {
      setTurnstileToken(null);
      setTurnstileResetKey((current) => current + 1);
      setErrorMessage(getAuthErrorMessage(error, "signUp", t));
    } finally {
      if (!keepSubmitting) {
        setIsSubmitting(false);
      }
    }
  }, [email, password, signIn, t]);

  const handleTurnstileTokenChange = useCallback(
    (token: string | null) => {
      setTurnstileToken(token);
      if (!token) {
        if (pendingTurnstileSubmitRef.current) {
          pendingTurnstileSubmitRef.current = false;
          setIsSubmitting(false);
          setErrorMessage(t("errors.turnstileRequired"));
        }
      }
      if (!token || !pendingTurnstileSubmitRef.current) {
        return;
      }

      pendingTurnstileSubmitRef.current = false;
      void submitSignUp(token);
    },
    [submitSignUp, t],
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!isValidEmailAddress(email) || !meetsSignupPasswordRequirements(password)) {
      pendingTurnstileSubmitRef.current = false;
      setTurnstileToken(null);
      setErrorMessage(
        isValidEmailAddress(email) ? t("errors.invalidPassword") : t("signup.emailInvalid"),
      );
      return;
    }

    if (turnstileSiteKey && !turnstileToken) {
      setErrorMessage(null);
      pendingTurnstileSubmitRef.current = true;
      setErrorMessage(t("errors.turnstileRequired"));
      return;
    }

    await submitSignUp(turnstileToken);
  }

  return (
    <OnboardingShell
      legalFooter={
        <p className="max-w-full text-center text-xs leading-5 text-muted-foreground sm:whitespace-nowrap">
          {t("signup.legal.prefix")} {" "}
          <a
            className="underline underline-offset-4 hover:text-foreground"
            href="/terms"
            rel="noreferrer"
            target="_blank"
          >
            {t("signup.legal.terms")}
          </a>{" "}
          {t("signup.legal.and")} {" "}
          <a
            className="underline underline-offset-4 hover:text-foreground"
            href="/privacy"
            rel="noreferrer"
            target="_blank"
          >
            {t("signup.legal.privacy")}
          </a>
          {t("signup.legal.suffix")}
        </p>
      }
      progress={{ current: 1, total: 10 }}
      title={t("signup.title")}
      width="sm"
    >
      <SignupForm
        email={email}
        errorMessage={errorMessage}
        isSubmitDisabled={!isSignupReady}
        isSubmitting={isSubmitting}
        onEmailChange={setEmail}
        onPasswordChange={setPassword}
        onSubmit={handleSubmit}
        onTurnstileError={handleTurnstileError}
        onTurnstileTokenChange={handleTurnstileTokenChange}
        password={password}
        turnstileResetKey={turnstileResetKey}
        turnstileSiteKey={turnstileSiteKey || undefined}
      />
    </OnboardingShell>
  );
}

export function ForgotPasswordPage() {
  const { t } = useTranslation("auth");
  const { signIn } = useAuthActions();
  const [step, setStep] = useState<"request" | "verify">("request");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    let keepSubmitting = false;
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const formData = new FormData();
      formData.set("email", email);

      if (step === "request") {
        formData.set("flow", "reset");
        await signIn("password", formData);
        setStep("verify");
        return;
      }

      formData.set("flow", "reset-verification");
      formData.set("code", code);
      formData.set("newPassword", newPassword);
      const result = await signIn("password", formData);

      if (result.redirect) {
        keepSubmitting = true;
        return;
      }

      if (result.signingIn) {
        keepSubmitting = true;
        return;
      }

      keepSubmitting = true;
    } catch (error) {
      if (step === "request" && isResetRequestLookupError(error)) {
        setStep("verify");
        return;
      }

      setErrorMessage(
        getAuthErrorMessage(error, step === "request" ? "resetRequest" : "resetVerification", t),
      );
    } finally {
      if (!keepSubmitting) {
        setIsSubmitting(false);
      }
    }
  }

  function handleBackToRequest() {
    setStep("request");
    setCode("");
    setNewPassword("");
    setErrorMessage(null);
  }

  const isVerifyStep = step === "verify";
  const title = isVerifyStep ? t("forgotPassword.verifyTitle") : t("forgotPassword.title");
  const description = isVerifyStep
    ? t("forgotPassword.verifySubtitle", { email })
    : t("forgotPassword.subtitle");

  return (
    <OnboardingShell description={description} progress={null} title={title} width="sm">
      <ForgotPasswordForm
        code={code}
        email={email}
        errorMessage={errorMessage}
        isSubmitting={isSubmitting}
        newPassword={newPassword}
        onBackToRequest={handleBackToRequest}
        onCodeChange={setCode}
        onEmailChange={setEmail}
        onNewPasswordChange={setNewPassword}
        onSubmit={handleSubmit}
        step={step}
      />
    </OnboardingShell>
  );
}

export function ConfirmEmailChangePage() {
  const { t } = useTranslation("auth");
  const auth = useConvexAuth();
  const confirmEmailChange = useObservedAction(api.businesses.catalog.confirmEmailChange);
  const [searchParams] = useSearchParams();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const token = searchParams.get("token")?.trim() ?? "";
  const email = searchParams.get("email")?.trim().toLowerCase() ?? "";
  const hasConfirmationParams = token.length > 0 && email.length > 0;
  const returnHref = auth.isAuthenticated ? "/settings/usage" : "/login";
  const returnLabel = auth.isAuthenticated
    ? t("confirmEmailChange.backToSettings")
    : t("confirmEmailChange.backToLogin");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatusMessage(null);
    setErrorMessage(null);

    if (!hasConfirmationParams) {
      setErrorMessage(t("confirmEmailChange.invalidLink"));
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await confirmEmailChange({
        code: token,
        email,
      });
      setStatusMessage(t("confirmEmailChange.success", { email: result.email }));
    } catch {
      setErrorMessage(t("confirmEmailChange.invalidLink"));
    } finally {
      setIsSubmitting(false);
    }
  }

  const description = hasConfirmationParams
    ? t("confirmEmailChange.subtitle", { email })
    : t("confirmEmailChange.invalidLink");

  return (
    <OnboardingShell
      description={description}
      progress={null}
      title={t("confirmEmailChange.title")}
      width="sm"
    >
      <div className="flex flex-col gap-6">
        {statusMessage ? (
          <p className="text-center text-sm text-muted-foreground">{statusMessage}</p>
        ) : null}
        {errorMessage ? (
          <p className="text-center text-sm text-destructive">{errorMessage}</p>
        ) : null}

        <form className="flex flex-col" onSubmit={handleSubmit}>
          <Button
            className="h-11 w-full"
            disabled={!hasConfirmationParams || isSubmitting || statusMessage !== null}
            type="submit"
          >
            {isSubmitting
              ? t("confirmEmailChange.submitting")
              : t("confirmEmailChange.submit")}
          </Button>
        </form>

        <p className="text-center text-sm">
          <Link
            className="font-medium text-foreground underline-offset-4 hover:underline"
            to={returnHref}
          >
            {returnLabel}
          </Link>
        </p>
      </div>
    </OnboardingShell>
  );
}

function buildAuthReturnPath(pathname: string, search: string): string {
  return `${pathname}${search}`;
}

export function AcceptInvitePage() {
  const { t } = useTranslation("auth");
  const auth = useConvexAuth();
  const navigate = useNavigate();
  const acceptInvitation = useObservedMutation(api.businesses.members.acceptInvitation);
  const [searchParams] = useSearchParams();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [acceptedPreview, setAcceptedPreview] = useState<{
    businessName: string;
    email: string;
  } | null>(null);

  const token = searchParams.get("token")?.trim() ?? "";
  const hasToken = token.length > 0;
  const returnPath = buildAuthReturnPath(
    "/accept-invite",
    searchParams.toString() ? `?${searchParams.toString()}` : "",
  );
  const preview = useQuery(
    api.businesses.members.previewInvitation,
    hasToken ? { token } : "skip",
  );
  const isPreviewLoading = hasToken && preview === undefined;
  const isInvitationValid =
    preview &&
    preview.status === "pending" &&
    !preview.expired &&
    preview.businessName;
  const loginHref = `/login?returnTo=${encodeURIComponent(returnPath)}`;
  const signupHref = `/signup?returnTo=${encodeURIComponent(returnPath)}`;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatusMessage(null);
    setErrorMessage(null);
    setAcceptedPreview(null);

    if (!hasToken) {
      setErrorMessage(t("acceptInvite.invalidLink"));
      return;
    }

    if (!auth.isAuthenticated) {
      setErrorMessage(t("acceptInvite.signInRequired"));
      return;
    }

    setIsSubmitting(true);

    try {
      await acceptInvitation({ token });
      setAcceptedPreview({
        businessName: preview?.businessName ?? t("acceptInvite.workspaceFallback"),
        email: preview?.email ?? "",
      });
      setStatusMessage(
        t("acceptInvite.success", {
          businessName: preview?.businessName ?? t("acceptInvite.workspaceFallback"),
        }),
      );
      window.setTimeout(() => {
        navigate("/settings/team", { replace: true });
      }, 1200);
    } catch {
      setErrorMessage(t("acceptInvite.failed"));
    } finally {
      setIsSubmitting(false);
    }
  }

  let description = t("acceptInvite.invalidLink");
  if (acceptedPreview) {
    description = t("acceptInvite.subtitle", acceptedPreview);
  } else if (isPreviewLoading) {
    description = t("acceptInvite.loading");
  } else if (preview && preview.expired) {
    description = t("acceptInvite.expired");
  } else if (preview && preview.status !== "pending") {
    description = t("acceptInvite.invalidLink");
  } else if (isInvitationValid) {
    description = t("acceptInvite.subtitle", {
      businessName: preview.businessName,
      email: preview.email,
    });
  }

  return (
    <OnboardingShell
      description={description}
      progress={null}
      title={t("acceptInvite.title")}
      width="sm"
    >
      <div className="flex flex-col gap-6">
        {statusMessage ? (
          <p className="text-center text-sm text-muted-foreground">{statusMessage}</p>
        ) : null}
        {errorMessage ? (
          <p className="text-center text-sm text-destructive">{errorMessage}</p>
        ) : null}

        {auth.isAuthenticated ? (
          <form className="flex flex-col" onSubmit={handleSubmit}>
            <Button
              className="h-11 w-full"
              disabled={
                !isInvitationValid ||
                isSubmitting ||
                isPreviewLoading ||
                statusMessage !== null
              }
              type="submit"
            >
              {isSubmitting ? t("acceptInvite.submitting") : t("acceptInvite.submit")}
            </Button>
          </form>
        ) : (
          <div className="flex flex-col gap-3">
            <Button
              className="h-11 w-full"
              disabled={!isInvitationValid || isPreviewLoading}
              render={<Link to={loginHref} />}
              type="button"
            >
              {t("acceptInvite.signIn")}
            </Button>
            <Button
              className="h-11 w-full"
              disabled={!isInvitationValid || isPreviewLoading}
              render={<Link to={signupHref} />}
              type="button"
              variant="outline"
            >
              {t("acceptInvite.createAccount")}
            </Button>
          </div>
        )}

        <p className="text-center text-sm">
          <Link
            className="font-medium text-foreground underline-offset-4 hover:underline"
            to={auth.isAuthenticated ? "/settings/team" : "/login"}
          >
            {auth.isAuthenticated
              ? t("acceptInvite.backToSettings")
              : t("acceptInvite.backToLogin")}
          </Link>
        </p>
      </div>
    </OnboardingShell>
  );
}
