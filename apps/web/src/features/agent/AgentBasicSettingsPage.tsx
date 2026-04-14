import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useMutation } from "convex/react";
import type { RuntimeLocale } from "@ai-receptionist/shared";
import { useTranslation } from "react-i18next";

import type { Id } from "../../../../../convex/_generated/dataModel";
import { api } from "../../../../../convex/_generated/api";
import {
  setCachedConvexQuery,
  useCachedConvexQuery,
} from "@/lib/cached-convex-query";
import { Button } from "@/components/ui/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@/components/ui/item";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { PhoneInput } from "@/components/ui/phone-input";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { captureAnalyticsEvent } from "@/lib/analytics";

type AgentBasicSettingsPageProps = {
  businessId: Id<"businesses">;
};

type AgentBasicSettingItemProps = {
  action: ReactNode;
  description: string;
  field: ReactNode;
  status?: ReactNode;
  title: string;
};

function AgentBasicSettingItem({
  action,
  description,
  field,
  status,
  title,
}: AgentBasicSettingItemProps) {
  return (
    <Item
      className="grid gap-x-6 gap-y-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
      variant="outline"
    >
      <ItemContent>
        <ItemTitle>{title}</ItemTitle>
        <ItemDescription>{description}</ItemDescription>
        <div className="pt-2">
          {field}
        </div>
        {status ?? null}
      </ItemContent>
      <ItemActions className="w-full justify-end self-center sm:w-auto">
        {action}
      </ItemActions>
    </Item>
  );
}

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

export function AgentBasicSettingsPage({ businessId }: AgentBasicSettingsPageProps) {
  const { i18n, t } = useTranslation(["agent", "common"]);
  const { data: configuration, isLoading: isLoadingConfiguration } = useCachedConvexQuery(
    api.businesses.catalog.getAgentBasicSettings,
    {
      businessId,
    },
  );
  const saveProfile = useMutation(api.ai.context.snapshots.updateReceptionistProfile);
  const persistedProfile = configuration?.profile;

  const [greeting, setGreeting] = useState("");
  const [defaultLocale, setDefaultLocale] = useState<RuntimeLocale>("en");
  const [transferNumber, setTransferNumber] = useState("");
  const [transferNumberInputValue, setTransferNumberInputValue] = useState("");
  const [greetingStatus, setGreetingStatus] = useState<string | null>(null);
  const [localeStatus, setLocaleStatus] = useState<string | null>(null);
  const [transferStatus, setTransferStatus] = useState<string | null>(null);
  const [isGreetingSaving, setIsGreetingSaving] = useState(false);
  const [isLocaleSaving, setIsLocaleSaving] = useState(false);
  const [isTransferSaving, setIsTransferSaving] = useState(false);
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

    return () => {
      for (const timeoutId of timeouts) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [greetingStatus, localeStatus, transferStatus]);

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
      setCachedConvexQuery(api.businesses.catalog.getAgentBasicSettings, {
        businessId,
      }, {
        business: configuration?.business ?? null,
        profile: persistedProfile
          ? {
              _id: persistedProfile._id,
              greeting,
              transferNumber: transferNumberResolution.value ?? undefined,
            }
          : null,
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
      setCachedConvexQuery(api.businesses.catalog.getAgentBasicSettings, {
        businessId,
      }, {
        business: configuration?.business ?? null,
        profile: persistedProfile
          ? {
              _id: persistedProfile._id,
              greeting,
              transferNumber: transferNumberResolution.value ?? undefined,
            }
          : null,
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

  return (
    <div className="w-full overflow-y-auto pb-12">
      <div className="flex w-full flex-col gap-8">
        <ItemGroup spacing="section">
          <AgentBasicSettingItem
            action={(
              <Button
                disabled={isLoadingConfiguration || isGreetingSaving || !persistedProfile}
                onClick={() => void saveGreeting()}
                size="sm"
                type="button"
                variant="outline"
              >
                {isGreetingSaving ? t("agent:actions.saving") : t("agent:actions.save")}
              </Button>
            )}
            description={t("agent:fields.greeting.hint")}
            field={
              isLoadingConfiguration ? (
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
              )
            }
            status={greetingStatus ? <ItemDescription>{greetingStatus}</ItemDescription> : null}
            title={t("agent:fields.greeting.label")}
          />

          <Item variant="outline">
            <ItemContent>
              <ItemTitle>{t("agent:fields.defaultLocale.label")}</ItemTitle>
              <ItemDescription>{t("agent:fields.defaultLocale.hint")}</ItemDescription>
              {isLocaleSaving ? <ItemDescription>{t("agent:actions.saving")}</ItemDescription> : null}
              {!isLocaleSaving && localeStatus ? <ItemDescription>{localeStatus}</ItemDescription> : null}
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
                        setCachedConvexQuery(api.businesses.catalog.getAgentBasicSettings, {
                          businessId,
                        }, {
                          business: configuration?.business
                            ? {
                                ...configuration.business,
                                defaultLocale: nextLocale,
                              }
                            : null,
                          profile: persistedProfile
                            ? {
                                _id: persistedProfile._id,
                                greeting,
                                transferNumber: transferNumberResolution.value ?? undefined,
                              }
                            : null,
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

          <AgentBasicSettingItem
            action={(
              <Button
                disabled={isLoadingConfiguration || isTransferSaving || !persistedProfile}
                onClick={() => void saveTransferNumber()}
                size="sm"
                type="button"
                variant="outline"
              >
                {isTransferSaving ? t("agent:actions.saving") : t("agent:actions.save")}
              </Button>
            )}
            description={t("agent:fields.transferNumber.hint")}
            field={
              isLoadingConfiguration ? (
                <Skeleton className="h-10 w-32 rounded-md" />
              ) : (
                <PhoneInput
                  className="w-[12ch] min-w-0"
                  containerClassName="w-fit"
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
              )
            }
            status={transferStatus ? (
              <ItemDescription
                className={transferStatusTone === "error" ? "text-destructive" : undefined}
              >
                {transferStatus}
              </ItemDescription>
            ) : null}
            title={t("agent:fields.transferNumber.label")}
          />
        </ItemGroup>
      </div>
    </div>
  );
}
