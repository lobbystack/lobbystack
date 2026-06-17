import { useState } from "react";

import { useQuery } from "convex/react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@/components/ui/item";
import { Skeleton } from "@/components/ui/skeleton";
import {
  PhoneNumberChooser,
  type AvailableNumberSummary,
  type ClaimResult,
  type InitialSuggestionResult,
  type SearchResult,
} from "@/features/onboarding/components/PhoneNumberChooser";
import { formatPhoneNumberDisplay } from "@/lib/phone";
import { useObservedAction } from "@/lib/observed-convex";

type SettingsPhoneNumberPageProps = {
  businessId: Id<"businesses">;
  canManageTenant: boolean;
  phoneNumberReplacementUsedAt?: string;
};

type PrimaryPhoneNumber = {
  _id: Id<"phone_numbers">;
  e164: string;
  voiceEnabled: boolean;
  smsEnabled: boolean;
  status: string;
};

function getSettingsPhoneNumberErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }

  return fallback;
}

export function SettingsPhoneNumberPage({
  businessId,
  canManageTenant,
  phoneNumberReplacementUsedAt,
}: SettingsPhoneNumberPageProps) {
  const { i18n, t } = useTranslation("settings");
  const primaryPhoneNumber = useQuery(api.businesses.catalog.getPrimaryPhoneNumber, {
    businessId,
  }) as PrimaryPhoneNumber | null | undefined;
  const getInitialReplacementNumberSuggestion = useObservedAction(
    api.settings.phoneNumbers.getInitialReplacementNumberSuggestion,
  );
  const searchReplacementNumbers = useObservedAction(
    api.settings.phoneNumbers.searchReplacementNumbers,
  );
  const claimReplacementNumber = useObservedAction(
    api.settings.phoneNumbers.claimReplacementNumber,
  );
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const displayPhoneNumber = primaryPhoneNumber
    ? formatPhoneNumberDisplay(primaryPhoneNumber.e164, i18n.language)
    : null;
  const hasUsedPhoneNumberChange = Boolean(phoneNumberReplacementUsedAt);

  function handleClaimed(result: Extract<ClaimResult, { status: "claimed" }>): void {
    toast.success(t("phoneNumber.toast.changed"));
    setIsDialogOpen(false);
    void result;
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="w-full">
        <ItemGroup spacing="section">
          <Item variant="outline">
            <ItemContent>
              <ItemTitle>{t("phoneNumber.current.label")}</ItemTitle>
              <ItemDescription>{t("phoneNumber.current.description")}</ItemDescription>
              {primaryPhoneNumber === undefined ? (
                <Skeleton className="h-6 w-48 max-w-full" />
              ) : displayPhoneNumber ? (
                <p className="text-[15px] leading-6 text-foreground">{displayPhoneNumber}</p>
              ) : (
                <p className="text-[15px] leading-6 text-muted-foreground">
                  {t("phoneNumber.current.empty")}
                </p>
              )}
            </ItemContent>
            {canManageTenant ? (
              <ItemActions>
                {hasUsedPhoneNumberChange ? (
                  <Button
                    nativeButton={false}
                    render={<a href="mailto:support@lobbystack.com" />}
                    size="sm"
                    variant="outline"
                  >
                    {t("phoneNumber.actions.contactUs")}
                  </Button>
                ) : (
                  <Dialog onOpenChange={setIsDialogOpen} open={isDialogOpen}>
                    <DialogTrigger
                      render={
                        <Button
                          disabled={primaryPhoneNumber === undefined || primaryPhoneNumber === null}
                          size="sm"
                          variant="outline"
                        />
                      }
                    >
                      {t("phoneNumber.actions.requestChange")}
                    </DialogTrigger>
                    <DialogContent className="max-w-3xl">
                      <DialogHeader>
                        <DialogTitle>{t("phoneNumber.dialog.title")}</DialogTitle>
                        <DialogDescription>
                          {t("phoneNumber.dialog.description")}
                        </DialogDescription>
                      </DialogHeader>
                      {isDialogOpen ? (
                        <PhoneNumberChooser
                          businessId={businessId}
                          claimNumber={claimReplacementNumber as (args: {
                            businessId: Id<"businesses">;
                            e164: string;
                            selectionContext: AvailableNumberSummary["selectionContext"];
                            claimToken: string;
                          }) => Promise<ClaimResult>}
                          getErrorMessage={getSettingsPhoneNumberErrorMessage}
                          getInitialNumberSuggestion={
                            getInitialReplacementNumberSuggestion as (args: {
                              businessId: Id<"businesses">;
                            }) => Promise<InitialSuggestionResult>
                          }
                          labels={{
                            countryLabel: t("phoneNumber.picker.countryLabel"),
                            areaCodeLabel: t("phoneNumber.picker.areaCodeLabel"),
                            areaCodePlaceholder: t("phoneNumber.picker.areaCodePlaceholder"),
                            search: t("phoneNumber.picker.search"),
                            phoneNumberHeader: t("phoneNumber.picker.phoneNumberHeader"),
                            select: t("phoneNumber.picker.select"),
                            loadMore: t("phoneNumber.picker.loadMore"),
                            empty: t("phoneNumber.picker.empty"),
                            loadFailed: t("phoneNumber.picker.loadFailed"),
                            searchFailed: t("phoneNumber.picker.searchFailed"),
                            claimFailed: t("phoneNumber.picker.claimFailed"),
                            unavailable: t("phoneNumber.picker.unavailable"),
                          }}
                          onClaimed={handleClaimed}
                          searchAvailableNumbers={
                            searchReplacementNumbers as (args: {
                              businessId: Id<"businesses">;
                              mode: "suggested" | "area_code";
                              countryCode: AvailableNumberSummary["countryCode"];
                              areaCode?: string;
                              limit: number;
                            }) => Promise<SearchResult>
                          }
                        />
                      ) : null}
                    </DialogContent>
                  </Dialog>
                )}
              </ItemActions>
            ) : null}
          </Item>
        </ItemGroup>
      </div>
    </div>
  );
}
