"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { useActiveBusiness } from "@/hooks/use-active-business";
import { useBusinessCan } from "@/components/business-capabilities-provider";
import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import { CredentialList, CredentialRow } from "@/components/credential-list";
import { SectionBlock } from "@/components/section-block";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Surface } from "@/components/ui/surface";
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

/**
 * When someone connected the app and who, then when it last made a request.
 * Each list words the two in its own namespace's keys.
 */
export function connectionMeta(grant: ConnectedAppRecord, t: (key: string, options: Record<string, string>) => string, formatDate: (value: string) => string, prefix: "connectedApps" | "agencyConnections"): string[] {
  const by = grant.grantedBy?.name || grant.grantedBy?.email;
  const parts: string[] = [];
  if (grant.createdAt) parts.push(by ? t(`${prefix}.connectedBy`, { date: formatDate(grant.createdAt), name: by }) : t(`${prefix}.connectedOn`, { date: formatDate(grant.createdAt) }));
  parts.push(grant.lastUsedAt ? t(`${prefix}.lastUsed`, { date: formatDate(grant.lastUsedAt) }) : t(`${prefix}.neverUsed`, {}));
  return parts;
}

/**
 * The MCP connections section at the bottom of Settings > API keys: MCP
 * clients authorized with OAuth for the active business. It shows to owners
 * and admins of a business with MCP; the API keys above it tell anyone else
 * why they can't manage either.
 */
export function LiveConnectedAppsSurface() {
  const { i18n, t } = useTranslation("settings");
  const queryClient = useQueryClient();
  const can = useBusinessCan();
  const [revoking, setRevoking] = useState<ConnectedAppRecord | null>(null);
  const { businesses, business } = useActiveBusiness();
  const canManage = business ? ["business_owner", "business_admin"].includes(business.role) && can("mcp") : false;
  const grants = useQuery({ queryKey: ["oauth-grants", business?.businessId], queryFn: () => requestJson<{ grants: ConnectedAppRecord[] }>(`/api/oauth-grants?businessId=${encodeURIComponent(business!.businessId)}`), enabled: Boolean(business?.businessId && canManage) });
  const formatDate = (value: string) => new Intl.DateTimeFormat(intlLocale(i18n.resolvedLanguage ?? i18n.language), { dateStyle: "medium" }).format(new Date(value));
  const appName = (grant: ConnectedAppRecord) => grant.clientName ?? t("connectedApps.unnamed");

  const revoke = useMutation({
    mutationFn: (grant: ConnectedAppRecord) => requestJson(`/api/oauth-grants/${encodeURIComponent(grant.id)}?businessId=${encodeURIComponent(business!.businessId)}`, { method: "DELETE" }),
    onSuccess: async () => { toast.success(t("connectedApps.revoke.done")); await queryClient.invalidateQueries({ queryKey: ["oauth-grants", business?.businessId] }); },
    onError: () => toast.error(t("connectedApps.revoke.failed")),
  });

  if (businesses.isLoading || !canManage) return null;

  const rows = grants.data?.grants ?? [];
  return (
    <>
      <SectionBlock description={t("connectedApps.description")} title={t("connectedApps.title")}>
        <Surface>
          {grants.isLoading ? <div className="p-6"><Skeleton className="h-24 w-full rounded-xl" /></div> : rows.length === 0 ? (
            <p className="type-body-muted p-6 text-center">{t("connectedApps.empty")}</p>
          ) : (
            <CredentialList label={t("connectedApps.title")}>
              {rows.map((grant) => (
                <CredentialRow
                  actions={<Button onClick={() => setRevoking(grant)} size="sm" variant="destructive">{t("connectedApps.revoke.action")}</Button>}
                  key={grant.id}
                  meta={connectionMeta(grant, t, formatDate, "connectedApps")}
                  name={appName(grant)}
                />
              ))}
            </CredentialList>
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
