"use client";

import { useId, useMemo, useState } from "react";
import { MoreHorizontal, ShieldCheck, Trash2, UserRound } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import type { PartnerRole } from "@lobbystack/shared";
import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import { PageHeader } from "@/components/page-header";
import { useConsolePartner } from "@/components/partner-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Surface } from "@/components/ui/surface";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { intlLocale } from "@/lib/locale";
import { requestJson } from "@/lib/request-json";
import { cn } from "@/lib/utils";

type Team = {
  role: PartnerRole;
  members: Array<{ memberId: string; name: string | null; email: string; role: PartnerRole; joinedAt: string }>;
  invitations: Array<{ invitationId: string; email: string; role: PartnerRole; expiresAt: string; invitedAt: string }>;
};
type Row = ({ kind: "member" } & Team["members"][number]) | ({ kind: "invitation" } & Team["invitations"][number]);

const ROLE_ORDER: PartnerRole[] = ["owner", "admin", "member"];

function RoleOptions({ roles, value, onChange }: { roles: PartnerRole[]; value: PartnerRole; onChange: (role: PartnerRole) => void }) {
  const { t } = useTranslation("partner");
  const id = useId();
  return (
    <div aria-label={t("team.invite.roleLabel")} className="flex flex-col gap-3" role="radiogroup">
      {roles.map((role) => {
        const selected = value === role;
        return (
          <button aria-checked={selected} aria-describedby={`${id}-${role}-help`} aria-labelledby={`${id}-${role}`} className="flex w-full items-start gap-3 py-1 text-left" key={role} onClick={() => onChange(role)} role="radio" type="button">
            <span className={cn("mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border", selected ? "border-foreground" : "border-muted-foreground")}>{selected ? <span className="size-2 rounded-full bg-foreground" /> : null}</span>
            <span className="flex min-w-0 flex-col gap-1">
              <span className="text-sm font-medium" id={`${id}-${role}`}>{t(`roles.${role}`)}</span>
              <span className="text-sm leading-6 text-muted-foreground" id={`${id}-${role}-help`}>{t(`team.invite.roles.${role}`)}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * The console's Team page. Owners and admins invite people, change roles and
 * remove them; only owners see what touches the owner role. Members see the
 * team with no controls. The server enforces the same rules.
 */
export function PartnerTeamSurface() {
  const { t, i18n } = useTranslation("partner");
  const partner = useConsolePartner();
  const queryClient = useQueryClient();
  const queryKey = ["partner-team", partner.partnerId];
  const team = useQuery({ queryKey, queryFn: () => requestJson<Team>(`/api/partner/team?partnerId=${encodeURIComponent(partner.partnerId)}`) });
  const role = team.data?.role ?? partner.role;
  const canManage = role === "owner" || role === "admin";
  const isOwner = role === "owner";
  const invitableRoles = ROLE_ORDER.filter((option) => isOwner || option !== "owner");

  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<PartnerRole>("member");
  const [inviteError, setInviteError] = useState<string | null>(null);

  const rows = useMemo<Row[]>(() => [
    ...(team.data?.members ?? []).map((member) => ({ kind: "member" as const, ...member })),
    ...(team.data?.invitations ?? []).map((invitation) => ({ kind: "invitation" as const, ...invitation })),
  ], [team.data]);
  const formatDate = (value: string) => new Intl.DateTimeFormat(intlLocale(i18n.language), { dateStyle: "medium" }).format(new Date(value));
  const refresh = async () => { await queryClient.invalidateQueries({ queryKey }); };
  const body = (input: Record<string, unknown>) => JSON.stringify({ partnerId: partner.partnerId, ...input });

  const invite = useMutation({
    mutationFn: () => requestJson("/api/partner/team", { method: "POST", body: body({ email: email.trim(), role: inviteRole }) }),
    onSuccess: async () => {
      await refresh();
      toast.success(t("team.invite.sent", { email: email.trim() }));
      setEmail("");
      setInviteRole("member");
      setInviteOpen(false);
    },
    onError: (error: Error & { code?: string }) => setInviteError(t(error.code === "invalid_email" ? "team.invite.errors.invalidEmail" : error.code === "rate_limited" ? "team.invite.errors.rateLimited" : "team.invite.errors.failed")),
  });
  const changeRole = useMutation({
    mutationFn: (input: { memberId: string; role: PartnerRole }) => requestJson("/api/partner/team", { method: "PATCH", body: body(input) }),
    onSuccess: refresh,
    onError: (error: Error & { code?: string }) => toast.error(t(error.code === "final_owner" ? "team.errors.finalOwner" : "team.errors.changeFailed")),
  });
  const remove = useMutation({
    mutationFn: (input: { memberId: string } | { invitationId: string }) => requestJson("/api/partner/team", { method: "DELETE", body: body(input) }),
    onSuccess: refresh,
    onError: (error: Error & { code?: string }, input) => toast.error(t(error.code === "final_owner" ? "team.errors.finalOwner" : "memberId" in input ? "team.errors.removeFailed" : "team.errors.revokeFailed")),
  });
  const busy = changeRole.isPending || remove.isPending;
  // Making someone an owner, or removing someone, asks first: an owner can then do everything, deleting the partner included.
  // The dialog keeps what it asked while it closes, rather than flashing an empty name.
  const [shown, setShown] = useState<{ kind: "owner" | "remove"; memberId: string; email: string } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const confirm = (next: { kind: "owner" | "remove"; memberId: string; email: string }) => { setShown(next); setConfirmOpen(true); };

  const inviteDialog = canManage ? (
    <Dialog onOpenChange={(open) => { setInviteOpen(open); setInviteError(null); }} open={inviteOpen}>
      <DialogTrigger render={<Button disabled={team.isLoading} size="sm" />}>{t("team.invite.action")}</DialogTrigger>
      <DialogContent>
        <form className="flex flex-col gap-6" onSubmit={(event) => { event.preventDefault(); if (!invite.isPending && email.trim()) { setInviteError(null); invite.mutate(); } }}>
          <DialogHeader>
            <DialogTitle>{t("team.invite.title")}</DialogTitle>
            <DialogDescription>{t("team.invite.description", { partnerName: partner.name })}</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="partner-invite-email">{t("team.invite.emailLabel")}</FieldLabel>
              <Input autoComplete="off" id="partner-invite-email" onChange={(event) => setEmail(event.target.value)} placeholder={t("team.invite.emailPlaceholder")} type="email" value={email} />
            </Field>
            <Field>
              <FieldLabel>{t("team.invite.roleLabel")}</FieldLabel>
              <RoleOptions onChange={setInviteRole} roles={invitableRoles} value={inviteRole} />
            </Field>
          </FieldGroup>
          {inviteError ? <p className="text-sm text-destructive" role="alert">{inviteError}</p> : null}
          <DialogFooter>
            <Button disabled={invite.isPending || !email.trim()} loading={invite.isPending} loadingLabel={t("team.invite.sending")} type="submit">{t("team.invite.submit")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  ) : undefined;

  function rowActions(row: Row) {
    if (!canManage) return null;
    if (row.kind === "invitation") {
      if (row.role === "owner" && !isOwner) return null;
      return [<DropdownMenuItem key="revoke" onClick={() => remove.mutate({ invitationId: row.invitationId })} variant="destructive"><Trash2 />{t("team.actions.revoke")}</DropdownMenuItem>];
    }
    // Anything that touches the owner role is an owner's to do.
    if (row.role === "owner" && !isOwner) return null;
    const roles = ROLE_ORDER.filter((option) => option !== row.role && (isOwner || option !== "owner"));
    const labels: Record<PartnerRole, string> = { owner: t("team.actions.makeOwner"), admin: t("team.actions.makeAdmin"), member: t("team.actions.makeMember") };
    return [
      ...roles.map((option) => <DropdownMenuItem key={option} onClick={() => option === "owner" ? confirm({ kind: "owner", memberId: row.memberId, email: row.email }) : changeRole.mutate({ memberId: row.memberId, role: option })}>{option === "member" ? <UserRound /> : <ShieldCheck />}{labels[option]}</DropdownMenuItem>),
      <DropdownMenuSeparator key="separator" />,
      <DropdownMenuItem key="remove" onClick={() => confirm({ kind: "remove", memberId: row.memberId, email: row.email })} variant="destructive"><Trash2 />{t("team.actions.remove")}</DropdownMenuItem>,
    ];
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader actions={inviteDialog} title={t("team.title")} />
      <Surface className="overflow-hidden p-0">
        {team.isLoading ? (
          <div className="flex flex-col gap-4 p-6"><Skeleton className="h-5 w-40" /><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
        ) : team.isError ? (
          <p className="px-6 py-8 text-sm text-muted-foreground" role="alert">{t("team.loadFailed")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="h-12 px-6 text-sm font-medium text-foreground">{t("team.table.person")}</TableHead>
                <TableHead className="h-12 px-6 text-sm font-medium text-foreground">{t("team.table.role")}</TableHead>
                {canManage ? <TableHead className="w-12 px-6" /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const actions = rowActions(row);
                const expired = row.kind === "invitation" && new Date(row.expiresAt) <= new Date();
                return (
                  <TableRow className="hover:bg-transparent" key={row.kind === "member" ? row.memberId : row.invitationId}>
                    <TableCell className="px-6 py-5 whitespace-normal [overflow-wrap:anywhere]">
                      <div className="flex flex-col gap-1">
                        <p className="ph-mask text-sm">{row.kind === "member" && row.name ? `${row.name} · ${row.email}` : row.email}</p>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm text-muted-foreground">{t(row.kind === "member" ? "team.joinedOn" : "team.invitedOn", { date: formatDate(row.kind === "member" ? row.joinedAt : row.invitedAt) })}</p>
                          {row.kind === "invitation" ? <Badge className={expired ? undefined : "border-amber-200 bg-amber-100 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/20 dark:text-amber-200"} variant="outline">{t(expired ? "team.status.expired" : "team.status.pending")}</Badge> : null}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="px-6 py-5"><Badge variant="secondary">{t(`roles.${row.role}`)}</Badge></TableCell>
                    {canManage ? (
                      <TableCell className="px-6 py-5">
                        {actions ? (
                          <DropdownMenu>
                            <DropdownMenuTrigger render={<Button aria-label={t("team.actions.moreOptions", { email: row.email })} disabled={busy} size="icon-sm" variant="ghost"><MoreHorizontal /></Button>} />
                            <DropdownMenuContent align="end">{actions}</DropdownMenuContent>
                          </DropdownMenu>
                        ) : null}
                      </TableCell>
                    ) : null}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Surface>
      <ConfirmActionDialog
        cancelLabel={t("team.confirm.cancel")}
        confirmLabel={t(shown?.kind === "remove" ? "team.confirm.removeAction" : "team.confirm.ownerAction")}
        confirmVariant={shown?.kind === "remove" ? "destructive" : "default"}
        description={t(shown?.kind === "remove" ? "team.confirm.removeDescription" : "team.confirm.ownerDescription", { email: shown?.email ?? "", partnerName: partner.name })}
        onConfirm={() => {
          if (!shown) return;
          if (shown.kind === "remove") remove.mutate({ memberId: shown.memberId });
          else changeRole.mutate({ memberId: shown.memberId, role: "owner" });
          setConfirmOpen(false);
        }}
        onOpenChange={setConfirmOpen}
        open={confirmOpen}
        pending={busy}
        title={t(shown?.kind === "remove" ? "team.confirm.removeTitle" : "team.confirm.ownerTitle", { email: shown?.email ?? "" })}
      />
    </div>
  );
}
