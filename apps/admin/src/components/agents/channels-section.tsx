"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AtSign, ChevronDown, Globe, Phone, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import { HiddenTextSkeleton, SectionSkeleton } from "@/components/loading-skeletons";
import { SectionBlock } from "@/components/section-block";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Skeleton } from "@/components/ui/skeleton";
import { useManagedBusiness } from "@/hooks/use-agent-settings";
import { useAgentActions, useAgents, type AgentChannelKind, type AgentListItem } from "@/hooks/use-agents";
import { instagramStatusQueryKey, useInstagramStatus } from "@/hooks/use-instagram-status";
import { agentHref } from "@/lib/agent-pages";
import type { PhoneNumberViewModel } from "@/lib/page-view-models";
import { formatPhoneNumberDisplay } from "@/lib/phone";
import { requestJson } from "@/lib/request-json";

type NumbersResponse = { phoneNumbers: PhoneNumberViewModel[]; extraNumbers?: { available: boolean } };
type WidgetKey = { id: string; agentId: string | null; label: string | null; status: "active" | "disabled" | "revoked" };
type KeysResponse = { keys: WidgetKey[]; issuanceEnabled?: boolean };

/** Numbers past these states no longer answer. */
const GONE_NUMBERS = new Set(["released", "reclaimed"]);

/** A channel the person can move or disconnect, with the name the dialogs give it. */
type Channel = { kind: AgentChannelKind; id: string; name: string };

/** A channel without an agent answers as the default agent. */
function answersAs(channelAgentId: string | null | undefined, defaultAgentId: string | undefined): string | undefined {
  return channelAgentId ?? defaultAgentId;
}

function ChannelRow({ actions, description, icon: Icon, title }: { actions?: ReactNode; description?: ReactNode; icon: LucideIcon; title: ReactNode }) {
  return (
    <Item size="sm" variant="outline">
      <ItemMedia variant="icon"><Icon className="text-muted-foreground" /></ItemMedia>
      <ItemContent>
        <ItemTitle>{title}</ItemTitle>
        {description ? <ItemDescription>{description}</ItemDescription> : null}
      </ItemContent>
      {actions ? <ItemActions className="flex-wrap justify-end">{actions}</ItemActions> : null}
    </Item>
  );
}

/** Lists the other agents; picking one asks before the channel moves. */
function MoveMenu({ channel, onPick, others }: { channel: Channel; onPick: (channel: Channel, agent: AgentListItem) => void; others: AgentListItem[] }) {
  const { t } = useTranslation("nav");
  if (!others.length) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button size="sm" type="button" variant="ghost" />}>{t("channels.moveTo")}<ChevronDown data-icon="inline-end" /></DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        <DropdownMenuGroup>
          <div className="px-2 py-1.5 type-caption text-muted-foreground">{t("channels.moveToLabel", { channel: channel.name })}</div>
          {others.map((agent) => <DropdownMenuItem key={agent.id} onClick={() => onPick(channel, agent)}>{agent.name}</DropdownMenuItem>)}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The page while the channels load: a placeholder row for each kind of channel. */
export function ChannelsSkeleton({ titles }: { titles: string[] }) {
  return (
    <div aria-busy="true" className="flex flex-col gap-8" data-testid="channels-loading">
      {titles.map((title) => (
        <SectionSkeleton key={title} title={title}>
          <Item size="sm" variant="outline">
            <ItemMedia variant="icon"><Skeleton className="size-4 rounded-full" /></ItemMedia>
            <ItemContent><Skeleton className="h-5 w-40" /></ItemContent>
            <ItemActions><HiddenTextSkeleton className="rounded-full">{title}</HiddenTextSkeleton></ItemActions>
          </Item>
        </SectionSkeleton>
      ))}
    </div>
  );
}

/**
 * Where customers reach one agent: its numbers, website widgets and the
 * workspace's Instagram account. Each can move to another agent, after the
 * person confirms, since open conversations move with it. A number can only
 * move, so releasing one stays on its own page. Widgets and Instagram can
 * also be disconnected here.
 */
export function ChannelsSection({ agentId, widgetsEnabled }: { agentId: string; widgetsEnabled: boolean }) {
  const { i18n, t } = useTranslation(["nav", "settings", "widget", "common"]);
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { businessId, canManage } = useManagedBusiness();
  const { agents, find, primary } = useAgents();
  const { move } = useAgentActions();
  const agent = find(agentId);
  const others = agents.filter((item) => item.id !== agentId);
  const isDefault = primary?.id === agentId;
  const query = `?businessId=${encodeURIComponent(businessId)}`;
  const numbers = useQuery({ queryKey: ["phone-numbers", businessId], enabled: Boolean(businessId), queryFn: () => requestJson<NumbersResponse>(`/api/phone-numbers${query}`) });
  const widgets = useQuery({ queryKey: ["widget-keys", businessId], enabled: Boolean(businessId), queryFn: () => requestJson<KeysResponse>(`/api/widget-keys${query}`) });
  const instagram = useInstagramStatus(businessId || undefined);
  const [moving, setMoving] = useState<{ channel: Channel; to: AgentListItem } | null>(null);
  const [disconnecting, setDisconnecting] = useState<Channel | null>(null);
  const handledCallback = useRef<string | null>(null);

  // Instagram's sign-in comes back here with how it went.
  useEffect(() => {
    const result = searchParams.get("instagram");
    if (!result || handledCallback.current === result) return;
    handledCallback.current = result;
    if (result === "success") { toast.success(t("settings:integrations.instagram.connectedSuccess")); void queryClient.invalidateQueries({ queryKey: ["integrations", "instagram"] }); void queryClient.invalidateQueries({ queryKey: ["agents", businessId] }); }
    else if (result === "in_use") toast.error(t("settings:integrations.instagram.accountInUse"));
    else if (result === "missing_permission") toast.error(t("settings:integrations.instagram.permissionMissing"));
    else toast.error(t("settings:integrations.instagram.connectFailed"));
  }, [businessId, queryClient, searchParams, t]);

  const disconnect = useMutation({
    mutationFn: async (channel: Channel) => {
      if (channel.kind === "instagram_account") await requestJson(`/api/integrations/instagram${query}`, { method: "DELETE" });
      else await requestJson(`/api/widget-keys${query}&id=${encodeURIComponent(channel.id)}`, { method: "PATCH", body: JSON.stringify({ status: "revoked" }) });
    },
    onSuccess: async (_, channel) => {
      await Promise.all([queryClient.invalidateQueries({ queryKey: channel.kind === "instagram_account" ? instagramStatusQueryKey(businessId) : ["widget-keys", businessId] }), queryClient.invalidateQueries({ queryKey: ["agents", businessId] })]);
      toast.success(t("nav:channels.disconnected", { channel: channel.name }));
    },
  });

  async function connectInstagram(forceLogin = false) {
    try {
      const result = await requestJson<{ url: string }>(`/api/integrations/instagram/start${query}&agentId=${encodeURIComponent(agentId)}${forceLogin ? "&switch=1" : ""}`);
      window.location.assign(result.url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("settings:integrations.instagram.connectFailed"));
    }
  }

  const loading = !agent || numbers.isPending || widgets.isPending || instagram.isPending;
  const titles = [t("nav:agentPages.phone"), t("nav:agentPages.widget"), t("common:channels.instagram")];
  if (loading) return <ChannelsSkeleton titles={widgetsEnabled ? titles : [titles[0]!, titles[2]!]} />;

  const ownerOf = (channelAgentId: string | null | undefined) => answersAs(channelAgentId, primary?.id);
  const pick = (channel: Channel, to: AgentListItem) => setMoving({ channel, to });
  const moveMenu = (channel: Channel) => canManage ? <MoveMenu channel={channel} onPick={pick} others={others} /> : null;
  const manage = (href: string) => <Button nativeButton={false} render={<Link href={href} />} size="sm" variant="outline">{t("nav:channels.manage")}</Button>;

  const liveNumbers = (numbers.data?.phoneNumbers ?? []).filter((number) => !GONE_NUMBERS.has(number.status));
  const mine = liveNumbers.filter((number) => ownerOf(number.agentId) === agentId);
  const elsewhere = liveNumbers.filter((number) => ownerOf(number.agentId) !== agentId);
  const numberName = (number: PhoneNumberViewModel) => formatPhoneNumberDisplay(number.e164, i18n.language);

  const keys = (widgets.data?.keys ?? []).filter((key) => key.status !== "revoked" && ownerOf(key.agentId) === agentId);
  const canAddWidget = widgetsEnabled && widgets.data?.issuanceEnabled !== false;
  const keyName = (key: WidgetKey) => key.label || t("settings:widget.keys.untitled");

  const account = instagram.data?.configured ? instagram.data.account : null;
  const accountOwner = account ? ownerOf(account.agentId) : undefined;
  const instagramChannel: Channel | null = account ? { kind: "instagram_account", id: account.id, name: `@${account.username ?? ""}` } : null;

  return (
    <div className="flex flex-col gap-8">
      <SectionBlock title={t("nav:agentPages.phone")}>
        <ItemGroup className="gap-2">
          {mine.map((number) => {
            const channel: Channel = { kind: "phone_number", id: number.id, name: numberName(number) };
            return <ChannelRow actions={<>{moveMenu(channel)}{manage(agentHref(agentId, "channels/phone"))}</>} icon={Phone} key={number.id} title={<span className="tabular-nums">{channel.name}</span>} />;
          })}
          {!mine.length ? (
            <ChannelRow
              actions={canManage ? <>
                {/* An agent can take a number over from another agent, or get its own: the first from the plan, then extra ones. */}
                {elsewhere.length ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger render={<Button size="sm" type="button" variant={isDefault ? "ghost" : "outline"} />}>{t("nav:channels.moveHere")}<ChevronDown data-icon="inline-end" /></DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-56">
                      <DropdownMenuGroup>
                        {elsewhere.map((number) => {
                          const from = find(ownerOf(number.agentId) ?? "");
                          return (
                            <DropdownMenuItem key={number.id} onClick={() => agent && setMoving({ channel: { kind: "phone_number", id: number.id, name: numberName(number) }, to: agent })}>
                              <span className="grid"><span className="tabular-nums">{numberName(number)}</span>{from ? <span className="type-caption text-muted-foreground">{t("nav:channels.fromAgent", { name: from.name })}</span> : null}</span>
                            </DropdownMenuItem>
                          );
                        })}
                      </DropdownMenuGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
                {!liveNumbers.length && isDefault ? <Button nativeButton={false} render={<Link href={agentHref(agentId, "channels/phone")} />} size="sm">{t("nav:channels.getNumber")}</Button> : null}
                {liveNumbers.length && numbers.data?.extraNumbers?.available ? <Button nativeButton={false} render={<Link href={agentHref(agentId, "channels/phone")} />} size="sm">{t("nav:channels.buyNumber")}</Button> : null}
              </> : null}
              icon={Phone}
              title={<span className="text-muted-foreground">{t("nav:channels.noNumber")}</span>}
            />
          ) : null}
        </ItemGroup>
      </SectionBlock>

      {widgetsEnabled ? (
        <SectionBlock title={t("nav:agentPages.widget")}>
          <ItemGroup className="gap-2">
            {keys.map((key) => {
              const channel: Channel = { kind: "widget_key", id: key.id, name: keyName(key) };
              return (
                <ChannelRow
                  actions={<>{moveMenu(channel)}{canManage ? <Button onClick={() => setDisconnecting(channel)} size="sm" type="button" variant="ghost">{t("nav:channels.disconnect")}</Button> : null}{manage(agentHref(agentId, "channels/widget"))}</>}
                  description={key.status === "disabled" ? t("nav:channels.paused") : undefined}
                  icon={Globe}
                  key={key.id}
                  title={channel.name}
                />
              );
            })}
            {!keys.length ? (
              <ChannelRow
                actions={canManage && canAddWidget ? <Button nativeButton={false} render={<Link href={`${agentHref(agentId, "channels/widget")}?add=1`} />} size="sm" variant="outline">{t("nav:channels.addToWebsite")}</Button> : null}
                icon={Globe}
                title={<span className="text-muted-foreground">{t("nav:channels.noWidget")}</span>}
              />
            ) : null}
          </ItemGroup>
        </SectionBlock>
      ) : null}

      {instagram.data?.configured ? (
        <SectionBlock title={t("common:channels.instagram")}>
          <ItemGroup className="gap-2">
            {account && instagramChannel && accountOwner === agentId ? (
              <ChannelRow
                actions={canManage ? <>
                  {moveMenu(instagramChannel)}
                  <Button onClick={() => setDisconnecting(instagramChannel)} size="sm" type="button" variant="ghost">{t("nav:channels.disconnect")}</Button>
                  {account.status !== "connected" ? <Button onClick={() => void connectInstagram(true)} size="sm" type="button">{t("settings:integrations.instagram.reconnect")}</Button> : null}
                </> : null}
                description={account.status !== "connected" ? t("settings:integrations.status.reconnectRequired") : undefined}
                icon={AtSign}
                title={instagramChannel.name}
              />
            ) : account && instagramChannel ? (
              <ChannelRow
                actions={canManage && agent ? <Button onClick={() => setMoving({ channel: instagramChannel, to: agent })} size="sm" type="button" variant="outline">{t("nav:channels.moveHere")}</Button> : null}
                description={t("nav:channels.answersAs", { name: find(accountOwner ?? "")?.name ?? "" })}
                icon={AtSign}
                title={instagramChannel.name}
              />
            ) : (
              <ChannelRow
                actions={canManage ? <Button onClick={() => void connectInstagram()} size="sm" type="button" variant="outline">{t("nav:channels.connectInstagram")}</Button> : null}
                icon={AtSign}
                title={<span className="text-muted-foreground">{t("nav:channels.noInstagram")}</span>}
              />
            )}
          </ItemGroup>
        </SectionBlock>
      ) : null}

      <ConfirmActionDialog
        cancelLabel={t("nav:agents.cancel")}
        confirmLabel={t("nav:channels.move")}
        description={t("nav:channels.moveDescription", { name: moving?.to.name ?? "" })}
        onConfirm={async () => {
          if (!moving) return;
          const { channel, to } = moving;
          try {
            await move.mutateAsync({ kind: channel.kind, id: channel.id, agentId: to.id });
            toast.success(t("nav:channels.moved", { channel: channel.name, name: to.name }));
          } catch (error) {
            toast.error(error instanceof Error ? error.message : t("nav:channels.moveFailed"));
            throw error;
          }
        }}
        onOpenChange={(open) => { if (!open) setMoving(null); }}
        open={Boolean(moving)}
        pending={move.isPending}
        title={t("nav:channels.moveTitle", { channel: moving?.channel.name ?? "", name: moving?.to.name ?? "" })}
      />
      <ConfirmActionDialog
        cancelLabel={t("nav:agents.cancel")}
        confirmLabel={t("nav:channels.disconnect")}
        confirmVariant="destructive"
        description={disconnecting?.kind === "instagram_account" ? t("nav:channels.disconnectInstagramDescription", { name: agent.name, channel: disconnecting.name }) : t("widget:manage.revokeDescription")}
        onConfirm={async () => {
          if (!disconnecting) return;
          try {
            await disconnect.mutateAsync(disconnecting);
          } catch (error) {
            toast.error(error instanceof Error ? error.message : t("nav:channels.disconnectFailed"));
            throw error;
          }
        }}
        onOpenChange={(open) => { if (!open) setDisconnecting(null); }}
        open={Boolean(disconnecting)}
        pending={disconnect.isPending}
        title={t("nav:channels.disconnectTitle", { channel: disconnecting?.name ?? "" })}
      />
    </div>
  );
}

