"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { MoreHorizontal, Plus, Star, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAgentActions, useAgents, type AgentListItem } from "@/hooks/use-agents";
import { AddAgentDialog } from "./add-agent-dialog";

/**
 * Archives an agent once the person confirms. Its channels and open
 * conversations move to the agent they pick, the default agent unless they
 * pick another.
 */
export function RemoveAgentDialog({ agent, onOpenChange, open }: { agent: AgentListItem; onOpenChange: (open: boolean) => void; open: boolean }) {
  const { t } = useTranslation("nav");
  const router = useRouter();
  const { agents, primary } = useAgents();
  const { archive } = useAgentActions();
  const others = agents.filter((item) => item.id !== agent.id);
  const [chosen, setChosen] = useState<string | null>(null);
  const destination = others.find((item) => item.id === chosen) ?? others.find((item) => item.id === primary?.id) ?? others[0];
  return (
    <ConfirmActionDialog
      cancelLabel={t("agents.cancel")}
      confirmLabel={t("agents.remove")}
      confirmVariant="destructive"
      description={others.length > 1 ? t("agents.removeDescriptionPick") : t("agents.removeDescription", { name: destination?.name ?? "" })}
      onConfirm={async () => {
        try {
          await archive.mutateAsync({ agentId: agent.id, reassignToAgentId: destination?.id });
          toast.success(t("agents.removed", { name: agent.name }));
          router.push("/agents");
        } catch (error) {
          toast.error(error instanceof Error ? error.message : t("agents.removeFailed"));
          throw error;
        }
      }}
      onOpenChange={(next) => { if (!next) setChosen(null); onOpenChange(next); }}
      open={open}
      pending={archive.isPending}
      title={t("agents.removeTitle", { name: agent.name })}
    >
      {others.length > 1 && destination ? (
        <Field>
          <FieldLabel htmlFor={`remove-${agent.id}-destination`}>{t("agents.moveTo")}</FieldLabel>
          <Select items={others.map((item) => ({ value: item.id, label: item.name }))} onValueChange={(value) => setChosen(typeof value === "string" ? value : null)} value={destination.id}>
            <SelectTrigger className="w-full" id={`remove-${agent.id}-destination`}><SelectValue /></SelectTrigger>
            <SelectContent><SelectGroup>{others.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectGroup></SelectContent>
          </Select>
        </Field>
      ) : null}
    </ConfirmActionDialog>
  );
}

/**
 * The agent header's menu: add an agent from this one, make it the default,
 * or remove it. The default agent can't be removed until another one is the
 * default.
 */
export function AgentActionsMenu({ agentId }: { agentId: string }) {
  const { t } = useTranslation("nav");
  const { find, hasChoice } = useAgents();
  const { setDefault } = useAgentActions();
  const [removing, setRemoving] = useState(false);
  const agent = find(agentId);
  if (!agent) return null;
  // With one agent, adding one is the only action, so it gets a quiet button.
  if (!hasChoice) return <AddAgentDialog copyFromAgentId={agent.id} trigger={(open) => <Button onClick={open} type="button" variant="outline"><Plus data-icon="inline-start" />{t("agents.add")}</Button>} />;
  async function makeDefault() {
    try {
      await setDefault.mutateAsync(agentId);
      toast.success(t("agents.madeDefault", { name: agent!.name }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("agents.makeDefaultFailed"));
    }
  }
  return (
    <AddAgentDialog copyFromAgentId={agent.id} trigger={(openAdd) => (
      <>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button aria-label={t("agents.moreActions", { name: agent.name })} size="icon-sm" type="button" variant="ghost" />}><MoreHorizontal /></DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-56">
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={openAdd}><Plus />{t("agents.add")}</DropdownMenuItem>
              {!agent.isDefault ? <DropdownMenuItem disabled={setDefault.isPending} onClick={() => void makeDefault()}><Star />{t("agents.makeDefault")}</DropdownMenuItem> : null}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem disabled={agent.isDefault} onClick={() => setRemoving(true)} variant="destructive">
                <Trash2 />
                <span className="grid">
                  <span>{t("agents.remove")}</span>
                  {agent.isDefault ? <span className="type-caption text-muted-foreground">{t("agents.removeDefaultHint")}</span> : null}
                </span>
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <RemoveAgentDialog agent={agent} onOpenChange={setRemoving} open={removing} />
      </>
    )} />
  );
}
