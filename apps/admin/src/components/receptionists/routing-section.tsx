"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Globe, Phone } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@/components/ui/item";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { Surface } from "@/components/ui/surface";
import { useNavigationSnapshot } from "@/components/navigation/navigation-provider";
import { requestJson } from "@/lib/request-json";
import { receptionistsQueryKey, useReceptionistsOverview, type ReceptionistRoute } from "./receptionist-page";

type PendingChange = { route: ReceptionistRoute; agentId: string };

/**
 * Which receptionist answers each number and the website widget. A change
 * asks first and names the number, the old receptionist and the new one.
 */
export function RoutingSection() {
  const { t } = useTranslation("receptionists");
  const navigation = useNavigationSnapshot();
  const queryClient = useQueryClient();
  const overview = useReceptionistsOverview();
  const [change, setChange] = useState<PendingChange | null>(null);
  const [saving, setSaving] = useState(false);
  const receptionists = navigation?.receptionists ?? [];
  const nameOf = (id: string) => receptionists.find((receptionist) => receptionist.id === id)?.name ?? "";
  const routes = overview.data?.routes ?? [];
  const label = (route: ReceptionistRoute) => route.kind === "phone_number" ? route.label : route.label || t("numbers.widget");

  async function apply() {
    if (!change || !navigation) return;
    setSaving(true);
    try {
      await requestJson(`/api/receptionists?businessId=${encodeURIComponent(navigation.businessId)}`, { method: "PUT", body: JSON.stringify({ kind: change.route.kind, id: change.route.id, agentId: change.agentId }) });
      await queryClient.invalidateQueries({ queryKey: receptionistsQueryKey(navigation.businessId) });
      toast.success(t("routing.saved", { route: label(change.route), name: nameOf(change.agentId) }));
      setChange(null);
    } catch (error) {
      toast.error(error instanceof Error && error.message ? error.message : t("save.failed"));
      throw error;
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="flex flex-col gap-3" data-testid="routing-section">
      <div className="flex flex-col gap-1">
        <h2 className="font-heading text-sm leading-snug font-medium">{t("routing.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("routing.description")}</p>
      </div>
      {overview.isLoading ? <Skeleton className="h-24 w-full rounded-xl" /> : (
        <Surface className="flex flex-col">
          {routes.length === 0 ? <p className="p-6 text-sm text-muted-foreground">{t("routing.empty")}</p> : routes.map((route) => (
            <Item className="rounded-none border-x-0 border-t-0 border-b border-border last:border-b-0" key={route.id} variant="default">
              <ItemMedia>{route.kind === "phone_number" ? <Phone className="size-4" /> : <Globe className="size-4" />}</ItemMedia>
              <ItemContent>
                <ItemTitle className="ph-mask">{label(route)}</ItemTitle>
                <ItemDescription>{route.kind === "phone_number" ? t("numbers.phoneRoute") : t("numbers.widgetRoute")}</ItemDescription>
              </ItemContent>
              <ItemActions>
                {receptionists.length > 1 && navigation?.canManage ? (
                  <NativeSelect aria-label={t("routing.answeredByFor", { route: label(route) })} className="w-48" onChange={(event) => { if (event.target.value !== route.agentId) setChange({ route, agentId: event.target.value }); }} value={route.agentId}>
                    {receptionists.map((receptionist) => <NativeSelectOption key={receptionist.id} value={receptionist.id}>{receptionist.name}</NativeSelectOption>)}
                  </NativeSelect>
                ) : <span className="ph-mask text-sm text-muted-foreground">{t("routing.answeredBy", { name: nameOf(route.agentId) })}</span>}
              </ItemActions>
            </Item>
          ))}
        </Surface>
      )}
      <ConfirmActionDialog
        cancelLabel={t("create.cancel")}
        confirmLabel={t("routing.confirm")}
        description={change ? t(change.route.kind === "phone_number" ? "routing.confirmPhone" : "routing.confirmWidget", { route: label(change.route), from: nameOf(change.route.agentId), to: nameOf(change.agentId) }) : ""}
        onConfirm={apply}
        onOpenChange={(open) => { if (!open) setChange(null); }}
        open={change !== null}
        pending={saving}
        title={t("routing.confirmTitle")}
      />
    </section>
  );
}
