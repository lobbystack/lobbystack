"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import instagramIcon from "@iconify-icons/logos/instagram-icon";
import { Icon } from "@iconify/react/offline";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { surfaceClassName } from "@/components/ui/surface";
import { instagramStatusQueryKey, useInstagramStatus } from "@/hooks/use-instagram-status";
import { requestJson } from "@/lib/request-json";

// The logo ships in near-black, which vanishes on the dark theme.
const instagramGlyph = { ...instagramIcon, body: instagramIcon.body.replaceAll("#0a0a08", "currentColor") };

function InstagramLogo() {
  return <Icon aria-hidden="true" className="size-7 text-foreground" icon={instagramGlyph} id="instagram-logo" ssr />;
}

export function InstagramIntegrationCard({ businessId, canManage }: { businessId: string | undefined; canManage: boolean }) {
  const { t } = useTranslation("settings");
  const searchParams = useSearchParams();
  const handledCallback = useRef<string | null>(null);
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const queryKey = instagramStatusQueryKey(businessId);
  const status = useInstagramStatus(businessId);
  const account = status.data?.account ?? null;
  const connected = account?.status === "connected";

  useEffect(() => {
    const result = searchParams.get("instagram");
    if (!result || handledCallback.current === result) return;
    handledCallback.current = result;
    if (result === "success") { toast.success(t("integrations.instagram.connectedSuccess")); void queryClient.invalidateQueries({ queryKey: ["integrations", "instagram"] }); setDialogOpen(true); }
    else if (result === "in_use") toast.error(t("integrations.instagram.accountInUse"));
    else if (result === "missing_permission") toast.error(t("integrations.instagram.permissionMissing"));
    else toast.error(t("integrations.instagram.connectFailed"));
  }, [queryClient, searchParams, t]);

  const disconnect = useMutation({
    mutationFn: () => requestJson(`/api/integrations/instagram?businessId=${encodeURIComponent(businessId!)}`, { method: "DELETE" }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey }); setDialogOpen(false); toast.success(t("integrations.instagram.disconnectedSuccess")); },
    onError: (error) => toast.error(error.message),
  });

  async function connect(options: { forceLogin?: boolean } = {}) {
    if (!businessId) return;
    try {
      const result = await requestJson<{ url: string }>(`/api/integrations/instagram/start?businessId=${encodeURIComponent(businessId)}${options.forceLogin ? "&switch=1" : ""}`);
      window.location.assign(result.url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("integrations.instagram.connectFailed"));
    }
  }

  // Instagram needs a Meta app on the server, so the card stays out of the way until there is one.
  if (!status.data?.configured) return null;
  return <li className={`${surfaceClassName} p-4`}>
    <div className="mb-8 flex items-center justify-between gap-3">
      <div className="flex size-10 shrink-0 items-center justify-center"><InstagramLogo /></div>
      <div className="flex items-center gap-2">
        <Button className={connected ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800/60 dark:bg-emerald-950/30 dark:text-emerald-300" : undefined} disabled={!canManage} onClick={() => account ? setDialogOpen(true) : void connect()} size="sm" type="button" variant="outline">
          {connected ? t("integrations.actions.connected") : account ? t("integrations.instagram.reconnect") : t("integrations.actions.connect")}
        </Button>
      </div>
    </div>
    <div className="flex flex-col gap-1">
      <h2 className="type-section-title text-lg">{t("integrations.cards.instagram.title")}</h2>
      <p className="type-body-muted line-clamp-2">{
        account ? (connected ? t("integrations.instagram.connectedAs", { username: account.username ?? "" }) : t("integrations.status.reconnectRequired"))
          : t("integrations.cards.instagram.description")
      }</p>
    </div>
    <Dialog onOpenChange={setDialogOpen} open={dialogOpen && Boolean(account)}><DialogContent className="w-full gap-0 p-0 sm:max-w-md">
      <DialogHeader className="flex-row items-center gap-3 p-6 pb-4"><InstagramLogo /><div className="flex flex-col gap-1"><DialogTitle>{t("integrations.cards.instagram.title")}</DialogTitle><DialogDescription>{t("integrations.instagram.dialogDescription")}</DialogDescription></div></DialogHeader>
      <div className="flex flex-col gap-4 px-6 pb-6">
        {account && !connected ? <Alert variant="destructive"><AlertTitle>{t("integrations.status.reconnectRequired")}</AlertTitle><AlertDescription>{t("integrations.instagram.reconnectDescription")}</AlertDescription></Alert> : null}
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium">{t("integrations.instagram.accountLabel")}</span>
          <span className="type-body-muted">@{account?.username ?? ""}</span>
        </div>
      </div>
      <DialogFooter className="m-0 rounded-b-xl border-t px-6 py-4">
        <Button className="w-full sm:w-auto" disabled={!canManage || disconnect.isPending} onClick={() => disconnect.mutate()} size="sm" type="button" variant="destructive"><Trash2 data-icon="inline-start" />{t("integrations.instagram.disconnect")}</Button>
        {/* Instagram shows its login again, so this also switches to a different account. */}
        <Button className="w-full sm:w-auto" disabled={!canManage} onClick={() => void connect({ forceLogin: true })} size="sm" type="button" variant={connected ? "outline" : "default"}>{t("integrations.instagram.reconnect")}</Button>
      </DialogFooter>
    </DialogContent></Dialog>
  </li>;
}
