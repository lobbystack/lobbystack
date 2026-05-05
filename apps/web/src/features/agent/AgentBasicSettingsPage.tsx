import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import type { AppointmentChangePolicy, RuntimeLocale } from "@lobbystack/shared";
import { useTranslation } from "react-i18next";

import type { Id } from "../../../../../convex/_generated/dataModel";
import { api } from "../../../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@/components/ui/item";
import { useObservedMutation } from "@/lib/observed-convex";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { PhoneInput } from "@/components/ui/phone-input";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Surface } from "@/components/ui/surface";
import { Switch } from "@/components/ui/switch";
import { captureAnalyticsEvent } from "@/lib/analytics";

type AgentBasicSettingsPageProps = {
  businessId: Id<"businesses">;
};

export function resolveTransferNumberForSave({
  rawInputValue,
  validTransferNumber,
}: {
  rawInputValue: string;
  validTransferNumber: string;
}):
  | { ok: true; value: string | null }
  | { ok: false; errorKey: "agent:fields.transferNumber.errors.invalid" } {
  const trimmedVisibleTransferNumber = rawInputValue.trim();
  if (trimmedVisibleTransferNumber.length === 0) {
    return { ok: true, value: null };
  }

  const trimmedTransferNumber = validTransferNumber.trim();
  if (trimmedTransferNumber.length > 0) {
    return { ok: true, value: trimmedTransferNumber };
  }

  return {
    ok: false,
    errorKey: "agent:fields.transferNumber.errors.invalid",
  };
}

export function buildAppointmentChangePolicyForSave({
  allowCancel,
  allowReschedule,
  requireOtp,
}: {
  allowCancel: boolean;
  allowReschedule: boolean;
  requireOtp: boolean;
}): AppointmentChangePolicy {
  return {
    enabled: allowCancel || allowReschedule,
    allowCancel,
    allowReschedule,
    verificationMode: requireOtp ? "otp_required" : "phone_match_and_facts",
  };
}

export function AgentBasicSettingsPage({ businessId }: AgentBasicSettingsPageProps) {
  const { i18n, t } = useTranslation(["agent", "common"]);
  const configuration = useQuery(api.businesses.catalog.getAgentBasicSettings, {
    businessId,
  });
  const isLoadingConfiguration = configuration === undefined;
  const saveProfile = useObservedMutation(api.ai.context.snapshots.updateReceptionistProfile);
  const persistedProfile = configuration?.profile;

  const [greeting, setGreeting] = useState("");
  const [defaultLocale, setDefaultLocale] = useState<RuntimeLocale>("en");
  const [transferNumber, setTransferNumber] = useState("");
  const [transferNumberInputValue, setTransferNumberInputValue] = useState("");
  const [allowAppointmentCancel, setAllowAppointmentCancel] = useState(true);
  const [allowAppointmentReschedule, setAllowAppointmentReschedule] = useState(true);
  const [requireAppointmentChangeOtp, setRequireAppointmentChangeOtp] = useState(false);
  const [greetingStatus, setGreetingStatus] = useState<string | null>(null);
  const [localeStatus, setLocaleStatus] = useState<string | null>(null);
  const [transferStatus, setTransferStatus] = useState<string | null>(null);
  const [appointmentChangeStatus, setAppointmentChangeStatus] = useState<string | null>(null);
  const [isGreetingSaving, setIsGreetingSaving] = useState(false);
  const [isLocaleSaving, setIsLocaleSaving] = useState(false);
  const [isTransferSaving, setIsTransferSaving] = useState(false);
  const [isAppointmentChangeSaving, setIsAppointmentChangeSaving] = useState(false);
  const [transferStatusTone, setTransferStatusTone] = useState<"success" | "error">("success");
  useEffect(() => {
    const profile = configuration?.profile;
    if (!profile) {
      return;
    }
    setGreeting(profile.greeting);
    setDefaultLocale(configuration.business?.defaultLocale ?? "en");
    setTransferNumber(profile.transferNumber ?? "");
    setTransferNumberInputValue(profile.transferNumber ?? "");
    const appointmentChangePolicy = profile.appointmentChangePolicy as
      | AppointmentChangePolicy
      | undefined;
    setAllowAppointmentCancel(appointmentChangePolicy?.allowCancel ?? true);
    setAllowAppointmentReschedule(appointmentChangePolicy?.allowReschedule ?? true);
    setRequireAppointmentChangeOtp(
      appointmentChangePolicy?.verificationMode === "otp_required",
    );
  }, [configuration]);

  useEffect(() => {
    const timeouts: number[] = [];

    if (greetingStatus) {
      timeouts.push(window.setTimeout(() => {
        setGreetingStatus(null);
      }, 3000));
    }

    if (localeStatus) {
      timeouts.push(window.setTimeout(() => {
        setLocaleStatus(null);
      }, 3000));
    }

    if (transferStatus) {
      timeouts.push(window.setTimeout(() => {
        setTransferStatus(null);
        setTransferStatusTone("success");
      }, 3000));
    }

    if (appointmentChangeStatus) {
      timeouts.push(window.setTimeout(() => {
        setAppointmentChangeStatus(null);
      }, 3000));
    }

    return () => {
      for (const timeoutId of timeouts) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [appointmentChangeStatus, greetingStatus, localeStatus, transferStatus]);

  async function saveGreeting(): Promise<void> {
    if (!persistedProfile) {
      return;
    }

    const transferNumberResolution = resolveTransferNumberForSave({
      rawInputValue: transferNumberInputValue,
      validTransferNumber: transferNumber,
    });
    if (!transferNumberResolution.ok) {
      setTransferStatus(t(transferNumberResolution.errorKey));
      setTransferStatusTone("error");
      return;
    }

    setIsGreetingSaving(true);
    setGreetingStatus(null);
    try {
      await saveProfile({
        businessId,
        defaultLocale,
        greeting,
        transferNumber: transferNumberResolution.value,
      });
      captureAnalyticsEvent("web.agent.settings_saved", {
        businessId: String(businessId),
        setting: "greeting",
      });
      setGreetingStatus(t("agent:actions.saved"));
    } finally {
      setIsGreetingSaving(false);
    }
  }

  async function saveTransferNumber(): Promise<void> {
    if (!persistedProfile) {
      return;
    }

    const transferNumberResolution = resolveTransferNumberForSave({
      rawInputValue: transferNumberInputValue,
      validTransferNumber: transferNumber,
    });
    if (!transferNumberResolution.ok) {
      setTransferStatus(t(transferNumberResolution.errorKey));
      setTransferStatusTone("error");
      return;
    }

    setIsTransferSaving(true);
    setTransferStatus(null);
    try {
      await saveProfile({
        businessId,
        defaultLocale,
        greeting,
        transferNumber: transferNumberResolution.value,
      });
      captureAnalyticsEvent("web.agent.settings_saved", {
        businessId: String(businessId),
        setting: "transfer_number",
      });
      setTransferStatus(t("agent:actions.saved"));
      setTransferStatusTone("success");
    } finally {
      setIsTransferSaving(false);
    }
  }

  async function saveAppointmentChangePolicy({
    allowCancel = allowAppointmentCancel,
    allowReschedule = allowAppointmentReschedule,
    requireOtp = requireAppointmentChangeOtp,
  }: {
    allowCancel?: boolean;
    allowReschedule?: boolean;
    requireOtp?: boolean;
  } = {}): Promise<void> {
    if (!persistedProfile) {
      return;
    }

    const transferNumberResolution = resolveTransferNumberForSave({
      rawInputValue: transferNumberInputValue,
      validTransferNumber: transferNumber,
    });
    if (!transferNumberResolution.ok) {
      setTransferStatus(t(transferNumberResolution.errorKey));
      setTransferStatusTone("error");
      return;
    }

    setIsAppointmentChangeSaving(true);
    setAppointmentChangeStatus(null);
    try {
      await saveProfile({
        businessId,
        defaultLocale,
        greeting,
        transferNumber: transferNumberResolution.value,
        appointmentChangePolicy: buildAppointmentChangePolicyForSave({
          allowCancel,
          allowReschedule,
          requireOtp,
        }),
      });
      captureAnalyticsEvent("web.agent.settings_saved", {
        businessId: String(businessId),
        setting: "appointment_changes",
      });
      setAppointmentChangeStatus(t("agent:actions.saved"));
    } finally {
      setIsAppointmentChangeSaving(false);
    }
  }

  return (
    <div className="w-full overflow-y-auto pb-12">
      <div className="flex w-full flex-col gap-8">
        <section className="flex flex-col gap-3">
          <h2 className="font-heading text-sm leading-snug font-medium">
            {t("agent:fields.defaults.title")}
          </h2>
          <Surface className="flex flex-col">
            <Item
              className="rounded-none border-x-0 border-t-0 border-b border-border last:border-b-0"
              variant="default"
            >
              <ItemContent>
                <ItemTitle>{t("agent:fields.greeting.label")}</ItemTitle>
                <ItemDescription>{t("agent:fields.greeting.hint")}</ItemDescription>
                <div className="pt-2">
                  {isLoadingConfiguration ? (
                    <Skeleton className="h-10 w-full rounded-md sm:max-w-md" />
                  ) : (
                    <Input
                      className="w-full sm:max-w-md"
                      id="agent-greeting"
                      placeholder={t("agent:fields.greeting.placeholder")}
                      value={greeting}
                      onChange={(event) => {
                        setGreeting(event.target.value);
                        setGreetingStatus(null);
                      }}
                    />
                  )}
                </div>
                {greetingStatus ? <ItemDescription>{greetingStatus}</ItemDescription> : null}
              </ItemContent>
              <ItemActions className="w-full justify-end self-center sm:w-auto">
                <Button
                  disabled={isLoadingConfiguration || isGreetingSaving || !persistedProfile}
                  onClick={() => void saveGreeting()}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  {isGreetingSaving ? t("agent:actions.saving") : t("agent:actions.save")}
                </Button>
              </ItemActions>
            </Item>

            <Item
              className="rounded-none border-x-0 border-t-0 border-b border-border last:border-b-0"
              variant="default"
            >
              <ItemContent>
                <ItemTitle>{t("agent:fields.defaultLocale.label")}</ItemTitle>
                <ItemDescription>{t("agent:fields.defaultLocale.hint")}</ItemDescription>
                {isLocaleSaving ? (
                  <ItemDescription>{t("agent:actions.saving")}</ItemDescription>
                ) : null}
                {!isLocaleSaving && localeStatus ? (
                  <ItemDescription>{localeStatus}</ItemDescription>
                ) : null}
              </ItemContent>
              <ItemActions className="w-full sm:w-auto">
                {isLoadingConfiguration ? (
                  <Skeleton className="h-10 w-full rounded-md sm:w-[9.5ch]" />
                ) : (
                  <NativeSelect
                    aria-label={t("agent:fields.defaultLocale.label")}
                    className="w-full sm:w-[9.5ch]"
                    id="agent-default-language"
                    onChange={(event) => {
                      const nextLocale = ((event.target.value as RuntimeLocale | "") || "en");
                      setDefaultLocale(nextLocale);
                      setLocaleStatus(null);
                      void (async () => {
                        if (!persistedProfile) {
                          return;
                        }

                        const transferNumberResolution = resolveTransferNumberForSave({
                          rawInputValue: transferNumberInputValue,
                          validTransferNumber: transferNumber,
                        });
                        if (!transferNumberResolution.ok) {
                          setTransferStatus(t(transferNumberResolution.errorKey));
                          setTransferStatusTone("error");
                          return;
                        }

                        setIsLocaleSaving(true);
                        try {
                          await saveProfile({
                            businessId,
                            defaultLocale: nextLocale,
                            greeting,
                            transferNumber: transferNumberResolution.value,
                          });
                          captureAnalyticsEvent("web.agent.settings_saved", {
                            businessId: String(businessId),
                            setting: "default_locale",
                          });
                          setLocaleStatus(t("agent:actions.saved"));
                        } finally {
                          setIsLocaleSaving(false);
                        }
                      })();
                    }}
                    value={defaultLocale}
                  >
                    <NativeSelectOption value="en">
                      {t("common:language.english")}
                    </NativeSelectOption>
                    <NativeSelectOption value="fr">
                      {t("common:language.french")}
                    </NativeSelectOption>
                  </NativeSelect>
                )}
              </ItemActions>
            </Item>

            <Item
              className="rounded-none border-x-0 border-t-0 border-b border-border last:border-b-0"
              variant="default"
            >
              <ItemContent>
                <ItemTitle>{t("agent:fields.transferNumber.label")}</ItemTitle>
                <ItemDescription>{t("agent:fields.transferNumber.hint")}</ItemDescription>
                <div className="pt-2">
                  {isLoadingConfiguration ? (
                    <Skeleton className="h-10 w-32 rounded-md" />
                  ) : (
                    <PhoneInput
                      className="w-full min-w-0 sm:w-[12ch]"
                      containerClassName="w-full sm:w-fit"
                      id="agent-transfer-number"
                      locale={i18n.language}
                      maxLength={18}
                      onRawValueChange={(nextRawValue) => {
                        setTransferNumberInputValue(nextRawValue);
                        setTransferStatus(null);
                        setTransferStatusTone("success");
                      }}
                      value={transferNumber || undefined}
                      onChange={(nextValue) => {
                        setTransferNumber(nextValue ?? "");
                        setTransferStatus(null);
                        setTransferStatusTone("success");
                      }}
                    />
                  )}
                </div>
                {transferStatus ? (
                  <ItemDescription
                    className={transferStatusTone === "error" ? "text-destructive" : undefined}
                  >
                    {transferStatus}
                  </ItemDescription>
                ) : null}
              </ItemContent>
              <ItemActions className="w-full justify-end self-center sm:w-auto">
                <Button
                  disabled={isLoadingConfiguration || isTransferSaving || !persistedProfile}
                  onClick={() => void saveTransferNumber()}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  {isTransferSaving ? t("agent:actions.saving") : t("agent:actions.save")}
                </Button>
              </ItemActions>
            </Item>
          </Surface>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-heading text-sm leading-snug font-medium">
            {t("agent:appointmentChanges.title")}
          </h2>
          <Surface className="flex flex-col">
            <Item
              className="rounded-none border-x-0 border-t-0 border-b border-border last:border-b-0"
              variant="default"
            >
              <ItemContent>
                <ItemTitle>{t("agent:appointmentChanges.allowCancel.label")}</ItemTitle>
                <ItemDescription>
                  {t("agent:appointmentChanges.allowCancel.hint")}
                </ItemDescription>
              </ItemContent>
              <ItemActions>
                {isLoadingConfiguration ? (
                  <Skeleton className="h-5 w-8 rounded-full" />
                ) : (
                  <Switch
                    aria-label={t("agent:appointmentChanges.allowCancel.label")}
                    checked={allowAppointmentCancel}
                    disabled={isAppointmentChangeSaving || !persistedProfile}
                    onCheckedChange={(checked) => {
                      setAllowAppointmentCancel(checked);
                      setAppointmentChangeStatus(null);
                      void saveAppointmentChangePolicy({ allowCancel: checked });
                    }}
                  />
                )}
              </ItemActions>
            </Item>

            <Item
              className="rounded-none border-x-0 border-t-0 border-b border-border last:border-b-0"
              variant="default"
            >
              <ItemContent>
                <ItemTitle>{t("agent:appointmentChanges.allowReschedule.label")}</ItemTitle>
                <ItemDescription>
                  {t("agent:appointmentChanges.allowReschedule.hint")}
                </ItemDescription>
              </ItemContent>
              <ItemActions>
                {isLoadingConfiguration ? (
                  <Skeleton className="h-5 w-8 rounded-full" />
                ) : (
                  <Switch
                    aria-label={t("agent:appointmentChanges.allowReschedule.label")}
                    checked={allowAppointmentReschedule}
                    disabled={isAppointmentChangeSaving || !persistedProfile}
                    onCheckedChange={(checked) => {
                      setAllowAppointmentReschedule(checked);
                      setAppointmentChangeStatus(null);
                      void saveAppointmentChangePolicy({ allowReschedule: checked });
                    }}
                  />
                )}
              </ItemActions>
            </Item>

            <Item
              className="rounded-none border-x-0 border-t-0 border-b border-border last:border-b-0"
              variant="default"
            >
              <ItemContent>
                <ItemTitle>{t("agent:appointmentChanges.requireOtp.label")}</ItemTitle>
                <ItemDescription>
                  {t("agent:appointmentChanges.requireOtp.hint")}
                </ItemDescription>
                {appointmentChangeStatus ? (
                  <ItemDescription>{appointmentChangeStatus}</ItemDescription>
                ) : null}
              </ItemContent>
              <ItemActions>
                {isLoadingConfiguration ? (
                  <Skeleton className="h-5 w-8 rounded-full" />
                ) : (
                  <Switch
                    aria-label={t("agent:appointmentChanges.requireOtp.label")}
                    checked={requireAppointmentChangeOtp}
                    disabled={isAppointmentChangeSaving || !persistedProfile}
                    onCheckedChange={(checked) => {
                      setRequireAppointmentChangeOtp(checked);
                      setAppointmentChangeStatus(null);
                      void saveAppointmentChangePolicy({ requireOtp: checked });
                    }}
                  />
                )}
              </ItemActions>
            </Item>
          </Surface>
        </section>
      </div>
    </div>
  );
}
