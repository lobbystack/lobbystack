"use client";

import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { normalizeBookingMode, type BookingMode } from "@lobbystack/shared";

import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { Surface } from "@/components/ui/surface";
import { Switch } from "@/components/ui/switch";
import { useNavigationSnapshot } from "@/components/navigation/navigation-provider";
import { allServicesQueryKey, fetchAllCatalogServices } from "@/lib/catalog-services";
import { requestJson } from "@/lib/request-json";
import { itemUsedBy, receptionistUsesItem } from "@/lib/receptionist-usage";
import { ReceptionistPage, receptionistsQueryKey, SaveRow, useReceptionist, useReceptionistsOverview, useSaveReceptionist, type ReceptionistSettings } from "./receptionist-page";
import { SharedToggleList } from "./shared-toggle-list";
import { staffQueryKey } from "./staff-surface";
import { Button } from "@/components/ui/button";
import { Item, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item";

type BookingValues = { bookingMode: BookingMode; allowCancel: boolean; allowReschedule: boolean; requireOtp: boolean };

function valuesFrom(profile: ReceptionistSettings): BookingValues {
  return {
    bookingMode: normalizeBookingMode(profile.bookingMode),
    allowCancel: profile.appointmentChangePolicy?.allowCancel ?? true,
    allowReschedule: profile.appointmentChangePolicy?.allowReschedule ?? true,
    requireOtp: profile.appointmentChangePolicy?.verificationMode === "otp_required",
  };
}

/** Booking mode, appointment changes, and which services this receptionist can book. */
export function ReceptionistBookingSurface({ agentId }: { agentId: string }) {
  const { t } = useTranslation("receptionists");
  const navigation = useNavigationSnapshot();
  const queryClient = useQueryClient();
  const businessId = navigation?.businessId;
  const canManage = navigation?.canManage ?? false;
  const query = useReceptionist(agentId);
  const overview = useReceptionistsOverview();
  const save = useSaveReceptionist(agentId);
  const catalog = useQuery({ queryKey: allServicesQueryKey(businessId), enabled: Boolean(businessId), queryFn: () => fetchAllCatalogServices(businessId!) });
  const saved = useMemo(() => query.data ? valuesFrom(query.data.profile) : null, [query.data]);
  const [values, setValues] = useState<BookingValues | null>(null);
  const [saving, setSaving] = useState(false);
  const ids = { mode: useId(), cancel: useId(), reschedule: useId(), otp: useId() };
  useEffect(() => { if (saved) setValues(saved); }, [saved]);
  const dirty = Boolean(saved && values && JSON.stringify(saved) !== JSON.stringify(values));

  async function submit() {
    if (!values || !dirty) return;
    setSaving(true);
    try {
      await save({
        bookingMode: values.bookingMode,
        appointmentChangePolicy: { enabled: values.allowCancel || values.allowReschedule, allowCancel: values.allowCancel, allowReschedule: values.allowReschedule, verificationMode: values.requireOtp ? "otp_required" : "phone_match_and_facts" },
      });
      toast.success(t("save.saved"));
    } catch (error) {
      toast.error(error instanceof Error && error.message ? error.message : t("save.failed"));
    } finally {
      setSaving(false);
    }
  }

  const usage = overview.data?.usage;
  const services = usage ? (catalog.data ?? []).filter((service) => service.active).map((service) => ({
    id: service.id,
    title: service.name,
    description: t("booking.duration", { count: service.durationMinutes }),
    enabled: receptionistUsesItem(usage, { kind: "service", id: service.id }, agentId),
    usedBy: itemUsedBy(usage, { kind: "service", id: service.id }),
  })) : [];

  return (
    <ReceptionistPage agentId={agentId} description={t("booking.description")} section="booking">
      <div className="flex flex-col gap-8">
        {!values ? <Skeleton className="h-64 w-full rounded-xl" /> : (
          <form className="flex flex-col gap-6" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
            <Surface className="p-6">
              <FieldGroup>
                <Field>
                  <FieldContent><FieldLabel htmlFor={ids.mode}>{t("booking.mode.label")}</FieldLabel><FieldDescription>{t(`booking.mode.descriptions.${values.bookingMode}`)}</FieldDescription></FieldContent>
                  <NativeSelect className="sm:w-64" disabled={!canManage} id={ids.mode} onChange={(event) => setValues({ ...values, bookingMode: normalizeBookingMode(event.target.value) })} value={values.bookingMode}>
                    <NativeSelectOption value="instant">{t("booking.mode.options.instant")}</NativeSelectOption>
                    <NativeSelectOption value="request">{t("booking.mode.options.request")}</NativeSelectOption>
                    <NativeSelectOption value="off">{t("booking.mode.options.off")}</NativeSelectOption>
                  </NativeSelect>
                </Field>
                <Field orientation="horizontal">
                  <Switch checked={values.allowCancel} disabled={!canManage} id={ids.cancel} onCheckedChange={(allowCancel) => setValues({ ...values, allowCancel })} />
                  <FieldContent><FieldLabel htmlFor={ids.cancel}>{t("booking.allowCancel.label")}</FieldLabel><FieldDescription>{t("booking.allowCancel.hint")}</FieldDescription></FieldContent>
                </Field>
                <Field orientation="horizontal">
                  <Switch checked={values.allowReschedule} disabled={!canManage} id={ids.reschedule} onCheckedChange={(allowReschedule) => setValues({ ...values, allowReschedule })} />
                  <FieldContent><FieldLabel htmlFor={ids.reschedule}>{t("booking.allowReschedule.label")}</FieldLabel><FieldDescription>{t("booking.allowReschedule.hint")}</FieldDescription></FieldContent>
                </Field>
                <Field orientation="horizontal">
                  <Switch checked={values.requireOtp} disabled={!canManage} id={ids.otp} onCheckedChange={(requireOtp) => setValues({ ...values, requireOtp })} />
                  <FieldContent><FieldLabel htmlFor={ids.otp}>{t("booking.requireOtp.label")}</FieldLabel><FieldDescription>{t("booking.requireOtp.hint")}</FieldDescription></FieldContent>
                </Field>
              </FieldGroup>
            </Surface>
            {canManage ? <SaveRow dirty={dirty} onReset={() => saved && setValues(saved)} onSave={() => void submit()} saving={saving} /> : null}
          </form>
        )}
        {!usage || catalog.isLoading ? <Skeleton className="h-40 w-full rounded-xl" /> : (
          <SharedToggleList
            canManage={canManage}
            receptionistCount={navigation?.receptionists.length ?? 1}
            description={t("booking.servicesDescription")}
            emptyLabel={t("booking.servicesEmpty")}
            items={services}
            manageHref="/services"
            manageLabel={t("booking.manageServices")}
            onToggle={async (item, enabled) => {
              await requestJson(`/api/receptionists/${encodeURIComponent(agentId)}?businessId=${encodeURIComponent(businessId!)}`, { method: "PATCH", body: JSON.stringify({ kind: "service", serviceId: item.id, enabled }) });
              await queryClient.invalidateQueries({ queryKey: receptionistsQueryKey(businessId) });
            }}
            title={t("booking.servicesTitle")}
          />
        )}
        {navigation?.staffEnabled ? <BookingStaffSection /> : null}
      </div>
    </ReceptionistPage>
  );
}

/** With staff on, who this receptionist can book with. Staff are shared by every receptionist. */
function BookingStaffSection() {
  const { t } = useTranslation("receptionists");
  const navigation = useNavigationSnapshot();
  const businessId = navigation?.businessId;
  const staff = useQuery({ queryKey: staffQueryKey(businessId), enabled: Boolean(businessId), queryFn: () => requestJson<{ staff: Array<{ id: string; name: string; active: boolean; serviceIds: string[] }> }>(`/api/staff?businessId=${encodeURIComponent(businessId!)}`) });
  const members = (staff.data?.staff ?? []).filter((member) => member.active);
  return (
    <section className="flex flex-col gap-3" data-testid="booking-staff">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="flex flex-col gap-1">
          <h2 className="font-heading text-sm leading-snug font-medium">{t("booking.staffTitle")}</h2>
          <p className="text-sm text-muted-foreground">{t("booking.staffDescription")}</p>
        </div>
        <Button nativeButton={false} render={<Link href="/staff" />} size="sm" variant="outline">{t("booking.manageStaff")}</Button>
      </div>
      <Surface className="flex flex-col">
        {staff.isLoading ? <Skeleton className="h-16 w-full rounded-xl" /> : members.map((member) => (
          <Item className="rounded-none border-x-0 border-t-0 border-b border-border last:border-b-0" key={member.id} variant="default">
            <ItemContent>
              <ItemTitle className="ph-mask">{member.name}</ItemTitle>
              <ItemDescription>{t("staff.services", { count: member.serviceIds.length })}</ItemDescription>
            </ItemContent>
          </Item>
        ))}
      </Surface>
    </section>
  );
}
