import { useEffect, useState } from "react";

import { useQuery } from "convex/react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { LoaderCircle } from "lucide-react";

import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";
import { OnboardingShell } from "@/features/onboarding/components/OnboardingShell";
import {
  PhoneNumberChooser,
  type AvailableNumberSummary,
  type ClaimResult,
  type InitialSuggestionResult,
  type SearchResult,
} from "@/features/onboarding/components/PhoneNumberChooser";
import { getSafeOnboardingErrorMessage } from "@/features/onboarding/onboardingErrors";
import { captureAnalyticsEvent } from "@/lib/analytics";
import { useObservedAction, useObservedMutation } from "@/lib/observed-convex";

type OnboardingNumberPageProps = {
  businessId: Id<"businesses">;
  onSignOut: () => void;
  isComplete?: boolean;
  progressNavigableUntil?: number;
};

type PrimaryPhoneNumber = {
  _id: Id<"phone_numbers">;
  e164: string;
  voiceEnabled: boolean;
  smsEnabled: boolean;
  status: string;
};

function formatPhoneNumber(e164: string): string {
  const digits = e164.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    const nationalNumber = digits.slice(1);
    return `(${nationalNumber.slice(0, 3)}) ${nationalNumber.slice(3, 6)}-${nationalNumber.slice(6)}`;
  }

  return e164;
}

export function OnboardingNumberPage({
  businessId,
  onSignOut,
  isComplete = false,
  progressNavigableUntil,
}: OnboardingNumberPageProps) {
  const { t } = useTranslation("onboarding");
  const navigate = useNavigate();
  const getInitialNumberSuggestion = useObservedAction(
    api.onboarding.phoneNumbers.getInitialNumberSuggestion,
  );
  const searchAvailableNumbers = useObservedAction(
    api.onboarding.phoneNumbers.searchAvailableNumbers,
  );
  const claimOnboardingNumber = useObservedAction(
    api.onboarding.phoneNumbers.claimOnboardingNumber,
  );
  const skipOnboardingNumber = useObservedMutation(
    api.onboarding.phoneNumbersSkip.skipOnboardingNumber,
  );
  const primaryPhoneNumber = useQuery(api.businesses.catalog.getPrimaryPhoneNumber, {
    businessId,
  }) as PrimaryPhoneNumber | null | undefined;
  const [hasCompletedClaim, setHasCompletedClaim] = useState(false);
  const [isSkipping, setIsSkipping] = useState(false);
  const [skipError, setSkipError] = useState<string | null>(null);
  const shouldLoadInventory = primaryPhoneNumber === null && !isComplete;

  useEffect(() => {
    if (!isComplete && primaryPhoneNumber) {
      navigate("/onboarding/plan", {
        replace: true,
        state: { justClaimedPhoneNumber: true },
      });
    }
  }, [isComplete, navigate, primaryPhoneNumber]);

  async function handleSkip(): Promise<void> {
    if (isSkipping) return;
    setIsSkipping(true);
    setSkipError(null);
    try {
      await skipOnboardingNumber({ businessId });
    } catch (skipError) {
      setSkipError(getSafeOnboardingErrorMessage(skipError, t, "number.skipFailed"));
    } finally {
      setIsSkipping(false);
    }
  }

  function handleClaimStarted(number: AvailableNumberSummary): void {
    captureAnalyticsEvent("web.onboarding.number_claim_started", {
      businessId: String(businessId),
      countryCode: number.countryCode,
      selectionMode: number.selectionContext.mode,
      numberKind: number.kind,
    });
  }

  function handleClaimCompleted(number: AvailableNumberSummary): void {
    captureAnalyticsEvent("web.onboarding.number_claim_completed", {
      businessId: String(businessId),
      countryCode: number.countryCode,
      selectionMode: number.selectionContext.mode,
      numberKind: number.kind,
    });
  }

  function handleClaimed(): void {
    setHasCompletedClaim(true);
    navigate("/onboarding/plan", {
      state: { justClaimedPhoneNumber: true },
    });
  }

  if (hasCompletedClaim || (primaryPhoneNumber && !isComplete)) {
    return (
      <OnboardingShell
        onSignOut={onSignOut}
        progress={{ current: 8, navigableUntil: progressNavigableUntil, total: 10 }}
        title={t("number.title")}
        width="md"
      >
        <Surface className="flex justify-center p-6">
          <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
        </Surface>
      </OnboardingShell>
    );
  }

  if (isComplete) {
    if (primaryPhoneNumber === undefined) {
      return (
        <OnboardingShell
          onSignOut={onSignOut}
          progress={{ current: 8, navigableUntil: progressNavigableUntil, total: 10 }}
          title={t("number.title")}
          width="md"
        >
          <Surface className="flex justify-center p-6">
            <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
          </Surface>
        </OnboardingShell>
      );
    }

    const selectedNumber = primaryPhoneNumber ? formatPhoneNumber(primaryPhoneNumber.e164) : null;

    return (
      <OnboardingShell
        onSignOut={onSignOut}
        progress={{ current: 8, navigableUntil: progressNavigableUntil, total: 10 }}
        title={selectedNumber ? t("number.selectedTitle") : t("number.title")}
        width="md"
      >
        <Surface className="flex flex-col gap-5 p-6 text-center">
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-muted-foreground">
              {selectedNumber ? t("number.selectedNumberLabel") : t("number.skippedTitle")}
            </p>
            <p className="text-2xl font-semibold text-foreground">
              {selectedNumber ?? t("number.skippedDescription")}
            </p>
          </div>
          <Button onClick={() => navigate("/onboarding/plan")} type="button">
            {t("number.continue")}
          </Button>
        </Surface>
      </OnboardingShell>
    );
  }

  return (
    <OnboardingShell
      onSignOut={onSignOut}
      progress={{ current: 8, navigableUntil: progressNavigableUntil, total: 10 }}
      title={t("number.title")}
      width="lg"
      footer={
        <div className="flex flex-col items-center gap-3">
          <button
            className="text-sm font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground disabled:opacity-50"
            disabled={isSkipping}
            onClick={() => void handleSkip()}
            type="button"
          >
            {isSkipping ? t("number.skipping") : t("number.skipLater")}
          </button>
          {skipError ? <p className="text-sm text-destructive">{skipError}</p> : null}
        </div>
      }
    >
      {primaryPhoneNumber === undefined || !shouldLoadInventory ? (
        <Surface className="flex justify-center p-6">
          <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
        </Surface>
      ) : (
        <PhoneNumberChooser
          businessId={businessId}
          claimNumber={claimOnboardingNumber as (args: {
            businessId: Id<"businesses">;
            e164: string;
            selectionContext: AvailableNumberSummary["selectionContext"];
            claimToken: string;
          }) => Promise<ClaimResult>}
          getErrorMessage={(error, fallback) =>
            getSafeOnboardingErrorMessage(error, t, fallback)
          }
          getInitialNumberSuggestion={
            getInitialNumberSuggestion as (args: {
              businessId: Id<"businesses">;
            }) => Promise<InitialSuggestionResult>
          }
          labels={{
            countryLabel: t("number.countryLabel"),
            areaCodeLabel: t("number.areaCodeLabel"),
            areaCodePlaceholder: t("number.areaCodePlaceholder"),
            search: t("number.search"),
            phoneNumberHeader: t("number.tableHeaders.phoneNumber"),
            select: t("number.select"),
            loadMore: t("number.loadMore"),
            empty: t("number.empty"),
            loadFailed: "number.loadFailed",
            searchFailed: "number.searchFailed",
            claimFailed: "number.claimFailed",
            unavailable: t("number.unavailable"),
          }}
          onClaimCompleted={handleClaimCompleted}
          onClaimed={handleClaimed}
          onClaimStarted={handleClaimStarted}
          onVerifyPhoneRequired={() => void navigate("/onboarding/verify-phone")}
          searchAvailableNumbers={
            searchAvailableNumbers as (args: {
              businessId: Id<"businesses">;
              mode: "suggested" | "area_code";
              countryCode: AvailableNumberSummary["countryCode"];
              areaCode?: string;
              limit: number;
            }) => Promise<SearchResult>
          }
        />
      )}
    </OnboardingShell>
  );
}
