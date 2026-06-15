import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Field,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { Surface } from "@/components/ui/surface";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@/components/ui/item";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { isValidEmailAddress } from "@/lib/auth-validation";
import { useObservedAction, useObservedMutation } from "@/lib/observed-convex";

type SettingsBusinessPageProps = {
  businessId: Id<"businesses">;
  canManageTenant: boolean;
};

type InviteRole = "viewer" | "business_admin";

type TeamMemberRow = {
  membershipId: Id<"business_memberships">;
  userId: Id<"users">;
  role: string;
  status: string;
  name: string | null;
  email: string | null;
};

type PendingInvitationRow = {
  invitationId: Id<"business_invitations">;
  email: string;
  role: string;
  status: string;
  expirationTime: number;
  invitedAt: number;
};

function formatRoleLabel(role: string, t: (key: string) => string): string {
  if (role === "business_admin" || role === "business_owner" || role === "owner") {
    return t("workspaceTeam.roles.admin");
  }
  if (role === "viewer") {
    return t("workspaceTeam.roles.viewer");
  }
  return role;
}

function formatExpiration(expirationTime: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(expirationTime));
}

export function SettingsBusinessPage(props: SettingsBusinessPageProps) {
  const { t, i18n } = useTranslation("settings");
  const configuration = useQuery(api.businesses.catalog.getBusinessSettingsAccount, {
    businessId: props.businessId,
  });
  const team = useQuery(api.businesses.members.listTeam, {
    businessId: props.businessId,
  });
  const isLoadingConfigurationData = configuration === undefined;
  const isLoadingTeamData = team === undefined;
  const updateBusinessName = useObservedMutation(api.businesses.catalog.updateBusinessName);
  const sendInvitation = useObservedAction(api.businesses.members.sendInvitation);
  const resendInvitation = useObservedAction(api.businesses.members.resendInvitation);
  const revokeInvitation = useObservedMutation(api.businesses.members.revokeInvitation);
  const [businessName, setBusinessName] = useState("");
  const [isBusinessNameDialogOpen, setIsBusinessNameDialogOpen] = useState(false);
  const [businessNameStatus, setBusinessNameStatus] = useState<string | null>(null);
  const [isSavingBusinessName, setIsSavingBusinessName] = useState(false);
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<InviteRole>("viewer");
  const [isSendingInvite, setIsSendingInvite] = useState(false);
  const [pendingInvitationActionId, setPendingInvitationActionId] =
    useState<Id<"business_invitations"> | null>(null);
  const isLoadingBusinessName = isLoadingConfigurationData;
  const configuredBusinessName = configuration?.business?.name ?? "";
  const displayBusinessName = businessName || configuredBusinessName;

  useEffect(() => {
    const nextName = configuration?.business?.name;
    if (nextName !== undefined) {
      setBusinessName(nextName);
    }
  }, [configuration?.business?.name]);

  useEffect(() => {
    if (!businessNameStatus) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setBusinessNameStatus(null);
    }, 3000);

    return () => window.clearTimeout(timeoutId);
  }, [businessNameStatus]);

  async function handleBusinessNameSave(): Promise<void> {
    if (!props.canManageTenant) {
      return;
    }

    setIsSavingBusinessName(true);
    setBusinessNameStatus(null);

    try {
      const result = await updateBusinessName({
        businessId: props.businessId,
        name: businessName,
      });
      setBusinessName(result.name);
      setBusinessNameStatus(t("account.businessName.saved"));
      setIsBusinessNameDialogOpen(false);
    } finally {
      setIsSavingBusinessName(false);
    }
  }

  async function handleSendInvite(): Promise<void> {
    if (!props.canManageTenant) {
      return;
    }

    const normalizedEmail = inviteEmail.trim().toLowerCase();
    if (!isValidEmailAddress(normalizedEmail)) {
      toast.error(t("workspaceTeam.invite.errors.invalidEmail"));
      return;
    }

    setIsSendingInvite(true);
    try {
      await sendInvitation({
        businessId: props.businessId,
        email: normalizedEmail,
        role: inviteRole,
      });
      toast.success(t("workspaceTeam.invite.sent", { email: normalizedEmail }));
      setInviteEmail("");
      setInviteRole("viewer");
      setIsInviteDialogOpen(false);
    } catch {
      toast.error(t("workspaceTeam.invite.errors.failed"));
    } finally {
      setIsSendingInvite(false);
    }
  }

  async function handleResendInvitation(
    invitationId: Id<"business_invitations">,
  ): Promise<void> {
    setPendingInvitationActionId(invitationId);
    try {
      await resendInvitation({
        businessId: props.businessId,
        invitationId,
      });
      toast.success(t("workspaceTeam.pending.resendSuccess"));
    } catch {
      toast.error(t("workspaceTeam.pending.resendFailed"));
    } finally {
      setPendingInvitationActionId(null);
    }
  }

  async function handleRevokeInvitation(
    invitationId: Id<"business_invitations">,
  ): Promise<void> {
    setPendingInvitationActionId(invitationId);
    try {
      await revokeInvitation({
        businessId: props.businessId,
        invitationId,
      });
      toast.success(t("workspaceTeam.pending.revokeSuccess"));
    } catch {
      toast.error(t("workspaceTeam.pending.revokeFailed"));
    } finally {
      setPendingInvitationActionId(null);
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="w-full">
        <ItemGroup spacing="section">
          <Item variant="outline">
            <ItemContent>
              <ItemTitle>{t("account.businessName.label")}</ItemTitle>
              <ItemDescription>{t("account.businessName.description")}</ItemDescription>
              {isLoadingBusinessName ? (
                <Skeleton className="h-6 w-48 max-w-full" />
              ) : (
                <p className="text-[15px] leading-6 text-foreground">
                  {displayBusinessName}
                </p>
              )}
              {businessNameStatus ? <ItemDescription>{businessNameStatus}</ItemDescription> : null}
            </ItemContent>
            {props.canManageTenant ? (
              <ItemActions>
                <Dialog
                  onOpenChange={(open) => {
                    setIsBusinessNameDialogOpen(open);
                    if (open) {
                      setBusinessName(configuredBusinessName || businessName);
                    }
                  }}
                  open={isBusinessNameDialogOpen}
                >
                  <DialogTrigger
                    render={<Button disabled={isLoadingBusinessName} size="sm" variant="outline" />}
                  >
                    {t("account.actions.change")}
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>{t("account.businessName.label")}</DialogTitle>
                      <DialogDescription>{t("account.businessName.description")}</DialogDescription>
                    </DialogHeader>

                    <FieldGroup>
                      <Field>
                        <FieldLabel htmlFor="profile-username">
                          {t("account.businessName.label")}
                        </FieldLabel>
                        <Input
                          id="profile-username"
                          onChange={(event) => {
                            setBusinessName(event.target.value);
                            setBusinessNameStatus(null);
                          }}
                          placeholder={t("account.businessName.placeholder")}
                          value={businessName}
                        />
                      </Field>
                    </FieldGroup>

                    <DialogFooter>
                      <Button
                        disabled={isSavingBusinessName}
                        onClick={() => void handleBusinessNameSave()}
                        type="button"
                      >
                        {isSavingBusinessName
                          ? t("account.businessName.saving")
                          : t("account.businessName.save")}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </ItemActions>
            ) : null}
          </Item>

          <Item variant="outline">
            <ItemContent>
              <ItemTitle>{t("workspaceTeam.members.title")}</ItemTitle>
              <ItemDescription>{t("workspaceTeam.members.description")}</ItemDescription>
            </ItemContent>
            {props.canManageTenant ? (
              <ItemActions>
                <Dialog onOpenChange={setIsInviteDialogOpen} open={isInviteDialogOpen}>
                  <DialogTrigger
                    render={<Button disabled={isLoadingTeamData} size="sm" variant="outline" />}
                  >
                    {t("workspaceTeam.invite.action")}
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>{t("workspaceTeam.invite.title")}</DialogTitle>
                      <DialogDescription>{t("workspaceTeam.invite.description")}</DialogDescription>
                    </DialogHeader>

                    <FieldGroup>
                      <Field>
                        <FieldLabel htmlFor="invite-email">
                          {t("workspaceTeam.invite.emailLabel")}
                        </FieldLabel>
                        <Input
                          autoComplete="email"
                          id="invite-email"
                          onChange={(event) => setInviteEmail(event.target.value)}
                          placeholder={t("workspaceTeam.invite.emailPlaceholder")}
                          type="email"
                          value={inviteEmail}
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="invite-role">
                          {t("workspaceTeam.invite.roleLabel")}
                        </FieldLabel>
                        <NativeSelect
                          id="invite-role"
                          onChange={(event) =>
                            setInviteRole(event.target.value as InviteRole)
                          }
                          value={inviteRole}
                        >
                          <NativeSelectOption value="viewer">
                            {t("workspaceTeam.roles.viewer")}
                          </NativeSelectOption>
                          <NativeSelectOption value="business_admin">
                            {t("workspaceTeam.roles.admin")}
                          </NativeSelectOption>
                        </NativeSelect>
                      </Field>
                    </FieldGroup>

                    <DialogFooter>
                      <Button
                        disabled={isSendingInvite}
                        onClick={() => void handleSendInvite()}
                        type="button"
                      >
                        {isSendingInvite
                          ? t("workspaceTeam.invite.sending")
                          : t("workspaceTeam.invite.submit")}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </ItemActions>
            ) : null}
          </Item>

          <Surface className="overflow-hidden p-0">
            {isLoadingTeamData ? (
              <div className="space-y-4 p-6">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : (
              <Table>
                <TableHeader className="bg-transparent">
                  <TableRow className="border-b border-border hover:bg-transparent">
                    <TableHead className="h-12 px-6 align-middle text-sm font-medium text-foreground">
                      {t("workspaceTeam.members.table.name")}
                    </TableHead>
                    <TableHead className="h-12 px-6 align-middle text-sm font-medium text-foreground">
                      {t("workspaceTeam.members.table.email")}
                    </TableHead>
                    <TableHead className="h-12 px-6 align-middle text-sm font-medium text-foreground">
                      {t("workspaceTeam.members.table.role")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {team.members.length === 0 ? (
                    <TableRow className="hover:bg-transparent">
                      <TableCell
                        className="px-6 py-8 text-sm text-muted-foreground"
                        colSpan={3}
                      >
                        {t("workspaceTeam.members.empty")}
                      </TableCell>
                    </TableRow>
                  ) : (
                    team.members.map((member: TeamMemberRow) => (
                      <TableRow
                        className="border-b border-border last:border-b-0 hover:bg-transparent"
                        key={member.membershipId}
                      >
                        <TableCell className="px-6 py-5 text-sm text-foreground">
                          {member.name ?? t("workspaceTeam.members.unnamed")}
                        </TableCell>
                        <TableCell className="px-6 py-5 text-sm text-muted-foreground">
                          {member.email ?? t("workspaceTeam.members.noEmail")}
                        </TableCell>
                        <TableCell className="px-6 py-5">
                          <Badge variant="secondary">
                            {formatRoleLabel(member.role, t)}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
          </Surface>

          {props.canManageTenant ? (
            <Surface className="overflow-hidden p-0">
              <div className="border-b border-border px-6 py-5">
                <h3 className="text-sm font-medium text-foreground">
                  {t("workspaceTeam.pending.title")}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("workspaceTeam.pending.description")}
                </p>
              </div>
              {isLoadingTeamData ? (
                <div className="space-y-4 p-6">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : (
                <Table>
                  <TableHeader className="bg-transparent">
                    <TableRow className="border-b border-border hover:bg-transparent">
                      <TableHead className="h-12 px-6 align-middle text-sm font-medium text-foreground">
                        {t("workspaceTeam.pending.table.email")}
                      </TableHead>
                      <TableHead className="h-12 px-6 align-middle text-sm font-medium text-foreground">
                        {t("workspaceTeam.pending.table.role")}
                      </TableHead>
                      <TableHead className="h-12 px-6 align-middle text-sm font-medium text-foreground">
                        {t("workspaceTeam.pending.table.expires")}
                      </TableHead>
                      <TableHead className="h-12 px-6 text-right align-middle text-sm font-medium text-foreground">
                        {t("workspaceTeam.pending.table.actions")}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {team.pendingInvitations.length === 0 ? (
                      <TableRow className="hover:bg-transparent">
                        <TableCell
                          className="px-6 py-8 text-sm text-muted-foreground"
                          colSpan={4}
                        >
                          {t("workspaceTeam.pending.empty")}
                        </TableCell>
                      </TableRow>
                    ) : (
                      team.pendingInvitations.map((invitation: PendingInvitationRow) => (
                        <TableRow
                          className="border-b border-border last:border-b-0 hover:bg-transparent"
                          key={invitation.invitationId}
                        >
                          <TableCell className="px-6 py-5 text-sm text-foreground">
                            {invitation.email}
                          </TableCell>
                          <TableCell className="px-6 py-5">
                            <Badge variant="outline">
                              {formatRoleLabel(invitation.role, t)}
                            </Badge>
                          </TableCell>
                          <TableCell className="px-6 py-5 text-sm text-muted-foreground">
                            {formatExpiration(invitation.expirationTime, i18n.language)}
                          </TableCell>
                          <TableCell className="px-6 py-5">
                            <div className="flex justify-end gap-2">
                              <Button
                                disabled={pendingInvitationActionId === invitation.invitationId}
                                onClick={() =>
                                  void handleResendInvitation(invitation.invitationId)
                                }
                                size="sm"
                                type="button"
                                variant="outline"
                              >
                                {t("workspaceTeam.pending.resend")}
                              </Button>
                              <Button
                                disabled={pendingInvitationActionId === invitation.invitationId}
                                onClick={() =>
                                  void handleRevokeInvitation(invitation.invitationId)
                                }
                                size="sm"
                                type="button"
                                variant="outline"
                              >
                                {t("workspaceTeam.pending.revoke")}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              )}
            </Surface>
          ) : null}
        </ItemGroup>
      </div>
    </div>
  );
}
