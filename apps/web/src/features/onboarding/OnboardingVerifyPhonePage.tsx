import { useState } from "react";
import { useAction } from "convex/react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { LoaderCircle, LogOut, ShieldCheck, Smartphone } from "lucide-react";

import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { captureAnalyticsEvent } from "@/lib/analytics";
import { formatPhoneNumberDisplay } from "@/lib/phone";

type OnboardingVerifyPhonePageProps = {
  businessId: Id<"businesses">;
  currentUserEmail?: string;
  currentUserPhone?: string;
  onSignOut: () => void;
};

type StartVerificationResult = {
  status: "pending";
  phoneE164: string;
  countryCode: string;
};

type CheckVerificationResult =
  | {
      status: "approved";
      phoneE164: string;
    }
  | {
      status: "pending";
      message: string;
    };

export function OnboardingVerifyPhonePage({
  businessId,
  currentUserEmail,
  currentUserPhone,
  onSignOut,
}: OnboardingVerifyPhonePageProps) {
  const { i18n, t } = useTranslation("onboarding");
  const navigate = useNavigate();
  const startPhoneVerification = useAction(api.onboarding.phoneVerification.startPhoneVerification);
  const checkPhoneVerification = useAction(api.onboarding.phoneVerification.checkPhoneVerification);
  const [phoneInput, setPhoneInput] = useState<string | undefined>(currentUserPhone ?? undefined);
  const [verificationPhone, setVerificationPhone] = useState<string | null>(null);
  const [codeInput, setCodeInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isCheckingCode, setIsCheckingCode] = useState(false);

  const isVerifyStep = verificationPhone !== null;

  async function handleSendCode(): Promise<void> {
    if (!phoneInput) {
      return;
    }

    setIsSendingCode(true);
    setError(null);
    setStatusMessage(null);

    try {
        const result = (await startPhoneVerification({
        businessId,
        phoneE164: phoneInput,
      })) as StartVerificationResult;

      setPhoneInput(result.phoneE164);
      setVerificationPhone(result.phoneE164);
      captureAnalyticsEvent("web.onboarding.verify_phone_started", {
        businessId: String(businessId),
        countryCode: result.countryCode,
      });
      setStatusMessage(
        t("verifyPhone.codeSent", {
          phone: formatPhoneNumberDisplay(result.phoneE164, i18n.language),
        }),
      );
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : t("verifyPhone.sendFailed"),
      );
    } finally {
      setIsSendingCode(false);
    }
  }

  async function handleVerifyCode(): Promise<void> {
    if (!verificationPhone) {
      return;
    }

    setIsCheckingCode(true);
    setError(null);

    try {
      const result = (await checkPhoneVerification({
        businessId,
        phoneE164: verificationPhone,
        code: codeInput.trim(),
      })) as CheckVerificationResult;

      if (result.status === "approved") {
        captureAnalyticsEvent("web.onboarding.verify_phone_completed", {
          businessId: String(businessId),
        });
        void navigate("/onboarding/number");
        return;
      }

      setError(result.message);
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : t("verifyPhone.verifyFailed"),
      );
    } finally {
      setIsCheckingCode(false);
    }
  }

  return (
    <div className="min-h-svh bg-[radial-gradient(circle_at_top,_rgba(82,43,173,0.16),_transparent_36%),linear-gradient(180deg,_#120f1d_0%,_#09080d_100%)] text-white">
      <div className="mx-auto flex min-h-svh w-full max-w-6xl flex-col px-6 py-6">
        <header className="flex items-center justify-between">
          <div className="text-2xl font-semibold tracking-tight">
            {import.meta.env.VITE_APP_NAME ?? "AI Receptionist"}
          </div>
          <div className="flex items-center gap-3">
            {currentUserEmail ? (
              <span className="hidden text-sm text-zinc-400 sm:inline">
                {t("verifyPhone.signedInAs", { email: currentUserEmail })}
              </span>
            ) : null}
            <Button
              className="border-white/10 bg-white/5 text-white hover:bg-white/10"
              onClick={onSignOut}
              size="sm"
              type="button"
              variant="outline"
            >
              <LogOut className="size-4" />
            </Button>
          </div>
        </header>

        <div className="flex flex-1 items-center justify-center py-12">
          <Card className="w-full max-w-xl border-white/10 bg-white/5 text-white shadow-2xl shadow-black/30 backdrop-blur">
            <CardHeader className="items-center text-center">
              <div className="flex size-20 items-center justify-center rounded-full bg-violet-500/15 text-violet-300 shadow-inner shadow-violet-950/40">
                {isVerifyStep ? (
                  <ShieldCheck className="size-9" />
                ) : (
                  <Smartphone className="size-9" />
                )}
              </div>
              <CardTitle className="text-4xl font-semibold tracking-tight">
                {isVerifyStep ? t("verifyPhone.verifyTitle") : t("verifyPhone.title")}
              </CardTitle>
              <CardDescription className="type-section-description max-w-md text-zinc-300">
                {isVerifyStep
                  ? t("verifyPhone.verifyDescription", {
                      phone: formatPhoneNumberDisplay(
                        verificationPhone ?? phoneInput,
                        i18n.language,
                      ),
                    })
                  : t("verifyPhone.description")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {!isVerifyStep ? (
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="onboarding-phone">
                      {t("verifyPhone.fields.mobileNumber")}
                    </FieldLabel>
                    <PhoneInput
                      id="onboarding-phone"
                      locale={i18n.language}
                      onChange={setPhoneInput}
                      value={phoneInput}
                    />
                    <FieldDescription className="text-zinc-400">
                      {t("verifyPhone.hint")}
                    </FieldDescription>
                  </Field>
                </FieldGroup>
              ) : (
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="onboarding-verification-code">
                      {t("verifyPhone.fields.code")}
                    </FieldLabel>
                    <Input
                      id="onboarding-verification-code"
                      inputMode="numeric"
                      maxLength={10}
                      onChange={(event) =>
                        setCodeInput(event.target.value.replace(/\D/g, ""))
                      }
                      placeholder={t("verifyPhone.placeholders.code")}
                      value={codeInput}
                    />
                  </Field>
                </FieldGroup>
              )}

              {statusMessage ? (
                <FieldDescription className="rounded-md border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-center text-emerald-100">
                  {statusMessage}
                </FieldDescription>
              ) : null}
              {error ? <FieldError>{error}</FieldError> : null}

              <div className="flex flex-col gap-3">
                {!isVerifyStep ? (
                  <Button
                    className="h-12 bg-violet-500 text-base font-medium text-white hover:bg-violet-400"
                    disabled={isSendingCode || !phoneInput}
                    onClick={() => void handleSendCode()}
                    type="button"
                  >
                    {isSendingCode ? (
                      <>
                        <LoaderCircle className="size-4 animate-spin" />
                        {t("verifyPhone.sending")}
                      </>
                    ) : (
                      t("verifyPhone.sendCode")
                    )}
                  </Button>
                ) : (
                  <>
                    <Button
                      className="h-12 bg-violet-500 text-base font-medium text-white hover:bg-violet-400"
                      disabled={isCheckingCode || codeInput.trim().length === 0}
                      onClick={() => void handleVerifyCode()}
                      type="button"
                    >
                      {isCheckingCode ? (
                        <>
                          <LoaderCircle className="size-4 animate-spin" />
                          {t("verifyPhone.verifying")}
                        </>
                      ) : (
                        t("verifyPhone.verifyCode")
                      )}
                    </Button>
                    <Button
                      className="border-white/10 bg-white/5 text-white hover:bg-white/10"
                      onClick={() => {
                        setVerificationPhone(null);
                        setCodeInput("");
                        setError(null);
                        setStatusMessage(null);
                      }}
                      type="button"
                      variant="outline"
                    >
                      {t("verifyPhone.useDifferentNumber")}
                    </Button>
                    <Button
                      className="border-white/10 bg-white/5 text-white hover:bg-white/10"
                      disabled={isSendingCode}
                      onClick={() => void handleSendCode()}
                      type="button"
                      variant="outline"
                    >
                      {isSendingCode ? (
                        <>
                          <LoaderCircle className="size-4 animate-spin" />
                          {t("verifyPhone.resending")}
                        </>
                      ) : (
                        t("verifyPhone.resendCode")
                      )}
                    </Button>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
