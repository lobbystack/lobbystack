"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import { SectionBlock } from "@/components/section-block";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Surface } from "@/components/ui/surface";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { selectActiveBusiness } from "@/lib/active-business";
import type { WorkspaceViewModel } from "@/lib/page-view-models";
import { requestJson } from "@/lib/request-json";
import { intlLocale } from "@/lib/locale";

export type ConnectedAppRecord = {
  id: string;
  clientId: string;
  clientName: string | null;
  clientUri: string | null;
  clientDiscovery: string | null;
  scopes: string[];
  grantedBy: { userId: string; name: string | null; email: string | null } | null;
  createdAt: string | null;
  updatedAt: string | null;
  lastUsedAt: string | null;
};

/** Settings > Connected apps: MCP clients authorized with OAuth for the active business. */
export function LiveConnectedAppsSurface() {
  const { i18n, t } = useTranslation("settings");
  const queryClient = useQueryClient();
  const [revoking, setRevoking] = useState<ConnectedAppRecord | null>(null);
  const businesses = useQuery({ queryKey: ["businesses"], queryFn: () => requestJson<{ businesses: WorkspaceViewModel[] }>("/api/businesses") });
  const business = selectActiveBusiness(businesses.data?.businesses);
  const canManage = business ? ["business_owner", "business_admin"].includes(business.role) : false;
  const grants = useQuery({ queryKey: ["oauth-grants", business?.businessId], queryFn: () => requestJson<{ grants: ConnectedAppRecord[] }>(`/api/oauth-grants?businessId=${encodeURIComponent(business!.businessId)}`), enabled: Boolean(business?.businessId && canManage) });
  const formatDate = (value: string) => new Intl.DateTimeFormat(intlLocale(i18n.resolvedLanguage ?? i18n.language), { dateStyle: "medium" }).format(new Date(value));
  const appName = (grant: ConnectedAppRecord) => grant.clientName ?? t("connectedApps.unnamed");

  const revoke = useMutation({
    mutationFn: (grant: ConnectedAppRecord) => requestJson(`/api/oauth-grants/${encodeURIComponent(grant.id)}?businessId=${encodeURIComponent(business!.businessId)}`, { method: "DELETE" }),
    onSuccess: async () => { toast.success(t("connectedApps.revoke.done")); await queryClient.invalidateQueries({ queryKey: ["oauth-grants", business?.businessId] }); },
    onError: () => toast.error(t("connectedApps.revoke.failed")),
  });

  if (businesses.isLoading) return <Skeleton className="h-64 w-full rounded-xl" />;
  if (!canManage) return <Alert><AlertTitle>{t("connectedApps.restricted.title")}</AlertTitle><AlertDescription>{t("connectedApps.restricted.description")}</AlertDescription></Alert>;

  const rows = grants.data?.grants ?? [];
  return (
    <>
      <SectionBlock description={t("connectedApps.description")} title={t("connectedApps.title")}>
        <Surface>
          {grants.isLoading ? <div className="p-6"><Skeleton className="h-24 w-full rounded-xl" /></div> : rows.length === 0 ? (
            <p className="type-body-muted p-6 text-center">{t("connectedApps.empty")}</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="px-6">{t("connectedApps.columns.app")}</TableHead>
                    <TableHead>{t("connectedApps.columns.access")}</TableHead>
                    <TableHead>{t("connectedApps.columns.granted")}</TableHead>
                    <TableHead>{t("connectedApps.columns.lastUsed")}</TableHead>
                    <TableHead className="px-6 text-right"><span className="sr-only">{t("connectedApps.columns.actions")}</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((grant) => (
                    <TableRow key={grant.id}>
                      <TableCell className="px-6">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-medium">{appName(grant)}</span>
                          <span className="max-w-64 truncate font-mono text-xs text-muted-foreground" title={grant.clientId}>{grant.clientId}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex max-w-80 flex-wrap gap-1">{grant.scopes.map((scope) => <Badge key={scope} title={t(`connectedApps.scopes.${scope.replace(":", "_")}`)} variant="secondary">{scope}</Badge>)}</div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {grant.createdAt && (grant.grantedBy?.name || grant.grantedBy?.email)
                          ? t("connectedApps.grantedBy", { date: formatDate(grant.createdAt), name: grant.grantedBy.name || grant.grantedBy.email })
                          : grant.createdAt ? formatDate(grant.createdAt) : null}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{grant.lastUsedAt ? formatDate(grant.lastUsedAt) : t("connectedApps.neverUsed")}</TableCell>
                      <TableCell className="px-6 text-right">
                        <Button onClick={() => setRevoking(grant)} size="sm" variant="outline">{t("connectedApps.revoke.action")}</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Surface>
      </SectionBlock>

      <ConfirmActionDialog
        cancelLabel={t("connectedApps.revoke.cancel")}
        confirmLabel={t("connectedApps.revoke.confirm")}
        confirmVariant="destructive"
        description={t("connectedApps.revoke.description", { name: revoking ? appName(revoking) : "" })}
        onConfirm={async () => { if (revoking) await revoke.mutateAsync(revoking); }}
        onOpenChange={(open) => { if (!open) setRevoking(null); }}
        open={revoking !== null}
        pending={revoke.isPending}
        title={t("connectedApps.revoke.title", { name: revoking ? appName(revoking) : "" })}
      />
    </>
  );
}
