"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import { CredentialList, CredentialRow } from "@/components/credential-list";
import { connectionMeta, type ConnectedAppRecord } from "@/components/live-connected-apps-surface";
import { useConsolePartner } from "@/components/partner-shell";
import { SectionBlock } from "@/components/section-block";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Surface } from "@/components/ui/surface";
import { intlLocale } from "@/lib/locale";
import { requestJson } from "@/lib/request-json";

/**
 * The console's MCP connections, under its API keys: MCP clients such as Claude or Cursor
 * that someone on the team connected to the partner with OAuth (ADR 0011).
 * Owners and admins see and disconnect every one; anyone else sees and
 * disconnects their own. The server enforces the same.
 */
export function PartnerAgencyConnectionsSurface() {
  const { i18n, t } = useTranslation("partner");
  const partner = useConsolePartner();
  const partnerId = encodeURIComponent(partner.partnerId);
  const queryClient = useQueryClient();
  const [revoking, setRevoking] = useState<ConnectedAppRecord | null>(null);
  const queryKey = ["partner-oauth-grants", partner.partnerId];
  const grants = useQuery({ queryKey, queryFn: () => requestJson<{ grants: ConnectedAppRecord[] }>(`/api/partner/oauth-grants?partnerId=${partnerId}`) });
  const formatDate = (value: string) => new Intl.DateTimeFormat(intlLocale(i18n.resolvedLanguage ?? i18n.language), { dateStyle: "medium" }).format(new Date(value));
  const appName = (grant: ConnectedAppRecord) => grant.clientName ?? t("agencyConnections.unnamed");
  const manager = partner.role === "owner" || partner.role === "admin";

  const revoke = useMutation({
    mutationFn: (grant: ConnectedAppRecord) => requestJson(`/api/partner/oauth-grants/${encodeURIComponent(grant.id)}?partnerId=${partnerId}`, { method: "DELETE" }),
    onSuccess: async () => { toast.success(t("agencyConnections.revoke.done")); await queryClient.invalidateQueries({ queryKey }); },
    onError: () => toast.error(t("agencyConnections.revoke.failed")),
  });

  const rows = grants.data?.grants ?? [];
  return (
    <>
      <SectionBlock description={manager ? t("agencyConnections.description") : t("agencyConnections.descriptionOwn")} title={t("agencyConnections.title")}>
        <Surface>
          {grants.isLoading ? <div className="p-6"><Skeleton className="h-24 w-full rounded-xl" /></div> : rows.length === 0 ? (
            <p className="type-body-muted p-6 text-center">{t("agencyConnections.empty")}</p>
          ) : (
            <CredentialList label={t("agencyConnections.title")}>
              {rows.map((grant) => (
                <CredentialRow
                  actions={<Button onClick={() => setRevoking(grant)} size="sm" variant="destructive">{t("agencyConnections.revoke.action")}</Button>}
                  key={grant.id}
                  meta={connectionMeta(grant, t, formatDate, "agencyConnections")}
                  name={appName(grant)}
                />
              ))}
            </CredentialList>
          )}
        </Surface>
      </SectionBlock>

      <ConfirmActionDialog
        cancelLabel={t("agencyConnections.revoke.cancel")}
        confirmLabel={t("agencyConnections.revoke.confirm")}
        confirmVariant="destructive"
        description={t("agencyConnections.revoke.description", { name: revoking ? appName(revoking) : "" })}
        onConfirm={async () => { if (revoking) await revoke.mutateAsync(revoking); }}
        onOpenChange={(open) => { if (!open) setRevoking(null); }}
        open={revoking !== null}
        pending={revoke.isPending}
        title={t("agencyConnections.revoke.title", { name: revoking ? appName(revoking) : "" })}
      />
    </>
  );
}
