import { useEffect, useState } from "react";

import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { ChevronLeft, LoaderCircle } from "lucide-react";

import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { FieldError } from "@/components/ui/field";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { OnboardingShell } from "@/features/onboarding/components/OnboardingShell";
import { getSafeOnboardingErrorMessage } from "@/features/onboarding/onboardingErrors";
import { captureAnalyticsEvent } from "@/lib/analytics";
import { useObservedAction } from "@/lib/observed-convex";

type OnboardingVerifyPhoneCodePageProps = {
  businessId: Id<"businesses">;
  phoneE164: string;
  onSignOut: () => void;
  progressNavigableUntil?: number;
};

function maskPhone(phone: string): string {
  if (!phone || phone.length < 4) {
    return phone;
  }

  const last = phone.slice(-4);
  return `${phone.slice(0, Math.max(2, phone.length - 8))}${"•".repeat(Math.max(2, phone.length - 6))}${last}`;
}

export function OnboardingVerifyPhoneCodePage({
  businessId,
  phoneE164,
  onSignOut,
  progressNavigableUntil,
}: OnboardingVerifyPhoneCodePageProps) {
  const { t } = useTranslation("onboarding");
  const navigate = useNavigate();
  const checkPhoneVerification = useObservedAction(
    api.onboarding.phoneVerification.checkPhoneVerification,
  );
  const resendPhoneVerification = useObservedAction(
    api.onboarding.phoneVerification.resendPhoneVerification,
  );
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);

  // Auto-verify the moment the user has entered six digits.
  useEffect(() => {
    if (code.length === 6 && !isVerifying) {
      void verify(code);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  async function verify(value: string): Promise<void> {
    setIsVerifying(true);
    setError(null);
    try {
      const result = await checkPhoneVerification({
        businessId,
        phoneE164,
        code: value,
      });
      if (result.status === "approved") {
        captureAnalyticsEvent("web.onboarding.verify_phone_completed", {
          businessId: String(businessId),
        });
        navigate("/onboarding/plan", { replace: true });
      } else {
        setError(getSafeOnboardingErrorMessage(result.message, t, "verifyPhoneCode.failed"));
      }
    } catch (verifyError) {
      setError(
        getSafeOnboardingErrorMessage(verifyError, t, "verifyPhoneCode.failed"),
      );
    } finally {
      setIsVerifying(false);
    }
  }

  async function handleResend(): Promise<void> {
    if (isResending || isVerifying) {
      return;
    }

    setIsResending(true);
    setError(null);
    try {
      await resendPhoneVerification({ businessId });
      captureAnalyticsEvent("web.onboarding.verify_phone_code_resent", {
        businessId: String(businessId),
      });
    } catch (resendError) {
      setError(
        getSafeOnboardingErrorMessage(
          resendError,
          t,
          "verifyPhoneCode.resendFailed",
        ),
      );
    } finally {
      setIsResending(false);
    }
  }

  return (
    <OnboardingShell
      description={t("verifyPhoneCode.description", { phone: maskPhone(phoneE164) })}
      onSignOut={onSignOut}
      progress={{ current: 7, navigableUntil: progressNavigableUntil, total: 10 }}
      title={t("verifyPhoneCode.title")}
      footer={
        <div className="flex flex-col items-center gap-4">
          <p className="text-sm text-muted-foreground">
            {t("verifyPhoneCode.didntGet")}{" "}
            <button
              className="font-medium text-foreground underline-offset-4 hover:underline disabled:opacity-50"
              disabled={isResending || isVerifying}
              onClick={() => void handleResend()}
              type="button"
            >
              {isResending ? t("verifyPhoneCode.resending") : t("verifyPhoneCode.resend")}
            </button>
          </p>
          <Link
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            to="/onboarding/verify-phone"
          >
            <ChevronLeft className="size-4" />
            {t("verifyPhoneCode.changeNumber")}
          </Link>
        </div>
      }
    >
      <div className="flex flex-col items-center gap-4">
        <InputOTP
          autoFocus
          maxLength={6}
          onChange={(value) => setCode(value)}
          value={code}
        >
          <InputOTPGroup>
            <InputOTPSlot className="size-12 text-lg" index={0} />
            <InputOTPSlot className="size-12 text-lg" index={1} />
            <InputOTPSlot className="size-12 text-lg" index={2} />
            <InputOTPSlot className="size-12 text-lg" index={3} />
            <InputOTPSlot className="size-12 text-lg" index={4} />
            <InputOTPSlot className="size-12 text-lg" index={5} />
          </InputOTPGroup>
        </InputOTP>

        {isVerifying ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" />
            {t("verifyPhoneCode.verifying")}
          </div>
        ) : null}

        {error ? <FieldError>{error}</FieldError> : null}
      </div>
    </OnboardingShell>
  );
}
