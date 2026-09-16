"use client";

import { useEffect, useMemo, useState } from "react";
import { MoreHorizontal, Trash2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import type { TeamInvitationViewModel, TeamMemberViewModel, WorkspaceViewModel } from "@/lib/page-view-models";
import { requestJson } from "@/lib/request-json";
import { selectActiveBusiness } from "@/lib/active-business";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { SectionBlock } from "@/components/section-block";
import { Skeleton } from "@/components/ui/skeleton";
import { Surface } from "@/components/ui/surface";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

type InviteRole = "viewer" | "business_admin";
type TeamRow = ({ kind: "member" } & TeamMemberViewModel) | ({ kind: "invitation" } & TeamInvitationViewModel);

function roleLabel(role: string, t: (key: string) => string): string { return ["business_admin", "business_owner", "owner"].includes(role) ? t("workspaceTeam.roles.admin") : role === "viewer" ? t("workspaceTeam.roles.viewer") : role; }

function InviteRoleOptions({ value, onChange, t }: { value: InviteRole; onChange: (role: InviteRole) => void; t: (key: string) => string }) {
  const options = [{ value: "business_admin" as const, label: "workspaceTeam.roles.admin", description: "workspaceTeam.invite.roles.adminDescription" }, { value: "viewer" as const, label: "workspaceTeam.roles.viewer", description: "workspaceTeam.invite.roles.viewerDescription" }];
  return <div className="flex flex-col gap-3" role="radiogroup">{options.map((option) => { const selected = value === option.value; return <button aria-checked={selected} className="flex w-full items-start gap-3 py-1 text-left" key={option.value} onClick={() => onChange(option.value)} role="radio" type="button"><span className={cn("mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border", selected ? "border-foreground" : "border-muted-foreground")}>{selected ? <span className="size-2 rounded-full bg-foreground" /> : null}</span><span className="flex min-w-0 flex-col gap-1"><span className="text-sm font-medium">{t(option.label)}</span><span className="text-sm leading-6 text-muted-foreground">{t(option.description)}</span></span></button>; })}</div>;
}

export function LiveTeamSurface() {
  const { i18n, t } = useTranslation("settings");
  const queryClient = useQueryClient();
  const [businessDialog, setBusinessDialog] = useState(false);
  const [inviteDialog, setInviteDialog] = useState(false);
  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InviteRole>("viewer");
  const businesses = useQuery({ queryKey: ["businesses"], queryFn: () => requestJson<{ businesses: WorkspaceViewModel[] }>("/api/businesses") });
  const business = selectActiveBusiness(businesses.data?.businesses);
  const canManage = business ? ["business_owner", "business_admin"].includes(business.role) : false;
  const team = useQuery({ queryKey: ["team", business?.businessId], queryFn: () => requestJson<{ members: TeamMemberViewModel[]; invitations: TeamInvitationViewModel[] }>(`/api/team?businessId=${encodeURIComponent(business!.businessId)}`), enabled: Boolean(business?.businessId) });
  useEffect(() => { if (business?.name) setBusinessName(business.name); }, [business?.name]);
  const rows = useMemo<TeamRow[]>(() => [...(team.data?.members ?? []).map((member) => ({ kind: "member" as const, ...member })), ...(team.data?.invitations ?? []).filter((invitation) => invitation.status === "pending").map((invitation) => ({ kind: "invitation" as const, ...invitation }))], [team.data]);
  const invalidate = async () => { await queryClient.invalidateQueries({ queryKey: ["team", business?.businessId] }); };
  const saveBusiness = useMutation({ mutationFn: () => requestJson(`/api/businesses?businessId=${encodeURIComponent(business!.businessId)}`, { method: "PATCH", body: JSON.stringify({ name: businessName }) }), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["businesses"] }); setBusinessDialog(false); } });
  const invite = useMutation({ mutationFn: () => requestJson("/api/team", { method: "POST", body: JSON.stringify({ businessId: business!.businessId, email: email.trim().toLowerCase(), role }) }), onSuccess: async () => { await invalidate(); setEmail(""); setInviteDialog(false); toast.success(t("workspaceTeam.invite.sent", { email })); }, onError: () => toast.error(t("workspaceTeam.invite.errors.failed")) });
  const remove = useMutation({ mutationFn: (input: { membershipId?: string; invitationId?: string }) => requestJson(`/api/team?businessId=${encodeURIComponent(business!.businessId)}`, { method: "DELETE", body: JSON.stringify(input) }), onSuccess: invalidate, onError: () => toast.error(t("workspaceTeam.members.removeFailed")) });

  return <div className="flex flex-1 flex-col"><div className="w-full"><ItemGroup spacing="section"><Item variant="outline"><ItemContent><ItemTitle>{t("account.businessName.label")}</ItemTitle><ItemDescription>{t("account.businessName.description")}</ItemDescription>{businesses.isLoading ? <Skeleton className="h-6 w-48" /> : <p className="text-[15px] leading-6">{business?.name}</p>}</ItemContent>{canManage ? <ItemActions><Dialog onOpenChange={setBusinessDialog} open={businessDialog}><DialogTrigger render={<Button size="sm" variant="outline" />}>{t("account.actions.change")}</DialogTrigger><DialogContent><DialogHeader><DialogTitle>{t("account.businessName.label")}</DialogTitle><DialogDescription>{t("account.businessName.description")}</DialogDescription></DialogHeader><FieldGroup><Field><FieldLabel htmlFor="business-name">{t("account.businessName.label")}</FieldLabel><Input id="business-name" onChange={(event) => setBusinessName(event.target.value)} value={businessName} /></Field></FieldGroup><DialogFooter><Button disabled={saveBusiness.isPending} onClick={() => saveBusiness.mutate()}>{saveBusiness.isPending ? t("account.businessName.saving") : t("account.businessName.save")}</Button></DialogFooter></DialogContent></Dialog></ItemActions> : null}</Item>
    <SectionBlock action={canManage ? <Dialog onOpenChange={setInviteDialog} open={inviteDialog}><DialogTrigger render={<Button disabled={team.isLoading} size="sm" />}>{t("workspaceTeam.invite.action")}</DialogTrigger><DialogContent><DialogHeader><DialogTitle>{t("workspaceTeam.invite.title")}</DialogTitle><DialogDescription>{t("workspaceTeam.invite.description")}</DialogDescription></DialogHeader><FieldGroup><Field><FieldLabel htmlFor="invite-email">{t("workspaceTeam.invite.emailLabel")}</FieldLabel><Input id="invite-email" onChange={(event) => setEmail(event.target.value)} placeholder={t("workspaceTeam.invite.emailPlaceholder")} type="email" value={email} /></Field><Field><FieldLabel>{t("workspaceTeam.invite.roleLabel")}</FieldLabel><InviteRoleOptions onChange={setRole} t={t} value={role} /></Field></FieldGroup><DialogFooter><Button disabled={invite.isPending || !email.trim()} onClick={() => invite.mutate()}>{invite.isPending ? t("workspaceTeam.invite.sending") : t("workspaceTeam.invite.submit")}</Button></DialogFooter></DialogContent></Dialog> : undefined} title={t("workspaceTeam.members.title")}><Surface className="overflow-hidden p-0">{team.isLoading ? <div className="space-y-4 p-6"><Skeleton className="h-5 w-40" /><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div> : <Table><TableHeader><TableRow className="hover:bg-transparent"><TableHead className="h-12 px-6 text-sm font-medium text-foreground">{t("workspaceTeam.members.table.email")}</TableHead><TableHead className="h-12 px-6 text-sm font-medium text-foreground">{t("workspaceTeam.members.table.role")}</TableHead>{canManage ? <TableHead className="w-12 px-6" /> : null}</TableRow></TableHeader><TableBody>{rows.length === 0 ? <TableRow><TableCell className="px-6 py-8 text-muted-foreground" colSpan={canManage ? 3 : 2}>{t("workspaceTeam.members.empty")}</TableCell></TableRow> : rows.map((row) => { const date = new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium" }).format(new Date(row.kind === "member" ? row.joinedAt : row.invitedAt)); const canRemove = row.kind === "invitation" || !["business_owner", "owner"].includes(row.role); return <TableRow className="hover:bg-transparent" key={row.kind === "member" ? row.membershipId : row.invitationId}><TableCell className="px-6 py-5"><div className="space-y-1"><p className="text-sm">{row.email ?? t("workspaceTeam.members.noEmail")}</p><div className="flex items-center gap-2"><p className="text-sm text-muted-foreground">{t(row.kind === "member" ? "workspaceTeam.members.joinedOn" : "workspaceTeam.members.invitedOn", { date })}</p>{row.kind === "invitation" ? <Badge className="border-amber-200 bg-amber-100 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/20 dark:text-amber-200" variant="outline">{t("workspaceTeam.members.status.pending")}</Badge> : null}</div></div></TableCell><TableCell className="px-6 py-5"><Badge variant="secondary">{roleLabel(row.role, t)}</Badge></TableCell>{canManage ? <TableCell className="px-6 py-5">{canRemove ? <DropdownMenu><DropdownMenuTrigger render={<Button aria-label={t("workspaceTeam.members.actions.moreOptions")} disabled={remove.isPending} size="icon-sm" variant="ghost"><MoreHorizontal /></Button>} /><DropdownMenuContent align="end">{row.kind === "invitation" ? <DropdownMenuItem onClick={() => remove.mutate({ invitationId: row.invitationId })} variant="destructive"><Trash2 />{t("workspaceTeam.members.actions.cancelInvite")}</DropdownMenuItem> : <DropdownMenuItem onClick={() => remove.mutate({ membershipId: row.membershipId })}>{t("workspaceTeam.members.actions.remove")}</DropdownMenuItem>}</DropdownMenuContent></DropdownMenu> : null}</TableCell> : null}</TableRow>; })}</TableBody></Table>}</Surface></SectionBlock></ItemGroup></div></div>;
}
