"use client";

import { useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { useConsolePartner } from "@/components/partner-shell";
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item";
import { Skeleton } from "@/components/ui/skeleton";
import { Surface } from "@/components/ui/surface";
import { Switch } from "@/components/ui/switch";
import { fetchPartnerSettings, partnerSettingsQueryKey, type PartnerSettings } from "@/lib/partner-settings";
import { requestJson } from "@/lib/request-json";

/**
 * The console's Settings page: whether the console shares product telemetry,
 * as a business's Appearance settings say for its dashboard. Everyone on the
 * team sees it, and owners and admins change it; the server enforces the same.
 * The console's telemetry consent reads the same query, so a change here
 * applies to the next event at once.
 */
export function PartnerSettingsSurface() {
  const { t } = useTranslation("partner");
  const partner = useConsolePartner();
  const queryClient = useQueryClient();
  const queryKey = partnerSettingsQueryKey(partner.partnerId);
  const settings = useQuery({ queryKey, queryFn: () => fetchPartnerSettings(partner.partnerId) });
  const role = settings.data?.role ?? partner.role;
  const canEdit = role === "owner" || role === "admin";
  // The person can switch partners while a save is in flight, so each save
  // names its partner, and only the partner still open hears how it went.
  const openPartnerId = useRef(partner.partnerId);
  openPartnerId.current = partner.partnerId;
  const update = useMutation({
    mutationFn: (input: { partnerId: string; telemetryEnabled: boolean }) => requestJson<PartnerSettings>("/api/partner/settings", { method: "PATCH", body: JSON.stringify(input) }),
    onMutate: async (input) => {
      const key = partnerSettingsQueryKey(input.partnerId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<PartnerSettings>(key);
      if (previous) queryClient.setQueryData(key, { ...previous, telemetryEnabled: input.telemetryEnabled });
      return { previous };
    },
    onError: (_error, input, context) => {
      if (context?.previous) queryClient.setQueryData(partnerSettingsQueryKey(input.partnerId), context.previous);
      if (openPartnerId.current === input.partnerId) toast.error(t("settings.telemetry.saveFailed"));
    },
    onSuccess: (_saved, input) => { if (openPartnerId.current === input.partnerId) toast.success(t("settings.saved")); },
    onSettled: async (_saved, _error, input) => { await queryClient.invalidateQueries({ queryKey: partnerSettingsQueryKey(input.partnerId) }); },
  });
  const saving = update.isPending && update.variables?.partnerId === partner.partnerId;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("settings.title")} />
      {settings.isError ? (
        <p className="text-sm text-muted-foreground" role="alert">{t("settings.loadFailed")}</p>
      ) : (
        <Surface className="flex flex-col">
          <Item className="rounded-none border-0" variant="default">
            <ItemContent>
              <ItemTitle>{t("settings.telemetry.label")}</ItemTitle>
              <ItemDescription>{t("settings.telemetry.description")}</ItemDescription>
            </ItemContent>
            <ItemActions className="w-full sm:w-auto">
              {settings.data ? (
                <Switch aria-label={t("settings.telemetry.label")} checked={settings.data.telemetryEnabled} disabled={!canEdit || saving} onCheckedChange={(checked) => update.mutate({ partnerId: partner.partnerId, telemetryEnabled: checked })} />
              ) : (
                <Skeleton className="h-5 w-9 rounded-full" />
              )}
            </ItemActions>
          </Item>
        </Surface>
      )}
      {canEdit ? null : <p className="text-sm text-muted-foreground">{t("settings.membersCantEdit")}</p>}
    </div>
  );
}
