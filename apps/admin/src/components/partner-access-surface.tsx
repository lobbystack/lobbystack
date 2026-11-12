"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { useActiveBusiness } from "@/hooks/use-active-business";
import { useBranding } from "@/components/branding-provider";
import { Skeleton } from "@/components/ui/skeleton";
import { Surface } from "@/components/ui/surface";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/lib/locale";
import { requestJson } from "@/lib/request-json";
import { EmptyState } from "@/components/ui/empty-state";

type PartnerAccessEvent = { id: string; kind: "opened" | "left"; at: string; name: string | null; partnerName: string | null };

/**
 * The Partner access tab of a partner's business: each time someone on the
 * partner's team opened the business or left it, from its audit log. Owners
 * and admins read it; the server refuses everyone else.
 */
export function PartnerAccessSurface() {
  const { t, i18n } = useTranslation("settings");
  const { appName } = useBranding();
  const { business } = useActiveBusiness();
  const businessId = business?.businessId;
  const events = useQuery({
    queryKey: ["partner-access", businessId],
    queryFn: () => requestJson<{ events: PartnerAccessEvent[] }>(`/api/partner-access?businessId=${encodeURIComponent(businessId!)}`),
    enabled: Boolean(businessId),
  });
  const header = (
    <div className="flex flex-col gap-1">
      <h3 className="type-title">{t("partnerAccess.title")}</h3>
      <p className="type-body-muted">{t("partnerAccess.description", { appName })}</p>
    </div>
  );
  if (events.isLoading || !businessId) return <div className="flex flex-col gap-4">{header}<Skeleton className="h-40 w-full rounded-xl" /></div>;
  if (events.isError) {
    const code = (events.error as Error & { code?: string }).code;
    return <div className="flex flex-col gap-4">{header}<Surface className="px-6 py-8"><p className="type-body-muted" role="alert">{t(code === "forbidden" ? "partnerAccess.adminsOnly" : "partnerAccess.loadFailed")}</p></Surface></div>;
  }
  const rows = events.data?.events ?? [];
  const when = (value: string) => formatDateTime(value, i18n.language, { dateStyle: "medium", timeStyle: "short" });
  return (
    <div className="flex flex-col gap-4">
      {header}
      {rows.length === 0 ? (
        <EmptyState title={t("partnerAccess.empty", { appName })} />
      ) : (
        <Surface className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("partnerAccess.columns.who")}</TableHead>
                <TableHead>{t("partnerAccess.columns.what")}</TableHead>
                <TableHead>{t("partnerAccess.columns.when")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((event) => (
                <TableRow key={event.id}>
                  <TableCell className="type-body">{event.name ?? t("partnerAccess.someone", { partnerName: event.partnerName ?? appName })}</TableCell>
                  <TableCell className="type-body">{t(event.kind === "opened" ? "partnerAccess.opened" : "partnerAccess.left")}</TableCell>
                  <TableCell className="type-body whitespace-nowrap">{when(event.at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Surface>
      )}
    </div>
  );
}
