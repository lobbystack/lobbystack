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
      <h3 className="text-sm font-medium">{t("partnerAccess.title")}</h3>
      <p className="text-sm text-muted-foreground">{t("partnerAccess.description", { appName })}</p>
    </div>
  );
  if (events.isLoading || !businessId) return <div className="flex flex-col gap-4">{header}<Skeleton className="h-40 w-full rounded-xl" /></div>;
  if (events.isError) {
    const code = (events.error as Error & { code?: string }).code;
    return <div className="flex flex-col gap-4">{header}<Surface className="px-6 py-8"><p className="text-sm text-muted-foreground" role="alert">{t(code === "forbidden" ? "partnerAccess.adminsOnly" : "partnerAccess.loadFailed")}</p></Surface></div>;
  }
  const rows = events.data?.events ?? [];
  const when = (value: string) => formatDateTime(value, i18n.language, { dateStyle: "medium", timeStyle: "short" });
  return (
    <div className="flex flex-col gap-4">
      {header}
      {rows.length === 0 ? (
        <Surface className="px-6 py-8"><p className="text-sm text-muted-foreground">{t("partnerAccess.empty", { appName })}</p></Surface>
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
                  <TableCell className="text-sm">{event.name ?? t("partnerAccess.someone", { partnerName: event.partnerName ?? appName })}</TableCell>
                  <TableCell className="text-sm">{t(event.kind === "opened" ? "partnerAccess.opened" : "partnerAccess.left")}</TableCell>
                  <TableCell className="text-sm whitespace-nowrap">{when(event.at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Surface>
      )}
    </div>
  );
}
