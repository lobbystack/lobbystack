"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogClose, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Field, FieldContent, FieldLabel } from "@/components/ui/field";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Surface } from "@/components/ui/surface";
import { NAVIGATION_QUERY_KEY, useNavigationSnapshot } from "@/components/navigation/navigation-provider";
import { receptionistPath } from "@/lib/navigation-routes";
import { requestJson } from "@/lib/request-json";
import { receptionistsQueryKey, useReceptionistsOverview } from "./receptionist-page";

/**
 * Deletes a receptionist. The dialog names every number and widget that moves
 * and where it goes. It isn't offered when only one receptionist is left.
 */
export function DeleteReceptionistSection({ agentId }: { agentId: string }) {
  const { t } = useTranslation("receptionists");
  const router = useRouter();
  const queryClient = useQueryClient();
  const navigation = useNavigationSnapshot();
  const overview = useReceptionistsOverview();
  const others = (navigation?.receptionists ?? []).filter((receptionist) => receptionist.id !== agentId);
  const current = navigation?.receptionists.find((receptionist) => receptionist.id === agentId);
  const [open, setOpen] = useState(false);
  const [successor, setSuccessor] = useState<string>("");
  const [pending, setPending] = useState(false);
  const selectId = useId();
  if (!navigation?.canManage || !current) return null;

  const target = successor || (others.find((receptionist) => receptionist.isDefault) ?? others[0])?.id || "";
  const targetName = others.find((receptionist) => receptionist.id === target)?.name ?? "";
  const moving = (overview.data?.routes ?? []).filter((route) => route.agentId === agentId);

  async function remove() {
    if (!navigation || !target) return;
    setPending(true);
    try {
      await requestJson(`/api/receptionists/${encodeURIComponent(agentId)}?businessId=${encodeURIComponent(navigation.businessId)}`, { method: "DELETE", body: JSON.stringify({ reassignToAgentId: target }) });
      await Promise.all([queryClient.invalidateQueries({ queryKey: NAVIGATION_QUERY_KEY }), queryClient.invalidateQueries({ queryKey: receptionistsQueryKey(navigation.businessId) })]);
      toast.success(t("delete.deleted", { name: current!.name }));
      setOpen(false);
      router.push(receptionistPath(target));
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error && error.message ? error.message : t("save.failed"));
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-heading text-sm leading-snug font-medium">{t("delete.title")}</h2>
      <Surface className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">{others.length === 0 ? t("delete.lastOne") : t("delete.hint")}</p>
        <Button disabled={others.length === 0} onClick={() => setOpen(true)} type="button" variant="destructive"><Trash2 data-icon="inline-start" />{t("delete.button", { name: current.name })}</Button>
      </Surface>
      <AlertDialog onOpenChange={(next) => { if (!pending) setOpen(next); }} open={open}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("delete.confirmTitle", { name: current.name })}</AlertDialogTitle>
            <AlertDialogDescription>{moving.length ? t("delete.moves", { count: moving.length, name: targetName }) : t("delete.nothingMoves")}</AlertDialogDescription>
          </AlertDialogHeader>
          {moving.length ? (
            <ul className="ph-mask flex list-disc flex-col gap-1 pl-5 text-sm" data-testid="delete-moves">
              {moving.map((route) => <li key={route.id}>{route.kind === "phone_number" ? route.label : route.label || t("numbers.widget")}</li>)}
            </ul>
          ) : null}
          <Field>
            <FieldContent><FieldLabel htmlFor={selectId}>{t("delete.successorLabel")}</FieldLabel></FieldContent>
            <NativeSelect id={selectId} onChange={(event) => setSuccessor(event.target.value)} value={target}>
              {others.map((receptionist) => <NativeSelectOption key={receptionist.id} value={receptionist.id}>{receptionist.name}</NativeSelectOption>)}
            </NativeSelect>
          </Field>
          <p className="text-sm text-muted-foreground">{t("delete.history")}</p>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button disabled={pending} type="button" variant="outline" />}>{t("create.cancel")}</AlertDialogClose>
            <Button disabled={pending || !target} onClick={() => void remove()} type="button" variant="destructive">
              {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
              {t("delete.confirm", { name: current.name })}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
