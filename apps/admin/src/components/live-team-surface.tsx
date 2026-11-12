"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Trash2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trans, useTranslation } from "react-i18next";
import { toast } from "sonner";

import { useActiveBusiness } from "@/hooks/use-active-business";
import type { TeamInvitationViewModel, TeamMemberViewModel } from "@/lib/page-view-models";
import { requestJson } from "@/lib/request-json";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { SectionBlock } from "@/components/section-block";
import { SectionSkeleton, SmallButtonSkeleton } from "@/components/loading-skeletons";
import { Skeleton } from "@/components/ui/skeleton";
import { Surface } from "@/components/ui/surface";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { intlLocale } from "@/lib/locale";
import { Status } from "@/components/ui/status";
import { INVITATION_STATUS_VARIANTS } from "@/lib/status-variants";

type InviteRole = "viewer" | "business_admin";
type TeamRow = ({ kind: "member" } & TeamMemberViewModel) | ({ kind: "invitation" } & TeamInvitationViewModel);

function roleLabel(role: string, t: (key: string) => string): string { return ["business_admin", "business_owner", "owner"].includes(role) ? t("workspaceTeam.roles.admin") : role === "viewer" ? t("workspaceTeam.roles.viewer") : role; }

function InviteRoleOptions({ value, onChange, t }: { value: InviteRole; onChange: (role: InviteRole) => void; t: (key: string) => string }) {
  const options = [{ value: "business_admin" as const, label: "workspaceTeam.roles.admin", description: "workspaceTeam.invite.roles.adminDescription" }, { value: "viewer" as const, label: "workspaceTeam.roles.viewer", description: "workspaceTeam.invite.roles.viewerDescription" }];
  return <div className="flex flex-col gap-3" role="radiogroup">{options.map((option) => { const selected = value === option.value; return <button aria-checked={selected} className="flex w-full items-start gap-3 py-1 text-left" key={option.value} onClick={() => onChange(option.value)} role="radio" type="button"><span className={cn("mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border", selected ? "border-foreground" : "border-muted-foreground")}>{selected ? <span className="size-2 rounded-full bg-foreground" /> : null}</span><span className="flex min-w-0 flex-col gap-1"><span className="type-title">{t(option.label)}</span><span className="type-body-muted">{t(option.description)}</span></span></button>; })}</div>;
}

export function LiveTeamSurface() {
  const { i18n, t } = useTranslation("settings");
  const queryClient = useQueryClient();
  const router = useRouter();
  const [businessDialog, setBusinessDialog] = useState(false);
  const [inviteDialog, setInviteDialog] = useState(false);
  const [businessName, setBusinessName] = useState("");
  const [businessSubmitted, setBusinessSubmitted] = useState(false);
  const [inviteSubmitted, setInviteSubmitted] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InviteRole>("viewer");
  const { businesses, business } = useActiveBusiness();
  const canManage = business ? ["business_owner", "business_admin"].includes(business.role) : false;
  // A partner's business is the partner's to delete.
  const canDelete = business?.role === "business_owner" && !business.partnerAccessLevel && business.via !== "partner";
  const [deleteDialog, setDeleteDialog] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const team = useQuery({ queryKey: ["team", business?.businessId], queryFn: () => requestJson<{ members: TeamMemberViewModel[]; invitations: TeamInvitationViewModel[] }>(`/api/team?businessId=${encodeURIComponent(business!.businessId)}`), enabled: Boolean(business?.businessId) });
  useEffect(() => { if (business?.name) setBusinessName(business.name); }, [business?.name]);
  const rows = useMemo<TeamRow[]>(() => [...(team.data?.members ?? []).map((member) => ({ kind: "member" as const, ...member })), ...(team.data?.invitations ?? []).filter((invitation) => invitation.status === "pending").map((invitation) => ({ kind: "invitation" as const, ...invitation }))], [team.data]);
  const invalidate = async () => { await queryClient.invalidateQueries({ queryKey: ["team", business?.businessId] }); };
  const saveBusiness = useMutation({ mutationFn: () => requestJson(`/api/businesses?businessId=${encodeURIComponent(business!.businessId)}`, { method: "PATCH", body: JSON.stringify({ name: businessName }) }), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["businesses"] }); setBusinessDialog(false); } });
  const inviteEmailError = inviteSubmitted && !email.trim() ? t("workspaceTeam.invite.emailRequired") : null;
  const businessNameError = businessSubmitted && !businessName.trim() ? t("account.businessName.required") : null;
  const invite = useMutation({ mutationFn: () => requestJson("/api/team", { method: "POST", body: JSON.stringify({ businessId: business!.businessId, email: email.trim().toLowerCase(), role }) }), onSuccess: async () => { await invalidate(); setEmail(""); setInviteDialog(false); toast.success(t("workspaceTeam.invite.sent", { email })); }, onError: (cause: Error & { code?: string }) => toast.error(cause.code === "partner_member_not_on_team" ? t("workspaceTeam.invite.errors.partnerMember", { email: email.trim() }) : t("workspaceTeam.invite.errors.failed")) });
  const deleteBusiness = useMutation({
    mutationFn: () => requestJson(`/api/businesses?businessId=${encodeURIComponent(business!.businessId)}`, { method: "DELETE", body: JSON.stringify({ confirmName }) }),
    // The business is gone: reload the list, where the server's next business is active, then let the home page send them there, or to onboarding when there is none.
    onSuccess: async () => { setDeleteDialog(false); await queryClient.invalidateQueries({ queryKey: ["businesses"] }); router.replace("/"); },
    onError: (cause: Error & { code?: string }) => toast.error(cause.code === "business_number_in_progress" ? t("workspaceTeam.delete.errors.numberInProgress") : cause.code === "billing_unconfigured" ? t("workspaceTeam.delete.errors.billing") : t("workspaceTeam.delete.errors.failed")),
  });
  const remove = useMutation({ mutationFn: (input: { membershipId?: string; invitationId?: string }) => requestJson(`/api/team?businessId=${encodeURIComponent(business!.businessId)}`, { method: "DELETE", body: JSON.stringify(input) }), onSuccess: invalidate, onError: () => toast.error(t("workspaceTeam.members.removeFailed")) });

  // Whether you can rename the business, invite people or delete it depends on your role, so every control waits with the data.
  if (businesses.isLoading || team.isLoading) return <TeamSkeleton t={t} />;

  return <div className="flex flex-1 flex-col"><div className="w-full"><ItemGroup spacing="section"><Item variant="outline"><ItemContent><ItemTitle>{t("account.businessName.label")}</ItemTitle><ItemDescription>{t("account.businessName.description")}</ItemDescription><p className="type-body">{business?.name}</p></ItemContent>{canManage ? <ItemActions><Dialog onOpenChange={(open) => { setBusinessDialog(open); if (!open) { setBusinessSubmitted(false); setBusinessName(business?.name ?? ""); } }} open={businessDialog}><DialogTrigger render={<Button size="sm" variant="outline" />}>{t("account.actions.change")}</DialogTrigger><DialogContent size="sm"><form className="flex flex-col gap-6" noValidate onSubmit={(event) => { event.preventDefault(); setBusinessSubmitted(true); if (!saveBusiness.isPending && businessName.trim()) saveBusiness.mutate(); }}><DialogHeader><DialogTitle>{t("account.businessName.label")}</DialogTitle><DialogDescription>{t("account.businessName.description")}</DialogDescription></DialogHeader><FieldGroup><Field data-invalid={businessNameError ? true : undefined}><FieldLabel htmlFor="business-name">{t("account.businessName.label")}</FieldLabel><Input aria-describedby={businessNameError ? "business-name-error" : undefined} aria-invalid={businessNameError ? true : undefined} id="business-name" maxLength={200} onChange={(event) => setBusinessName(event.target.value)} placeholder={t("account.businessName.placeholder")} value={businessName} />{businessNameError ? <FieldError id="business-name-error">{businessNameError}</FieldError> : null}</Field></FieldGroup><DialogFooter><DialogClose render={<Button disabled={saveBusiness.isPending} type="button" variant="outline" />}>{t("account.actions.cancel")}</DialogClose><Button loading={saveBusiness.isPending} loadingLabel={t("account.businessName.saving")} type="submit">{t("account.businessName.save")}</Button></DialogFooter></form></DialogContent></Dialog></ItemActions> : null}</Item>
    <SectionBlock action={canManage ? <Dialog onOpenChange={(open) => { setInviteDialog(open); setInviteSubmitted(false); }} open={inviteDialog}><DialogTrigger render={<Button size="sm" />}>{t("workspaceTeam.invite.action")}</DialogTrigger><DialogContent size="sm"><form className="flex flex-col gap-6" noValidate onSubmit={(event) => { event.preventDefault(); setInviteSubmitted(true); if (!invite.isPending && email.trim()) invite.mutate(); }}><DialogHeader><DialogTitle>{t("workspaceTeam.invite.title")}</DialogTitle><DialogDescription>{t("workspaceTeam.invite.description")}</DialogDescription></DialogHeader><FieldGroup><Field data-invalid={inviteEmailError ? true : undefined}><FieldLabel htmlFor="invite-email">{t("workspaceTeam.invite.emailLabel")}</FieldLabel><Input aria-describedby={inviteEmailError ? "invite-email-error" : undefined} aria-invalid={inviteEmailError ? true : undefined} id="invite-email" onChange={(event) => setEmail(event.target.value)} placeholder={t("workspaceTeam.invite.emailPlaceholder")} type="email" value={email} />{inviteEmailError ? <FieldError id="invite-email-error">{inviteEmailError}</FieldError> : null}</Field><Field><FieldLabel>{t("workspaceTeam.invite.roleLabel")}</FieldLabel><InviteRoleOptions onChange={setRole} t={t} value={role} /></Field></FieldGroup><DialogFooter><DialogClose render={<Button disabled={invite.isPending} type="button" variant="outline" />}>{t("workspaceTeam.invite.cancel")}</DialogClose><Button loading={invite.isPending} loadingLabel={t("workspaceTeam.invite.sending")} type="submit">{t("workspaceTeam.invite.submit")}</Button></DialogFooter></form></DialogContent></Dialog> : undefined} title={t("workspaceTeam.members.title")}><Surface className="overflow-hidden p-0"><Table><TableHeader><TableRow><TableHead>{t("workspaceTeam.members.table.email")}</TableHead><TableHead>{t("workspaceTeam.members.table.role")}</TableHead>{canManage ? <TableHead className="w-16" /> : null}</TableRow></TableHeader><TableBody>{rows.length === 0 ? <TableRow><TableCell className="text-muted-foreground" colSpan={canManage ? 3 : 2}>{t("workspaceTeam.members.empty")}</TableCell></TableRow> : rows.map((row) => { const date = new Intl.DateTimeFormat(intlLocale(i18n.language), { dateStyle: "medium" }).format(new Date(row.kind === "member" ? row.joinedAt : row.invitedAt)); const canRemove = row.kind === "invitation" || !["business_owner", "owner"].includes(row.role); return <TableRow key={row.kind === "member" ? row.membershipId : row.invitationId}><TableCell><div className="space-y-1"><p className="type-body">{row.email ?? t("workspaceTeam.members.noEmail")}</p><div className="flex items-center gap-2"><p className="type-body-muted">{t(row.kind === "member" ? "workspaceTeam.members.joinedOn" : "workspaceTeam.members.invitedOn", { date })}</p>{row.kind === "invitation" ? <Status variant={INVITATION_STATUS_VARIANTS.pending}>{t("workspaceTeam.members.status.pending")}</Status> : null}{row.kind === "invitation" && row.transfersOwnership ? <Status variant={INVITATION_STATUS_VARIANTS.handover}>{t("workspaceTeam.members.status.handover")}</Status> : null}</div></div></TableCell><TableCell><Badge variant="secondary">{roleLabel(row.role, t)}</Badge></TableCell>{canManage ? <TableCell>{canRemove ? <DropdownMenu><DropdownMenuTrigger render={<Button aria-label={t("workspaceTeam.members.actions.moreOptions")} disabled={remove.isPending} size="icon-sm" variant="ghost"><MoreHorizontal /></Button>} /><DropdownMenuContent align="end">{row.kind === "invitation" ? <DropdownMenuItem onClick={() => remove.mutate({ invitationId: row.invitationId })} variant="destructive"><Trash2 />{t("workspaceTeam.members.actions.cancelInvite")}</DropdownMenuItem> : <DropdownMenuItem onClick={() => remove.mutate({ membershipId: row.membershipId })} variant="destructive"><Trash2 />{t("workspaceTeam.members.actions.remove")}</DropdownMenuItem>}</DropdownMenuContent></DropdownMenu> : null}</TableCell> : null}</TableRow>; })}</TableBody></Table></Surface></SectionBlock>{canDelete ? <Item variant="outline"><ItemContent><ItemTitle>{t("workspaceTeam.delete.title")}</ItemTitle><ItemDescription>{t("workspaceTeam.delete.description")}</ItemDescription></ItemContent><ItemActions><Dialog onOpenChange={(open) => { setDeleteDialog(open); if (!open) setConfirmName(""); }} open={deleteDialog}><DialogTrigger render={<Button size="sm" variant="destructive" />}>{t("workspaceTeam.delete.action")}</DialogTrigger><DialogContent size="sm"><form className="flex flex-col gap-6" onSubmit={(event) => { event.preventDefault(); if (!deleteBusiness.isPending && confirmName.trim() === business?.name.trim()) deleteBusiness.mutate(); }}><DialogHeader><DialogTitle>{t("workspaceTeam.delete.dialogTitle", { name: business?.name })}</DialogTitle><DialogDescription>{t("workspaceTeam.delete.dialogDescription")}</DialogDescription></DialogHeader><FieldGroup><Field><FieldLabel htmlFor="delete-business-name"><Trans components={{ name: <code className="rounded-md bg-muted px-1.5 py-0.5 type-technical-value" /> }} i18nKey="workspaceTeam.delete.confirmLabel" ns="settings" t={t} values={{ name: business?.name }} /></FieldLabel><Input autoComplete="off" id="delete-business-name" onChange={(event) => setConfirmName(event.target.value)} value={confirmName} /></Field></FieldGroup><DialogFooter><DialogClose render={<Button disabled={deleteBusiness.isPending} type="button" variant="outline" />}>{t("workspaceTeam.delete.cancel")}</DialogClose><Button disabled={confirmName.trim() !== business?.name.trim()} loading={deleteBusiness.isPending} loadingLabel={t("workspaceTeam.delete.deleting")} type="submit" variant="destructive">{t("workspaceTeam.delete.submit")}</Button></DialogFooter></form></DialogContent></Dialog></ItemActions></Item> : null}</ItemGroup></div></div>;
}

/** The business name, the members table and the delete card, each holding its real text, hidden, so the page is as wide and tall as the real one. */
function TeamSkeleton({ t }: { t: (key: string) => string }) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="w-full">
        <ItemGroup spacing="section">
          <Item variant="outline">
            <ItemContent>
              <ItemTitle aria-hidden="true"><Skeleton className="w-fit"><span className="invisible">{t("account.businessName.label")}</span></Skeleton></ItemTitle>
              <div aria-hidden="true" className="type-body"><Skeleton className="w-fit max-w-full"><span className="invisible">{t("account.businessName.description")}</span></Skeleton></div>
              <Skeleton className="h-6 w-48" />
            </ItemContent>
            <ItemActions><SmallButtonSkeleton label={t("account.actions.change")} /></ItemActions>
          </Item>
          <SectionSkeleton action={<SmallButtonSkeleton label={t("workspaceTeam.invite.action")} />} title={t("workspaceTeam.members.title")}>
            <Surface className="overflow-hidden p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("workspaceTeam.members.table.email")}</TableHead>
                    <TableHead>{t("workspaceTeam.members.table.role")}</TableHead>
                    <TableHead className="w-16" />
                  </TableRow>
                </TableHeader>
                <TableBody aria-busy="true">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <TableRow key={index}>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <div className="flex h-5 items-center"><Skeleton className="h-4 w-44" /></div>
                          <div className="flex h-5 items-center"><Skeleton className="h-4 w-32" /></div>
                        </div>
                      </TableCell>
                      <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                      <TableCell><Skeleton className="size-8" /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Surface>
          </SectionSkeleton>
          <Item variant="outline">
            <ItemContent>
              <ItemTitle aria-hidden="true"><Skeleton className="w-fit"><span className="invisible">{t("workspaceTeam.delete.title")}</span></Skeleton></ItemTitle>
              <div aria-hidden="true" className="type-body"><Skeleton className="w-fit max-w-full"><span className="invisible">{t("workspaceTeam.delete.description")}</span></Skeleton></div>
            </ItemContent>
            <ItemActions><SmallButtonSkeleton label={t("workspaceTeam.delete.action")} /></ItemActions>
          </Item>
        </ItemGroup>
      </div>
    </div>
  );
}
