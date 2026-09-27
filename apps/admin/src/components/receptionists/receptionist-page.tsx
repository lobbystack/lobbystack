"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AppointmentChangePolicy, BookingMode } from "@lobbystack/shared";

import { NestedPageSurfaceProvider } from "@/components/page-surface";
import { Button } from "@/components/ui/button";
import { ReceptionistInitial } from "@/components/navigation/business-sidebar";
import { NAVIGATION_QUERY_KEY, useNavigationSnapshot } from "@/components/navigation/navigation-provider";
import { requestJson } from "@/lib/request-json";
import type { ReceptionistSection } from "@/lib/navigation-routes";

export type ReceptionistSettings = {
  id: string;
  name: string;
  isDefault: boolean;
  greeting: string;
  tone: string;
  summary: string;
  bookingPolicy: string;
  voiceInstructions: string | null;
  smsInstructions: string | null;
  chatInstructions: string | null;
  transferMode: string;
  transferNumber: string | null;
  appointmentChangePolicy: AppointmentChangePolicy | null;
  bookingMode: BookingMode;
  voice: string | null;
  language: "en" | "fr" | null;
};

export type ReceptionistRoute = { id: string; kind: "phone_number" | "widget_key"; label: string; agentId: string; status: string };
export type SharedUsage = {
  receptionists: Array<{ id: string; name: string }>;
  knowledgeOptOuts: Array<{ agentId: string; documentId: string | null; snippetId: string | null }>;
  serviceOptOuts: Array<{ agentId: string; serviceId: string }>;
};
export type ReceptionistsOverview = {
  receptionists: Array<{ id: string; name: string; isDefault: boolean; bookingMode: string; language: string | null; voice: string | null; phoneNumberCount: number; widgetKeyCount: number }>;
  routes: ReceptionistRoute[];
  usage: SharedUsage;
};

export function receptionistQueryKey(businessId: string | undefined, agentId: string) {
  return ["receptionist", businessId, agentId] as const;
}

export function receptionistsQueryKey(businessId: string | undefined) {
  return ["receptionists", businessId] as const;
}

/** One receptionist's settings, read through the same API the old settings screen used. */
export function useReceptionist(agentId: string) {
  const navigation = useNavigationSnapshot();
  const businessId = navigation?.businessId;
  return useQuery({
    queryKey: receptionistQueryKey(businessId, agentId),
    enabled: Boolean(businessId),
    queryFn: async () => (await requestJson<{ business: { defaultLocale: "en" | "fr"; name: string } | null; profile: ReceptionistSettings }>(`/api/agent?businessId=${encodeURIComponent(businessId!)}&agentId=${encodeURIComponent(agentId)}`)),
  });
}

/** Receptionists with their routes and who uses which shared item. */
export function useReceptionistsOverview() {
  const navigation = useNavigationSnapshot();
  const businessId = navigation?.businessId;
  return useQuery({
    queryKey: receptionistsQueryKey(businessId),
    enabled: Boolean(businessId),
    queryFn: () => requestJson<ReceptionistsOverview>(`/api/receptionists?businessId=${encodeURIComponent(businessId!)}`),
  });
}

/** Saves receptionist settings and refreshes every view that shows them. */
export function useSaveReceptionist(agentId: string) {
  const navigation = useNavigationSnapshot();
  const queryClient = useQueryClient();
  const businessId = navigation?.businessId;
  return async (patch: Record<string, unknown>) => {
    await requestJson(`/api/agent?businessId=${encodeURIComponent(businessId!)}&agentId=${encodeURIComponent(agentId)}`, { method: "PATCH", body: JSON.stringify(patch) });
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: receptionistQueryKey(businessId, agentId) }),
      queryClient.invalidateQueries({ queryKey: receptionistsQueryKey(businessId) }),
      queryClient.invalidateQueries({ queryKey: NAVIGATION_QUERY_KEY }),
    ]);
  };
}

/**
 * The header every receptionist page shares: the receptionist's initial and a
 * title that names it, so the owner always knows which receptionist they edit.
 */
export function ReceptionistPage({ agentId, section, description, actions, children }: { agentId: string; section: ReceptionistSection; description?: string; actions?: React.ReactNode; children: React.ReactNode }) {
  const { t } = useTranslation("receptionists");
  const navigation = useNavigationSnapshot();
  const name = navigation?.receptionists.find((receptionist) => receptionist.id === agentId)?.name ?? "";
  const title = section === "overview" ? name : t("pageTitle", { name, section: t(`sections.${section}`) });
  return (
    <section className="flex flex-1 flex-col gap-6" data-receptionist-id={agentId}>
      <div className="flex flex-col gap-4 py-2 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div className="flex min-w-0 items-center gap-3">
          <ReceptionistInitial name={name} size="lg" />
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="type-page-title ph-mask truncate">{title}</h1>
            {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
          </div>
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      <div className="w-full"><NestedPageSurfaceProvider>{children}</NestedPageSurfaceProvider></div>
    </section>
  );
}

/**
 * The save row every receptionist form uses. Save stays off until something
 * changed and the form is valid; Discard works as soon as something changed,
 * even while the form is invalid. Saving shows progress, and a toast confirms.
 */
export function SaveRow({ dirty, canSave = dirty, saving, onSave, onReset }: { dirty: boolean; canSave?: boolean; saving: boolean; onSave: () => void; onReset: () => void }) {
  const { t } = useTranslation("receptionists");
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {dirty && !saving ? <span className="mr-auto text-sm text-muted-foreground">{t("save.unsaved")}</span> : null}
      <Button disabled={!dirty || saving} onClick={onReset} type="button" variant="ghost">{t("save.discard")}</Button>
      <Button disabled={!dirty || !canSave || saving} onClick={onSave} type="button">
        {saving ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
        {saving ? t("save.saving") : t("save.save")}
      </Button>
    </div>
  );
}
