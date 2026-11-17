"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { billingErrorCodes } from "@lobbystack/shared";

import { useUpgradePlanDialogOpener } from "@/components/upgrade-plan-dialog-context";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useAgentActions, useAgents } from "@/hooks/use-agents";
import { agentHref } from "@/lib/agent-pages";

/**
 * Creates an agent as a copy of `copyFromAgentId`, or of the default agent,
 * and opens it. A plan with no room for another agent opens the plan picker
 * instead. Pass a `trigger` that calls `open`.
 */
export function AddAgentDialog({ copyFromAgentId, trigger }: { copyFromAgentId?: string | undefined; trigger: (open: () => void) => ReactNode }) {
  const { t } = useTranslation("nav");
  const router = useRouter();
  const openUpgrade = useUpgradePlanDialogOpener();
  const { create } = useAgentActions();
  const { find, primary } = useAgents();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const source = (copyFromAgentId ? find(copyFromAgentId) : undefined) ?? primary;

  async function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || create.isPending) return;
    try {
      const agent = await create.mutateAsync({ name: trimmed, copyFromAgentId: source?.id });
      setOpen(false);
      setName("");
      toast.success(t("agents.added", { name: agent.name }));
      router.push(agentHref(agent.id));
    } catch (error) {
      if ((error as { code?: string }).code === billingErrorCodes.agentLimitReached && openUpgrade) {
        setOpen(false);
        openUpgrade();
        return;
      }
      toast.error(error instanceof Error ? error.message : t("agents.addFailed"));
    }
  }

  return (
    <>
      {trigger(() => setOpen(true))}
      <Dialog onOpenChange={setOpen} open={open}>
        <DialogContent size="sm">
          <form className="flex flex-col gap-4" onSubmit={(event) => void submit(event)}>
            <DialogHeader>
              <DialogTitle>{t("agents.addTitle")}</DialogTitle>
              {source ? <DialogDescription>{t("agents.addDescription", { name: source.name })}</DialogDescription> : null}
            </DialogHeader>
            <Field>
              <FieldLabel htmlFor="add-agent-name">{t("agents.nameLabel")}</FieldLabel>
              <Input id="add-agent-name" maxLength={80} onChange={(event) => setName(event.target.value)} placeholder={t("agents.namePlaceholder")} value={name} />
            </Field>
            <DialogFooter>
              <Button onClick={() => setOpen(false)} type="button" variant="outline">{t("agents.cancel")}</Button>
              <Button disabled={!name.trim()} loading={create.isPending} loadingLabel={t("common:pending.adding")} type="submit">{t("agents.add")}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
