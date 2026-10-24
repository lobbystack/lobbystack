"use client";

import { useEffect, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import instagramIcon from "@iconify-icons/logos/instagram-icon";
import { Icon } from "@iconify/react/offline";

import { Button } from "@/components/ui/button";
import { surfaceClassName } from "@/components/ui/surface";
import { instagramStatusQueryKey, useInstagramStatus } from "@/hooks/use-instagram-status";
import { requestJson } from "@/lib/request-json";

// The logo ships in near-black, which vanishes on the dark theme.
const instagramGlyph = { ...instagramIcon, body: instagramIcon.body.replaceAll("#0a0a08", "currentColor") };

export function InstagramIntegrationCard({ businessId, canManage }: { businessId: string | undefined; canManage: boolean }) {
  const { t } = useTranslation("settings");
  const searchParams = useSearchParams();
  const handledCallback = useRef<string | null>(null);
  const queryClient = useQueryClient();
  const queryKey = instagramStatusQueryKey(businessId);
  const status = useInstagramStatus(businessId);
  const account = status.data?.account ?? null;
  const connected = account?.status === "connected";

  useEffect(() => {
    const result = searchParams.get("instagram");
    if (!result || handledCallback.current === result) return;
    handledCallback.current = result;
    if (result === "success") { toast.success(t("integrations.instagram.connectedSuccess")); void queryClient.invalidateQueries({ queryKey: ["integrations", "instagram"] }); }
    else if (result === "in_use") toast.error(t("integrations.instagram.accountInUse"));
    else if (result === "missing_permission") toast.error(t("integrations.instagram.permissionMissing"));
    else toast.error(t("integrations.instagram.connectFailed"));
  }, [queryClient, searchParams, t]);

  const disconnect = useMutation({
    mutationFn: () => requestJson(`/api/integrations/instagram?businessId=${encodeURIComponent(businessId!)}`, { method: "DELETE" }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey }); toast.success(t("integrations.instagram.disconnectedSuccess")); },
    onError: (error) => toast.error(error.message),
  });

  async function connect() {
    if (!businessId) return;
    try {
      const result = await requestJson<{ url: string }>(`/api/integrations/instagram/start?businessId=${encodeURIComponent(businessId)}`);
      window.location.assign(result.url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("integrations.instagram.connectFailed"));
    }
  }

  // Instagram needs a Meta app on the server, so the card stays out of the way until there is one.
  if (!status.data?.configured) return null;
  return <li className={`${surfaceClassName} p-4`}>
    <div className="mb-8 flex items-center justify-between gap-3">
      <div className="flex size-10 shrink-0 items-center justify-center"><Icon aria-hidden="true" className="size-7 text-foreground" icon={instagramGlyph} id="instagram-logo" ssr /></div>
      <div className="flex items-center gap-2">
        {account ? <>
          {connected ? null : <Button disabled={!canManage} onClick={() => void connect()} size="sm" type="button" variant="outline">{t("integrations.instagram.reconnect")}</Button>}
          <Button disabled={!canManage || disconnect.isPending} onClick={() => disconnect.mutate()} size="sm" type="button" variant="outline">{t("integrations.instagram.disconnect")}</Button>
        </> : <Button disabled={!canManage} onClick={() => void connect()} size="sm" type="button" variant="outline">{t("integrations.actions.connect")}</Button>}
      </div>
    </div>
    <div className="flex flex-col gap-1">
      <h2 className="type-section-title text-lg">{t("integrations.cards.instagram.title")}</h2>
      <p className="type-body-muted line-clamp-2">{
        account ? (connected ? t("integrations.instagram.connectedAs", { username: account.username ?? "" }) : t("integrations.status.reconnectRequired"))
          : t("integrations.cards.instagram.description")
      }</p>
    </div>
  </li>;
}
