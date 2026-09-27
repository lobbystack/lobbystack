"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item";
import { Skeleton } from "@/components/ui/skeleton";
import { Surface } from "@/components/ui/surface";
import { Switch } from "@/components/ui/switch";
import { NAVIGATION_QUERY_KEY, useNavigationSnapshot } from "@/components/navigation/navigation-provider";
import { requestJson } from "@/lib/request-json";
import { BusinessPage } from "./business-page";

type StaffMember = { id: string; name: string; active: boolean; serviceIds: string[] };

export function staffQueryKey(businessId: string | undefined) {
  return ["staff", businessId] as const;
}

/** The team appointments can be booked with. Only shown once staff is turned on. */
export function StaffSurface() {
  const { t } = useTranslation("receptionists");
  const navigation = useNavigationSnapshot();
  const queryClient = useQueryClient();
  const businessId = navigation?.businessId;
  const canManage = navigation?.canManage ?? false;
  const [name, setName] = useState("");
  const nameId = useId();
  const staff = useQuery({ queryKey: staffQueryKey(businessId), enabled: Boolean(businessId), queryFn: () => requestJson<{ staff: StaffMember[] }>(`/api/staff?businessId=${encodeURIComponent(businessId!)}`) });
  const refresh = () => Promise.all([queryClient.invalidateQueries({ queryKey: staffQueryKey(businessId) }), queryClient.invalidateQueries({ queryKey: ["calendar", businessId] })]);
  const add = useMutation({
    mutationFn: () => requestJson(`/api/staff?businessId=${encodeURIComponent(businessId!)}`, { method: "POST", body: JSON.stringify({ name: name.trim() }) }),
    onSuccess: async () => { toast.success(t("staff.added", { name: name.trim() })); setName(""); await refresh(); },
    onError: (error) => toast.error(error instanceof Error && error.message ? error.message : t("save.failed")),
  });
  const update = useMutation({
    mutationFn: (input: { member: StaffMember; active: boolean }) => requestJson(`/api/staff?businessId=${encodeURIComponent(businessId!)}`, { method: "PATCH", body: JSON.stringify({ staffId: input.member.id, active: input.active }) }),
    onSuccess: async (_data, input) => { toast.success(t(input.active ? "staff.turnedOn" : "staff.turnedOff", { name: input.member.name })); await refresh(); },
    onError: (error) => toast.error(error instanceof Error && error.message ? error.message : t("save.failed")),
  });
  const members = staff.data?.staff ?? [];

  return (
    <BusinessPage title={t("nav.staff")}>
      <div className="flex max-w-3xl flex-col gap-6">
        <p className="text-sm text-muted-foreground">{t("staff.description")}</p>
        {canManage ? (
          <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(event) => { event.preventDefault(); if (name.trim() && !add.isPending) add.mutate(); }}>
            <label className="sr-only" htmlFor={nameId}>{t("staff.nameLabel")}</label>
            <Input id={nameId} maxLength={120} onChange={(event) => setName(event.target.value)} placeholder={t("staff.namePlaceholder")} value={name} />
            <Button disabled={!name.trim()} loading={add.isPending} type="submit"><Plus data-icon="inline-start" />{t("staff.add")}</Button>
          </form>
        ) : null}
        {staff.isLoading ? <Skeleton className="h-40 w-full rounded-xl" /> : (
          <Surface className="flex flex-col" data-testid="staff-list">
            {members.map((member) => (
              <Item className="rounded-none border-x-0 border-t-0 border-b border-border last:border-b-0" key={member.id} variant="default">
                <ItemContent>
                  <ItemTitle className="ph-mask">{member.name}</ItemTitle>
                  <ItemDescription>{member.active ? t("staff.services", { count: member.serviceIds.length }) : t("staff.off")}</ItemDescription>
                </ItemContent>
                <ItemActions>
                  <Switch aria-label={t("staff.activeLabel", { name: member.name })} checked={member.active} disabled={!canManage || update.isPending} onCheckedChange={(active) => update.mutate({ member, active })} />
                </ItemActions>
              </Item>
            ))}
          </Surface>
        )}
      </div>
    </BusinessPage>
  );
}

/** The Settings switch that shows or hides staff management for the business. */
export function StaffSettingsCard() {
  const { t } = useTranslation("receptionists");
  const navigation = useNavigationSnapshot();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const switchId = useId();
  if (!navigation?.newNavigation) return null;

  async function toggle(enabled: boolean) {
    if (!navigation) return;
    setSaving(true);
    try {
      await requestJson(`/api/staff?businessId=${encodeURIComponent(navigation.businessId)}`, { method: "PATCH", body: JSON.stringify({ enabled }) });
      await queryClient.invalidateQueries({ queryKey: NAVIGATION_QUERY_KEY });
      toast.success(t(enabled ? "staff.enabled" : "staff.disabled"));
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error && error.message ? error.message : t("save.failed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Surface className="flex items-start justify-between gap-6 p-6" data-testid="staff-settings">
      <div className="flex flex-col gap-1">
        <label className="font-medium" htmlFor={switchId}>{t("staff.toggleLabel")}</label>
        <p className="text-sm text-muted-foreground">{t("staff.toggleHint")}</p>
      </div>
      <Switch checked={navigation.staffEnabled} disabled={!navigation.canManage || saving} id={switchId} onCheckedChange={(checked) => void toggle(checked)} />
    </Surface>
  );
}
